---
name: fastapi-file-storage
description: FastAPI 文件上传、流式响应、S3 预签名 URL 与自定义响应类
tech_stack: [fastapi, boto3, s3]
language: [python]
capability: [file-upload, object-storage]
version: "fastapi 0.134.0"
collected_at: 2026-04-18
---

# FastAPI 文件存储（上传 / 流式 / S3 预签名）

> 来源：https://fastapi.tiangolo.com/tutorial/request-files/ 、https://fastapi.tiangolo.com/advanced/stream-data/ 、https://docs.aws.amazon.com/boto3/latest/guide/s3-presigned-urls.html

## 用途
接收客户端上传（multipart/form-data）、流式返回大文件或 LLM 增量文本、通过 S3 预签名 URL 让前端直接与对象存储交互。

## 何时使用
- 表单上传小文件 → `bytes` + `File()`
- 大文件 / 视频 / 镜像 → `UploadFile`（磁盘溢出缓冲）
- LLM 流式输出、视频流、拼接生成 → `StreamingResponse` + `yield`
- 前端直传 S3 / 临时下载链接 → `boto3.generate_presigned_url` / `generate_presigned_post`

## 基础用法

### 文件上传
```bash
pip install python-multipart
```

```python
from typing import Annotated
from fastapi import FastAPI, File, UploadFile

@app.post("/files/")
async def create_file(file: Annotated[bytes, File()]):
    return {"size": len(file)}

@app.post("/upload/")
async def upload(file: UploadFile):
    return {"filename": file.filename, "type": file.content_type}

@app.post("/multi/")
async def multi(files: list[UploadFile]):
    return {"names": [f.filename for f in files]}
```

### 流式响应（FastAPI 0.134.0+ 支持 yield）
```python
from collections.abc import AsyncIterable
from fastapi.responses import StreamingResponse

@app.get("/stream", response_class=StreamingResponse)
async def stream() -> AsyncIterable[bytes]:
    for chunk in source:
        yield chunk

class PNGStreamingResponse(StreamingResponse):
    media_type = "image/png"
```

### S3 预签名 URL
```python
import boto3
from botocore.config import Config

s3 = boto3.client("s3", region_name="us-east-1",
                  config=Config(signature_version="s3v4"))

# 下载链接
url = s3.generate_presigned_url(
    "get_object",
    Params={"Bucket": "my-bucket", "Key": "obj.pdf"},
    ExpiresIn=3600,
)

# 上传 POST
post = s3.generate_presigned_post(
    "my-bucket", "obj.pdf", Fields=None, Conditions=None, ExpiresIn=3600,
)
# 前端：requests.post(post["url"], data=post["fields"], files={"file": f})
```

## 关键 API

**UploadFile**（SpooledTemporaryFile 包装）
- 属性：`filename`、`content_type`、`file`
- 异步方法：`await read(size)` / `write(data)` / `seek(offset)` / `close()`

**响应类**（`from fastapi.responses import ...`）
- `Response(content, status_code, headers, media_type)`：裸响应
- `HTMLResponse` / `PlainTextResponse` / `RedirectResponse`（默认 307）
- `StreamingResponse(generator)`：流式
- `FileResponse(path, filename=...)`：异步流文件，自动填 `Content-Length`/`Last-Modified`/`ETag`

## 注意事项
- **File + Form 不能混 JSON Body**：请求体是 multipart/form-data，不是 application/json
- **bytes 参数整体驻留内存**，大文件必须用 `UploadFile`
- **file-like 对象同步阻塞**：把路径函数改成普通 `def`，FastAPI 会放到线程池避免阻塞事件循环
- **直接 `return Response(...)` 不走 `response_model`**，也不生成 OpenAPI schema；若希望生成文档，用 `response_class=` 声明
- **S3 预签名**：必须配置 `signature_version="s3v4"` 和 bucket 所在 region
- **默认响应类**：`FastAPI(default_response_class=ORJSONResponse)` 可整体替换
- **最大 JSON 性能**：用 `response_model` 而非 `response_class`

## 组合提示
搭配 `aioboto3` 异步调用 S3；大文件走 S3 预签名绕过应用服务器带宽；流式接口配合 SSE 或 NDJSON 做 LLM 输出。
