# Node Cloudflare 隧道入口

旧 PowerShell 隧道脚本只能在 Windows 运行，包含强杀进程及缺凭证时删除远端隧道的逻辑。将本地隧道控制迁移到 Forge Node CLI，复用现有 Cloudflare 配置，提供临时地址与固定域名模式。不自动变更凭证、DNS 或业务服务。
