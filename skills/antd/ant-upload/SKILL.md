---
name: ant-upload
description: "Ant Design Upload 组件文档与用法。文件选择上传和拖拽上传控件。Use when building React + antd web apps and need to implement Upload."
component: Upload
group: 数据录入
applies_to:
  markers_any:
    - "dependency: antd"
tech_stack: [antd]
---

# Upload（上传）

> 来源：https://ant.design/components/upload-cn

## 用途

文件选择上传和拖拽上传控件。

## 何时使用

上传是将信息（网页、文字、图片、视频等）通过网页或者上传工具发布到远程服务器上的过程。
- 当需要上传一个或一些文件时。
- 当需要展现上传的进度时。
- 当需要使用拖拽交互时。

## 基础用法

```tsx
import React from 'react';
import { UploadOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { Button, message, Upload } from 'antd';

const props: UploadProps = {
  name: 'file',
  action: 'https://660d2bd96ddfa2943b33731c.mockapi.io/api/upload',
  headers: {
    authorization: 'authorization-text',
  },
  onChange(info) {
    if (info.file.status !== 'uploading') {
      console.log(info.file, info.fileList);
// ...
```

## 关键 API（摘要）

- `action`：上传的地址
- `beforeUpload`：上传文件之前的钩子，参数为上传的文件，若返回 `false` 则停止上传。支持返回一个 Promise 对象，Pr…
- `customRequest`：通过覆盖默认的上传行为，可以自定义自己的上传实现
- `classNames`：用于自定义组件内部各语义化结构的 class，支持对象或函数
- `data`：上传所需额外参数或返回上传额外参数的方法
- `defaultFileList`：默认已经上传的文件列表

## 组合提示

通常与 `Form`、`Progress`、`Modal` 搭配使用。
