---
name: python-video-server
description: "Python Web 服务端视频处理与分发方案：涵盖 FastAPI/Django 视频流、FFmpeg 转码、分片上传、Celery 异步任务、Nginx 分发、安全防盗链。"
tech_stack: [fastapi, django, backend]
language: [python]
capability: [media-processing, file-upload, task-scheduler]
---

# Python 服务端视频处理与分发

> 来源：FastAPI / Django / FFmpeg / Celery / Nginx 官方文档及社区最佳实践
> 适用版本：FastAPI 0.100+、Django 4.2+、ffmpeg-python 0.2.x、Celery 5.3+

## 用途

在 Python Web 服务中实现视频的上传接收、流式分发（支持 seek/拖拽）、服务端转码（HLS/多码率）、异步任务管道，以及通过 Nginx 实现高性能视频文件分发与安全防盗链。

## 何时使用

- 需要 FastAPI / Django 提供视频流式下载端点（支持拖拽进度条）
- 需要服务端 FFmpeg 转码：生成 HLS 分片、多码率自适应、截图/水印
- 需要处理大文件上传（分片上传 / Tus 协议 / S3 multipart）
- 需要 Celery 异步转码管道：上传 -> 转码 -> 存储 -> 回调
- 需要 Nginx 承担视频静态分发、MP4 伪流、X-Accel-Redirect 安全下载
- 需要签名 URL / 防盗链保护视频资源

---

## 一、FastAPI 视频流服务

### 基础流式响应

```python
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from pathlib import Path

app = FastAPI()

@app.get("/video/{filename}")
async def stream_video(filename: str):
    video_path = Path(f"./videos/{filename}")
    if not video_path.exists():
        return {"error": "not found"}

    def iter_file():
        with open(video_path, "rb") as f:
            while chunk := f.read(1024 * 1024):  # 1MB chunks
                yield chunk

    return StreamingResponse(
        iter_file(),
        media_type="video/mp4",
        headers={"Content-Length": str(video_path.stat().st_size)},
    )
```

### HTTP Range 请求（支持 seek/拖拽 -- 关键）

浏览器 `<video>` 标签通过 Range 头实现拖拽进度条，服务端必须返回 206 Partial Content。

```python
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse
from pathlib import Path

app = FastAPI()

@app.get("/video/{filename}")
async def stream_video_with_range(filename: str, request: Request):
    video_path = Path(f"./videos/{filename}")
    if not video_path.exists():
        raise HTTPException(status_code=404)

    file_size = video_path.stat().st_size
    range_header = request.headers.get("range")

    if range_header:
        # 解析 "bytes=start-end"
        range_spec = range_header.replace("bytes=", "")
        parts = range_spec.split("-")
        start = int(parts[0])
        end = int(parts[1]) if parts[1] else min(start + 1024 * 1024 - 1, file_size - 1)
        content_length = end - start + 1

        def iter_range():
            with open(video_path, "rb") as f:
                f.seek(start)
                remaining = content_length
                while remaining > 0:
                    chunk_size = min(8192, remaining)
                    data = f.read(chunk_size)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        return StreamingResponse(
            iter_range(),
            status_code=206,
            media_type="video/mp4",
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
            },
        )
    else:
        # 无 Range 头：返回完整文件
        def iter_file():
            with open(video_path, "rb") as f:
                while chunk := f.read(8192):
                    yield chunk

        return StreamingResponse(
            iter_file(),
            media_type="video/mp4",
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
            },
        )
```

### 异步文件读取（aiofiles）

```python
import aiofiles

async def iter_file_async(path: Path, start: int, length: int):
    async with aiofiles.open(path, "rb") as f:
        await f.seek(start)
        remaining = length
        while remaining > 0:
            chunk_size = min(8192, remaining)
            data = await f.read(chunk_size)
            if not data:
                break
            remaining -= len(data)
            yield data
```

**注意**：aiofiles 在 Linux 上并非真正的异步 I/O（底层用线程池），对于高并发场景，让 Nginx 直接分发静态文件更高效。

---

## 二、Django 视频流服务

### FileResponse（小文件/完整下载）

```python
from django.http import FileResponse

def download_video(request, filename):
    path = f"/data/videos/{filename}"
    return FileResponse(open(path, "rb"), content_type="video/mp4")
```

### StreamingHttpResponse + Range 请求

```python
from django.http import StreamingHttpResponse, HttpResponse
import os
import re

def stream_video(request, filename):
    path = f"/data/videos/{filename}"
    file_size = os.path.getsize(path)
    range_header = request.META.get("HTTP_RANGE", "")

    if range_header:
        match = re.match(r"bytes=(\d+)-(\d*)", range_header)
        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) else file_size - 1
        length = end - start + 1

        def file_iterator():
            with open(path, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(8192, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        response = StreamingHttpResponse(file_iterator(), status=206, content_type="video/mp4")
        response["Content-Range"] = f"bytes {start}-{end}/{file_size}"
        response["Accept-Ranges"] = "bytes"
        response["Content-Length"] = str(length)
        return response

    # 完整文件
    response = StreamingHttpResponse(
        open(path, "rb"),
        content_type="video/mp4",
    )
    response["Accept-Ranges"] = "bytes"
    response["Content-Length"] = str(file_size)
    return response
```

### django-sendfile2 + X-Accel-Redirect（推荐生产方案）

应用层只做鉴权，实际文件分发交给 Nginx：

```python
# pip install django-sendfile2

# settings.py
SENDFILE_BACKEND = "django_sendfile.backends.nginx"
SENDFILE_ROOT = "/data/videos"
SENDFILE_URL = "/protected-videos"

# views.py
from django_sendfile import sendfile

def protected_video(request, filename):
    # 鉴权逻辑
    if not request.user.has_perm("view_video"):
        return HttpResponse(status=403)
    return sendfile(request, f"/data/videos/{filename}")
```

对应 Nginx 配置见第六节。

### django-ranged-response

```python
# pip install django-ranged-response
from ranged_response import RangedFileResponse

def video_view(request, filename):
    path = f"/data/videos/{filename}"
    return RangedFileResponse(request, open(path, "rb"), content_type="video/mp4")
```

---

## 三、FFmpeg 视频转码（Python 方案）

### 方案对比

| 库 | 适用场景 | 特点 |
|---|---|---|
| `subprocess` + ffmpeg CLI | 最可控，生产推荐 | 直接构造命令行，完全掌控参数 |
| `ffmpeg-python` | 中等复杂度 | 链式 API 构造 ffmpeg 命令，可读性好 |
| `PyAV` | 低级别逐帧处理 | FFmpeg 的 Python 绑定，高性能但学习曲线陡 |
| `MoviePy` | 简单编辑/合成 | 上层封装，适合剪辑/拼接/加字幕，不适合生产转码 |

### ffmpeg-python 基础用法

```python
# pip install ffmpeg-python
import ffmpeg

# 转码为 H.264 MP4
(
    ffmpeg
    .input("input.mov")
    .output("output.mp4", vcodec="libx264", acodec="aac", crf=23)
    .overwrite_output()
    .run()
)

# 提取视频元数据
probe = ffmpeg.probe("input.mp4")
video_stream = next(s for s in probe["streams"] if s["codec_type"] == "video")
width = int(video_stream["width"])
height = int(video_stream["height"])
duration = float(probe["format"]["duration"])

# 生成缩略图
(
    ffmpeg
    .input("input.mp4", ss="00:00:05")  # 第 5 秒
    .output("thumbnail.jpg", vframes=1)
    .overwrite_output()
    .run()
)

# 添加水印
overlay = ffmpeg.input("watermark.png")
(
    ffmpeg
    .input("input.mp4")
    .overlay(overlay, x="W-w-10", y="H-h-10")  # 右下角
    .output("watermarked.mp4", vcodec="libx264", acodec="copy")
    .overwrite_output()
    .run()
)
```

### subprocess 直接调用（生产推荐）

```python
import subprocess
import json

def transcode_to_mp4(input_path: str, output_path: str) -> None:
    cmd = [
        "ffmpeg", "-i", input_path,
        "-c:v", "libx264", "-preset", "medium", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",  # 关键：将 moov atom 前置，支持边下边播
        "-y", output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg error: {result.stderr}")

def get_video_info(path: str) -> dict:
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format", "-show_streams",
        path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(result.stdout)
```

### HLS 分片生成

```python
def generate_hls(input_path: str, output_dir: str) -> None:
    """生成 HLS 分片（.m3u8 + .ts）"""
    cmd = [
        "ffmpeg", "-i", input_path,
        "-c:v", "libx264", "-preset", "medium", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-hls_time", "6",                    # 每片 6 秒
        "-hls_list_size", "0",               # 完整播放列表（非直播）
        "-hls_segment_filename", f"{output_dir}/segment_%03d.ts",
        "-f", "hls",
        f"{output_dir}/playlist.m3u8",
    ]
    subprocess.run(cmd, check=True)
```

### 自适应码率（ABR）多分辨率转码

```python
def generate_abr_hls(input_path: str, output_dir: str) -> None:
    """生成多码率 HLS（自适应流）"""
    profiles = [
        {"height": 360, "bitrate": "800k", "audio": "96k"},
        {"height": 720, "bitrate": "2500k", "audio": "128k"},
        {"height": 1080, "bitrate": "5000k", "audio": "192k"},
    ]

    master_playlist = "#EXTM3U\n"

    for p in profiles:
        variant_dir = f"{output_dir}/{p['height']}p"
        os.makedirs(variant_dir, exist_ok=True)

        cmd = [
            "ffmpeg", "-i", input_path,
            "-vf", f"scale=-2:{p['height']}",
            "-c:v", "libx264", "-b:v", p["bitrate"],
            "-c:a", "aac", "-b:a", p["audio"],
            "-hls_time", "6",
            "-hls_list_size", "0",
            "-hls_segment_filename", f"{variant_dir}/seg_%03d.ts",
            "-f", "hls",
            f"{variant_dir}/playlist.m3u8",
        ]
        subprocess.run(cmd, check=True)

        bandwidth = int(p["bitrate"].replace("k", "")) * 1000
        master_playlist += (
            f"#EXT-X-STREAM-INF:BANDWIDTH={bandwidth},"
            f"RESOLUTION={p['height'] * 16 // 9}x{p['height']}\n"
            f"{p['height']}p/playlist.m3u8\n"
        )

    with open(f"{output_dir}/master.m3u8", "w") as f:
        f.write(master_playlist)
```

---

## 四、视频上传处理

### FastAPI UploadFile（大文件流式写入）

```python
from fastapi import FastAPI, UploadFile, File
import aiofiles
from pathlib import Path

app = FastAPI()

UPLOAD_DIR = Path("/data/uploads")

@app.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    dest = UPLOAD_DIR / file.filename
    async with aiofiles.open(dest, "wb") as f:
        while chunk := await file.read(1024 * 1024):  # 1MB chunks
            await f.write(chunk)
    return {"filename": file.filename, "size": dest.stat().st_size}
```

**注意**：FastAPI 默认将小文件缓存到内存（SpooledTemporaryFile，阈值 1MB），大文件自动写入临时文件。对超大文件不要用 `await file.read()` 一次性读取。

### 分片上传（Tus 协议）

```python
# pip install tuspy  (客户端)
# 服务端：使用 tusd 独立服务或 fastapi-tusd 集成

# 客户端上传示例
from tusclient import client as tus_client

my_client = tus_client.TusClient("http://localhost:8080/files/")
uploader = my_client.uploader("large_video.mp4", chunk_size=5 * 1024 * 1024)
uploader.upload()  # 支持断点续传
```

### S3 / MinIO Multipart Upload

```python
import boto3

s3 = boto3.client(
    "s3",
    endpoint_url="http://localhost:9000",  # MinIO; 省略则用 AWS S3
    aws_access_key_id="minioadmin",
    aws_secret_access_key="minioadmin",
)

def upload_large_file(file_path: str, bucket: str, key: str):
    """使用 multipart upload 上传大文件到 S3/MinIO"""
    from boto3.s3.transfer import TransferConfig

    config = TransferConfig(
        multipart_threshold=8 * 1024 * 1024,   # 超过 8MB 启用分片
        multipart_chunksize=8 * 1024 * 1024,    # 每片 8MB
        max_concurrency=10,
    )
    s3.upload_file(file_path, bucket, key, Config=config)
```

### 流式上传到 S3（不落盘）

```python
from fastapi import UploadFile

@app.post("/upload-to-s3")
async def upload_to_s3(file: UploadFile):
    s3.upload_fileobj(
        file.file,  # SpooledTemporaryFile 实现了 read() 接口
        "my-bucket",
        f"videos/{file.filename}",
    )
    return {"key": f"videos/{file.filename}"}
```

---

## 五、Celery 异步转码管道

### 架构概览

```
客户端上传 → FastAPI/Django 接收 → 存到临时目录/S3
                                      ↓
                              Celery 任务入队
                                      ↓
                              Worker: FFmpeg 转码
                                      ↓
                              输出 HLS 分片 → 存储（S3/本地）
                                      ↓
                              回调/更新数据库状态
```

### Celery 任务定义

```python
# tasks.py
from celery import Celery
import subprocess

app = Celery("video_tasks", broker="redis://localhost:6379/0")

@app.task(bind=True, max_retries=3, default_retry_delay=60)
def transcode_video(self, input_path: str, output_dir: str, video_id: str):
    """异步转码任务"""
    try:
        # 更新状态为 "处理中"
        self.update_state(state="TRANSCODING", meta={"progress": 0})

        # 执行 FFmpeg 转码
        cmd = [
            "ffmpeg", "-i", input_path,
            "-c:v", "libx264", "-preset", "medium", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            "-hls_time", "6", "-hls_list_size", "0",
            "-hls_segment_filename", f"{output_dir}/seg_%03d.ts",
            "-f", "hls", f"{output_dir}/playlist.m3u8",
            "-y",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            raise RuntimeError(result.stderr)

        # 更新状态为完成
        return {"status": "completed", "video_id": video_id, "hls_path": f"{output_dir}/playlist.m3u8"}

    except Exception as exc:
        self.retry(exc=exc)
```

### FastAPI 集成 Celery

```python
from fastapi import FastAPI
from celery.result import AsyncResult
from tasks import transcode_video

app = FastAPI()

@app.post("/videos/{video_id}/transcode")
async def start_transcode(video_id: str):
    task = transcode_video.delay(
        input_path=f"/data/uploads/{video_id}.mp4",
        output_dir=f"/data/hls/{video_id}",
        video_id=video_id,
    )
    return {"task_id": task.id}

@app.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    result = AsyncResult(task_id)
    return {
        "task_id": task_id,
        "status": result.status,  # PENDING / TRANSCODING / SUCCESS / FAILURE
        "result": result.result if result.ready() else None,
    }
```

### FastAPI BackgroundTasks（轻量替代）

```python
from fastapi import BackgroundTasks

def run_transcode(input_path: str, output_path: str):
    """同步函数，在后台线程执行"""
    subprocess.run(["ffmpeg", "-i", input_path, ..., output_path], check=True)

@app.post("/videos/quick-transcode")
async def quick_transcode(background_tasks: BackgroundTasks):
    background_tasks.add_task(run_transcode, "input.mp4", "output.mp4")
    return {"message": "transcoding started"}
```

**BackgroundTasks vs Celery**：
- BackgroundTasks：单进程内执行，适合轻量任务（< 30 秒），无持久化，进程重启任务丢失
- Celery：独立 Worker 进程，支持重试/超时/优先级/结果持久化，适合耗时转码

---

## 六、Nginx 视频分发配置

### MP4 伪流（ngx_http_mp4_module）

```nginx
# 启用 MP4 模块（通常已内置）
location /videos/ {
    root /data;
    mp4;                        # 启用 MP4 伪流
    mp4_buffer_size 1m;
    mp4_max_buffer_size 5m;

    # 支持 Range 请求
    add_header Accept-Ranges bytes;
}
```

**作用**：客户端请求 `/videos/demo.mp4?start=30` 时，Nginx 自动计算 MP4 的 moov atom 偏移，只返回第 30 秒之后的数据，实现快速 seek 而无需下载前面的数据。

**前提**：MP4 文件必须 `moov atom` 在文件头部（使用 FFmpeg 的 `-movflags +faststart` 确保）。

### HLS 静态分发

```nginx
location /hls/ {
    root /data;
    types {
        application/vnd.apple.mpegurl m3u8;
        video/mp2t ts;
    }
    add_header Cache-Control "public, max-age=3600";
    add_header Access-Control-Allow-Origin *;
}
```

### X-Accel-Redirect（安全文件下载）

应用层鉴权 + Nginx 分发，Django/FastAPI 返回 `X-Accel-Redirect` 头，Nginx 拦截后直接分发文件：

```nginx
# Nginx 配置
location /protected-videos/ {
    internal;                    # 仅接受内部重定向，外部直接访问返回 404
    alias /data/videos/;
}

# 反向代理到 FastAPI/Django
location /api/ {
    proxy_pass http://127.0.0.1:8000;
}
```

FastAPI 端：

```python
from fastapi.responses import Response

@app.get("/api/videos/{filename}")
async def protected_video(filename: str):
    # 鉴权逻辑...
    response = Response()
    response.headers["X-Accel-Redirect"] = f"/protected-videos/{filename}"
    response.headers["Content-Type"] = "video/mp4"
    return response
```

### nginx-vod-module（Kaltura）按需转封装

```nginx
# 编译安装 nginx-vod-module 后
location /vod/ {
    vod hls;                     # 按需将 MP4 转封装为 HLS
    vod_mode local;
    alias /data/videos/;

    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Headers Range;
}
# 访问 /vod/demo.mp4/index.m3u8 即可获得 HLS 流
```

**优势**：无需预先转码为 HLS，Nginx 实时将 MP4 切片为 .ts，节省存储空间。
**限制**：仅做转封装（remux），不做转码；源文件必须是 H.264/AAC。

### 防盗链

```nginx
# Referer 检查（基础）
location /videos/ {
    valid_referers none blocked server_names *.mysite.com;
    if ($invalid_referer) {
        return 403;
    }
    root /data;
}

# secure_link HMAC 签名 URL（推荐）
location /videos/ {
    secure_link $arg_token,$arg_expires;
    secure_link_md5 "$secure_link_expires$uri$remote_addr my_secret_key";

    if ($secure_link = "") { return 403; }      # 无签名
    if ($secure_link = "0") { return 410; }      # 已过期

    root /data;
}
```

Python 端生成签名 URL：

```python
import hashlib
import base64
import time

def generate_signed_url(uri: str, remote_addr: str, secret: str, expires_seconds: int = 3600) -> str:
    expires = int(time.time()) + expires_seconds
    raw = f"{expires}{uri}{remote_addr} {secret}"
    md5_hash = hashlib.md5(raw.encode()).digest()
    token = base64.urlsafe_b64encode(md5_hash).rstrip(b"=").decode()
    return f"{uri}?token={token}&expires={expires}"
```

---

## 七、视频安全

### JWT 签名 URL

```python
import jwt
import time

SECRET = "your-secret-key"

def generate_video_token(video_id: str, user_id: str, expires_in: int = 3600) -> str:
    payload = {
        "sub": user_id,
        "video_id": video_id,
        "exp": int(time.time()) + expires_in,
    }
    return jwt.encode(payload, SECRET, algorithm="HS256")

def verify_video_token(token: str, video_id: str) -> bool:
    try:
        payload = jwt.decode(token, SECRET, algorithms=["HS256"])
        return payload["video_id"] == video_id
    except jwt.ExpiredSignatureError:
        return False
    except jwt.InvalidTokenError:
        return False
```

### FastAPI 鉴权中间件

```python
from fastapi import Depends, HTTPException, Query

async def verify_video_access(video_id: str, token: str = Query(...)):
    if not verify_video_token(token, video_id):
        raise HTTPException(status_code=403, detail="Invalid or expired token")

@app.get("/api/videos/{video_id}/stream")
async def stream_protected(video_id: str, _=Depends(verify_video_access)):
    # 返回视频流或 X-Accel-Redirect
    ...
```

### DRM 集成方向（概要）

- **Widevine**（Google）：Android / Chrome / Firefox，需要 Widevine License Server
- **FairPlay**（Apple）：Safari / iOS，需要 Apple 开发者证书
- **通用流程**：加密 HLS/DASH 内容（CENC 或 SAMPLE-AES）-> 播放器向 License Server 请求密钥 -> 解密播放
- **Python 角色**：服务端负责加密打包（FFmpeg + DRM 参数）和密钥管理 API，不直接处理解密

---

## 八、Mux Python SDK

```python
# pip install mux-python
import mux_python

configuration = mux_python.Configuration()
configuration.username = "MUX_TOKEN_ID"
configuration.password = "MUX_TOKEN_SECRET"

assets_api = mux_python.AssetsApi(mux_python.ApiClient(configuration))

# 创建 Asset（从 URL 导入）
create_request = mux_python.CreateAssetRequest(
    input=[mux_python.InputSettings(url="https://example.com/video.mp4")],
    playback_policy=[mux_python.PlaybackPolicy.PUBLIC],
)
asset = assets_api.create_asset(create_request)
playback_id = asset.data.playback_ids[0].id
# 播放地址：https://stream.mux.com/{playback_id}.m3u8

# Direct Upload（客户端直传）
uploads_api = mux_python.DirectUploadsApi(mux_python.ApiClient(configuration))
upload = uploads_api.create_direct_upload(
    mux_python.CreateUploadRequest(
        new_asset_settings=mux_python.CreateAssetRequest(
            playback_policy=[mux_python.PlaybackPolicy.PUBLIC]
        ),
        cors_origin="https://mysite.com",
    )
)
upload_url = upload.data.url  # 返回给客户端，客户端 PUT 上传

# Webhook 处理（FastAPI）
@app.post("/mux/webhook")
async def mux_webhook(request: Request):
    body = await request.json()
    event_type = body.get("type")
    if event_type == "video.asset.ready":
        asset_id = body["data"]["id"]
        # 更新数据库：视频转码完成
    return {"received": True}
```

---

## 关键 API 摘要

- `StreamingResponse(generator, status_code=206, headers={...})` -- FastAPI Range 流式响应
- `StreamingHttpResponse(iterator, status=206)` -- Django 流式响应
- `ffmpeg.input().output().run()` -- ffmpeg-python 链式转码
- `subprocess.run(["ffmpeg", ...])` -- 直接调用 FFmpeg CLI（生产推荐）
- `ffmpeg.probe(path)` -- 提取视频元数据（时长/分辨率/码率）
- `@celery_app.task(bind=True, max_retries=3)` -- Celery 异步转码任务
- `self.update_state(state=..., meta={...})` -- Celery 任务进度更新
- `BackgroundTasks.add_task(func, *args)` -- FastAPI 轻量后台任务
- `s3.upload_file(path, bucket, key, Config=config)` -- boto3 multipart 上传
- `sendfile(request, path)` -- django-sendfile2 安全文件下载

## 注意事项

- **必须支持 Range 请求**：浏览器 `<video>` 标签依赖 HTTP 206 实现拖拽 seek，不处理 Range 头会导致无法拖动进度条和移动端播放失败
- **`-movflags +faststart`**：所有供 Web 播放的 MP4 必须加此参数，将 moov atom 移到文件头，否则浏览器需下载完整文件才能开始播放
- **不要在 Python 进程内分发大文件**：生产环境用 Nginx 直接分发静态文件或 X-Accel-Redirect，Python 进程应只做鉴权和业务逻辑
- **aiofiles 非真正异步**：Linux 上 aiofiles 底层使用线程池模拟异步 I/O，高并发场景性能不如 Nginx 直接分发
- **Celery vs BackgroundTasks**：超过 30 秒的转码任务必须用 Celery（独立 Worker），BackgroundTasks 在进程重启时任务会丢失且会阻塞事件循环（同步函数在线程池中执行，但仍占用资源）
- **HLS 分片时长**：`-hls_time 6` 是常用值（6 秒），太短增加请求数，太长增加首次加载延迟
- **FFmpeg 进程安全**：永远不要将用户输入直接拼接到 FFmpeg 命令中，使用列表形式的 `subprocess.run()` 避免命令注入
- **临时文件清理**：上传和转码产生的临时文件必须有清理机制（定时任务或转码完成回调中删除）
- **Mux Webhook 验签**：生产环境应验证 Mux Webhook 的签名头（`Mux-Signature`），防止伪造回调
- **secure_link 的 `$remote_addr`**：使用客户端 IP 绑定签名 URL 会导致移动网络切换 IP 后 URL 失效，按需选择是否包含 IP

## 组合提示

- 前端播放器搭配：参考 `react-player` skill（HLS 流播放）或 `next-video` skill（Next.js 集成 Mux）
- 存储层：boto3 上传 S3/MinIO + Nginx 或 CDN 分发
- 监控：Celery Flower 监控转码任务队列、FFmpeg 进度解析（`-progress pipe:1`）
- CDN 回源：Nginx 作为源站，前面接 CloudFront / Cloudflare CDN 缓存 HLS 分片
- 数据库：视频元数据（状态、时长、分辨率、HLS 路径）存入 PostgreSQL，配合 Django ORM 或 SQLAlchemy
