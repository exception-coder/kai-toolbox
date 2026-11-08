## Why

Markdown 截图和绘图缺少统一上传、配置及可分享链接入口，现有会话附件不适合作为长期文档图床。

## What Changes

在内容工具中增加图床视图，支持 OSS、GitHub、S3 兼容存储的账号私有配置、默认选择、实际图片上传与 Markdown 复制。使用官方 SDK / API，复用凭据加密端口，不改变存储桶公开权限。配置保存不触发外部写入。

## Capabilities

### New Capabilities
- `markdown-image-hosting`: 配置和上传图片，生成写作可用的稳定链接。
