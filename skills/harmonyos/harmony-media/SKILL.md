---
name: harmony-media
description: "HarmonyOS 多媒体：图片编解码、AVPlayer 音视频播放、AVRecorder 录制、相机、媒体库。"
tech_stack: [harmonyos, mobile-native]
language: [arkts]
capability: [media-processing, native-device]
---

# HarmonyOS 多媒体

> 来源：https://developer.huawei.com/consumer/cn/doc/harmonyos-references/arkts-apis-media-avplayer  
> 来源：https://developer.huawei.com/consumer/cn/doc/harmonyos-references/js-apis-photoaccesshelper  
> 版本基准：HarmonyOS 5 / API 12+

## 用途

提供端侧多媒体能力：图片编解码（PixelMap）、音视频播放（AVPlayer）、音视频录制（AVRecorder）、相机拍照/录像（CameraKit）、媒体库资源访问（photoAccessHelper）。

## 何时使用

- 播放本地/网络音频或视频（音乐、短视频、直播流）
- 录制音频或视频（语音备忘录、视频通话）
- 拍照或相机预览（证件扫描、人脸识别前置）
- 读取/保存图片到系统相册
- 图片格式转换、缩放、裁剪（头像处理、缩略图生成）

## 权限声明

在 `module.json5` 的 `requestPermissions` 中声明，敏感权限需动态申请：

| 权限 | 用途 | 授权方式 |
|------|------|----------|
| `ohos.permission.CAMERA` | 相机拍照/录像 | 动态申请 |
| `ohos.permission.MICROPHONE` | 音频录制（AVRecorder） | 动态申请 |
| `ohos.permission.READ_IMAGEVIDEO` | 读取媒体库图片/视频 | 动态申请 |
| `ohos.permission.WRITE_IMAGEVIDEO` | 写入媒体库图片/视频 | 动态申请 |

```json
// module.json5
"requestPermissions": [
  { "name": "ohos.permission.CAMERA" },
  { "name": "ohos.permission.MICROPHONE" },
  { "name": "ohos.permission.READ_IMAGEVIDEO" },
  { "name": "ohos.permission.WRITE_IMAGEVIDEO" }
]
```

## 图片处理（@ohos.multimedia.image）

### 解码：文件/Buffer -> PixelMap

```typescript
import { image } from '@kit.ImageKit';

// 从 rawfile 解码
const resourceMgr = getContext().resourceManager;
const fileData = await resourceMgr.getRawFileContent('photo.jpg');
const buffer = fileData.buffer.slice(0);
const imageSource = image.createImageSource(buffer);
const pixelMap = await imageSource.createPixelMap({
  editable: true,
  desiredSize: { width: 800, height: 600 }  // 可选：指定目标尺寸
});
imageSource.release();
```

### 编码：PixelMap -> 文件/Buffer

```typescript
const packer = image.createImagePacker();
const packOpts: image.PackingOption = {
  format: 'image/jpeg',  // 支持 image/jpeg | image/png | image/webp
  quality: 90             // 0-100，仅 JPEG/WebP 生效
};
const packedData: ArrayBuffer = await packer.packing(pixelMap, packOpts);
packer.release();
```

### 关键 API

| API | 说明 |
|-----|------|
| `image.createImageSource(uri \| buffer \| fd)` | 创建图片源 |
| `imageSource.createPixelMap(decodingOpts?)` | 解码为 PixelMap |
| `image.createImagePacker()` | 创建编码器 |
| `packer.packing(pixelMap, packingOpts)` | 编码为 ArrayBuffer |
| `pixelMap.getImageInfo()` | 获取宽高、像素格式等 |
| `pixelMap.readPixelsToBuffer()` | 读取原始像素数据 |
| `pixelMap.crop(region)` / `pixelMap.scale()` / `pixelMap.rotate()` | 图像变换 |

> 用完必须调用 `release()` 释放 ImageSource、PixelMap、ImagePacker，否则内存泄漏。

## 音视频播放（AVPlayer）

### 状态机（核心）

AVPlayer 采用严格状态机驱动，方法调用必须在正确状态下执行：

```
idle ──(设置 url/fdSrc)──> initialized ──(prepare)──> prepared
                                                        │
                          ┌────────(play)────────────────┘
                          v
                       playing <──(play)── paused
                          │                   ^
                          ├──(pause)──────────┘
                          ├──(播放结束)──> completed ──(play)──> playing
                          │                   │
                          └───(stop)──────────┴──(stop)──> stopped
                                                              │
                          idle <──────(reset)─────────────────┘
                          released <──(release)── [任意状态]
```

**状态流转规则**：

1. **idle** - 创建后或 `reset()` 后，此时设置 `url` 或 `fdSrc`
2. **initialized** - 设置资源后自动进入，可设置 `surfaceId`（视频）
3. **prepared** - 调用 `prepare()` 后进入，播放引擎就绪
4. **playing** - 调用 `play()` 进入，支持 `seek()` / `setSpeed()`
5. **paused** - 调用 `pause()` 进入，可 `play()` 恢复
6. **completed** - 播放结束自动进入（非循环模式），可 `play()` 重播
7. **stopped** - 调用 `stop()` 进入，需 `prepare()` 重新准备或 `reset()`
8. **released** - 调用 `release()` 销毁实例，不可逆

### 基础用法（音频）

```typescript
import { media } from '@kit.MediaKit';

const avPlayer = await media.createAVPlayer();

avPlayer.on('stateChange', (state: string) => {
  switch (state) {
    case 'initialized':
      avPlayer.prepare();
      break;
    case 'prepared':
      avPlayer.play();
      break;
    case 'completed':
      avPlayer.reset();  // 或 avPlayer.release()
      break;
  }
});
avPlayer.on('error', (err) => {
  console.error(`AVPlayer error: ${err.message}`);
  avPlayer.reset();
});

avPlayer.url = 'https://example.com/audio.mp3';  // 触发 idle -> initialized
```

### 视频播放（需 XComponent 提供 surfaceId）

```typescript
// 页面中声明 XComponent
XComponent({ id: 'video', type: XComponentType.SURFACE, controller: this.xController })
  .onLoad(() => {
    this.surfaceId = this.xController.getXComponentSurfaceId();
  })

// 在 stateChange 的 initialized 中设置
avPlayer.on('stateChange', (state: string) => {
  if (state === 'initialized') {
    avPlayer.surfaceId = this.surfaceId;  // 视频必须设置
    avPlayer.prepare();
  }
});
```

### 关键 API

| 属性/方法 | 说明 |
|-----------|------|
| `url` / `fdSrc` | 设置播放源（网络 URL 或文件描述符） |
| `surfaceId` | 视频渲染表面 ID（从 XComponent 获取） |
| `prepare()` / `play()` / `pause()` / `stop()` | 播放控制 |
| `seek(timeMs, mode?)` | 跳转（仅 prepared/playing/paused/completed） |
| `setSpeed(speed)` | 倍速（PlaybackSpeed 枚举） |
| `reset()` | 重置到 idle（切换资源时使用） |
| `release()` | 销毁实例 |
| `on('stateChange')` | 状态变更回调 |
| `on('timeUpdate')` | 播放进度回调（毫秒） |
| `on('seekDone')` / `on('speedDone')` | seek/倍速完成回调 |
| `loop` | 设置循环播放 |
| `currentTime` / `duration` | 当前时间 / 总时长（只读） |

## 音视频录制（AVRecorder）

### 状态机

```
idle ──(prepare)──> prepared ──(start)──> started
                                           │  ^
                                  (pause)──┘  └──(resume)
                                           v
                                         paused
started/paused ──(stop)──> stopped ──(reset)──> idle
[任意状态] ──(release)──> released
```

### 基础用法（音频录制）

```typescript
import { media } from '@kit.MediaKit';
import { fileIo } from '@kit.CoreFileKit';

const ctx = getContext();
const filePath = `${ctx.filesDir}/recording.m4a`;
const file = fileIo.openSync(filePath, fileIo.OpenMode.CREATE | fileIo.OpenMode.READ_WRITE);

const avRecorder = await media.createAVRecorder();

const config: media.AVRecorderConfig = {
  audioSourceType: media.AudioSourceType.AUDIO_SOURCE_TYPE_MIC,
  profile: {
    audioBitrate: 128000,
    audioChannels: 2,
    audioCodec: media.CodecMimeType.AUDIO_AAC,
    audioSampleRate: 48000,
    fileFormat: media.ContainerFormatType.CFT_MPEG_4
  },
  url: `fd://${file.fd}`
};

await avRecorder.prepare(config);
await avRecorder.start();
// ... 录制中 ...
await avRecorder.stop();
await avRecorder.release();
fileIo.closeSync(file);
```

### 视频录制配置（需配合 CameraKit）

```typescript
const config: media.AVRecorderConfig = {
  audioSourceType: media.AudioSourceType.AUDIO_SOURCE_TYPE_MIC,
  videoSourceType: media.VideoSourceType.VIDEO_SOURCE_TYPE_SURFACE_YUV,
  profile: {
    audioBitrate: 128000,
    audioChannels: 2,
    audioCodec: media.CodecMimeType.AUDIO_AAC,
    audioSampleRate: 48000,
    fileFormat: media.ContainerFormatType.CFT_MPEG_4,
    videoBitrate: 5000000,
    videoCodec: media.CodecMimeType.VIDEO_AVC,
    videoFrameWidth: 1920,
    videoFrameHeight: 1080,
    videoFrameRate: 30
  },
  url: `fd://${file.fd}`
};
```

## 相机（@ohos.multimedia.camera）

### 核心流程

```
获取 CameraManager -> 查询设备列表 -> 创建 CameraInput
  -> 创建输出流 (Preview / Photo / Video)
  -> 创建 CaptureSession -> 配置并启动会话 -> 拍照/录像 -> 释放
```

### 拍照示例

```typescript
import { camera } from '@kit.CameraKit';

const cameraManager = camera.getCameraManager(getContext());
const cameras = cameraManager.getSupportedCameras();
const cameraInput = cameraManager.createCameraInput(cameras[0]);
await cameraInput.open();

// 获取输出能力
const capability = cameraManager.getSupportedOutputCapability(cameras[0]);
const previewProfile = capability.previewProfiles[0];
const photoProfile = capability.photoProfiles[0];

// 创建输出
const previewOutput = cameraManager.createPreviewOutput(previewProfile, surfaceId);
const photoOutput = cameraManager.createPhotoOutput(photoProfile);

// 创建并配置会话
const session = cameraManager.createSession(camera.SceneMode.NORMAL_PHOTO);
session.beginConfig();
session.addInput(cameraInput);
session.addOutput(previewOutput);
session.addOutput(photoOutput);
await session.commitConfig();
await session.start();

// 拍照
const captureSettings: camera.PhotoCaptureSetting = { quality: camera.QualityLevel.QUALITY_LEVEL_HIGH };
await photoOutput.capture(captureSettings);
```

### 关键 API

| API | 说明 |
|-----|------|
| `camera.getCameraManager(context)` | 获取相机管理器 |
| `getSupportedCameras()` | 获取设备相机列表 |
| `getSupportedOutputCapability(camera)` | 查询输出能力（预览/拍照/录像 Profile） |
| `createCameraInput()` / `open()` | 创建并打开相机输入 |
| `createPreviewOutput(profile, surfaceId)` | 创建预览输出 |
| `createPhotoOutput(profile)` | 创建拍照输出 |
| `createSession(sceneMode)` | 创建会话 |
| `session.beginConfig()` / `commitConfig()` / `start()` | 配置并启动会话 |
| `photoOutput.capture(settings?)` | 执行拍照 |

## 媒体库（@ohos.file.photoAccessHelper）

### 查询媒体资源

```typescript
import { photoAccessHelper } from '@kit.MediaLibraryKit';

const helper = photoAccessHelper.getPhotoAccessHelper(getContext());
const fetchOpts: photoAccessHelper.FetchOptions = {
  fetchColumns: ['display_name', 'date_added', 'width', 'height'],
  predicates: new dataSharePredicates.DataSharePredicates()
};
// 可链式添加过滤条件: predicates.equalTo('media_type', photoAccessHelper.PhotoType.IMAGE)

const fetchResult = await helper.getAssets(fetchOpts);
const count = fetchResult.getCount();
if (count > 0) {
  const asset: photoAccessHelper.PhotoAsset = await fetchResult.getFirstObject();
  console.log(`文件名: ${asset.displayName}, 尺寸: ${asset.get('width')}x${asset.get('height')}`);
}
fetchResult.close();
```

### 保存图片到媒体库

```typescript
const helper = photoAccessHelper.getPhotoAccessHelper(getContext());
const uri = await helper.createAsset(photoAccessHelper.PhotoType.IMAGE, 'jpg');
const file = fileIo.openSync(uri, fileIo.OpenMode.WRITE_ONLY);
fileIo.writeSync(file.fd, imageBuffer);  // ArrayBuffer 写入
fileIo.closeSync(file);
```

### 关键 API

| API | 说明 |
|-----|------|
| `photoAccessHelper.getPhotoAccessHelper(context)` | 获取实例 |
| `helper.getAssets(fetchOptions)` | 查询图片/视频资源 |
| `helper.createAsset(type, extension)` | 创建新资源（返回 URI） |
| `fetchResult.getCount()` / `getFirstObject()` / `getAllObjects()` | 遍历结果 |
| `fetchResult.close()` | 关闭结果集（必须调用） |
| `asset.displayName` / `asset.get(column)` | 读取资源属性 |

## 常见陷阱

1. **AVPlayer 状态错误**：在错误状态调用方法会静默失败或抛异常。切换资源必须先 `reset()` 回 idle 再设置新 url，不能直接覆盖。

2. **surfaceId 时序**：视频播放时 `surfaceId` 必须在 `initialized` 状态设置（`prepare()` 之前）。XComponent 的 `onLoad` 可能晚于 `stateChange('initialized')` 回调，需做好同步等待。

3. **release() 不可逆**：调用 `release()` 后实例不可复用，需重新 `createAVPlayer()`。

4. **文件描述符格式**：AVRecorder 的 `url` 必须是 `fd://` 协议（如 `fd://35`），不接受沙箱路径。需用 `fileIo.openSync()` 获取 fd。

5. **权限时序**：CAMERA 和 MICROPHONE 必须在使用前动态申请且用户授权。未授权时 `open()` 或 `prepare()` 会报权限错误。

6. **PixelMap 内存**：大图 PixelMap 占用大量内存，处理完必须 `release()`。批量操作时注意控制并发数量。

7. **fetchResult 必须 close**：`getAssets()` 返回的 FetchResult 持有数据库游标，不调用 `close()` 会导致资源泄漏。

8. **AVRecorder 状态机严格性**：`prepare()` 只能在 idle 状态调用；在其他状态调用会报 `5400102` 错误（当前状态不支持此操作）。

9. **相机会话互斥**：同一时刻只能有一个 CaptureSession 激活。切换拍照/录像模式需 `stop()` 当前会话再重新配置。
