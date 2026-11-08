# Markdown 图床

## 决策

入口复用“内容工具 → 图床”，不新增全局菜单。适用 NAV-01、NAV-03、CTX-01、FEED-01、EVID-01、IDEM-01，无例外。用户选择配置、保存，然后显式上传自己的图片；列表和草稿在局部失败后保留，手机工具栏换行而非横向挤压。上传成功只证明存储服务接纳，不能证明同事可读。

后端归属 tool-doc-viewer 的 imagehost 子域，前端归属 content-tools。配置和上传回执按已认证 userId 隔离；菜单授权沿用内容工具。密钥通过 common 的 ResourceCredentialCipher 端口加密，宿主复用现有 ops 实现，无模块间依赖、明文回传或浏览器持久保存。编辑时空密钥表示保留；切换提供方不得沿用旧密钥。

OSS 使用官方 Java SDK 3.18.4，S3 使用官方 AWS Java SDK v2 2.46.21，GitHub 使用固定 api.github.com Contents API，固定 raw.githubusercontent.com 读地址或用户明确配置的 HTTPS 读域名。不实现签名算法，不托管云账号。S3 endpoint 与读域名分开；只允许 HTTPS，拒绝 userinfo/query/fragment 与危险网络地址，私有 MinIO 仅能由服务端可信配置放行指定主机。配置与读地址永不包含 Token。

图片只收 PNG/JPEG/GIF/WebP，10MiB 内，检查文件头而非信任扩展名；SVG 不接收。对象名由服务端日期和请求 UUID 生成，不采用原始文件路径。上传前保存有界回执；同请求 UUID/摘要只执行一次，完成后重放返回同结果，执行中或结果未知提示核对，不自动重放。删除配置只删本地凭据，不删除远端图片。

自定义 S3 主机（包括公网 MinIO）也需通过服务端 `allowed-custom-hosts` 精确放行，普通用户不能仅保存任意 Endpoint 就向内网发送凭据或内容；AWS / R2 / OSS 官方域名采用提供方约束和地址检查。

## 依据与边界

配置新增使用客户端稳定请求 UUID，服务端与已认证 owner 共同解析为固定配置身份。浏览器 sessionStorage 只暂存该请求编号，保存成功或明确取消后清除，不保存密钥；回执丢失后重复保存复用同一记录。

- [OSS SDK](https://www.alibabacloud.com/help/en/oss/developer-reference/oss-java-sdk/)
- [AWS SDK](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/setup-project-maven.html)
- [GitHub Contents API](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents)
- [Cloudflare R2 Java 配置](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-java/)：上传禁用 aws-chunked，SDK 校验和仅保留接口必需项。

准备 SQL 上下文返回 DDL_MISSING（扫描上限）；新 SQLite 表依据仓库 SchemaInitializer 幂等约定与隔离测试建立，运行库 DDL 未核验，不执行运行库 SQL。未配置真实账号时使用隔离替身验证契约；真实上传、读者访问、目标运行版本及设备视觉保留待验收。服务重启仍需当次授权。
