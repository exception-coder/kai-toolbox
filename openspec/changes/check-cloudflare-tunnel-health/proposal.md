# Cloudflare 隧道自动检查

## 目标

现有 `node forge.mjs tunnel status` 只报告 PM2 进程，无法判断公网首页与 API 是否回源。增加只读的自动探测，并提供适合脚本使用的非零退出码。

## 范围

复用项目已有 `scripts/runtime/tunnel.mjs` 和命名隧道配置。启动、登录、远端 DNS 与凭据管理保持原边界；不引入后台循环、自动重启或新的部署服务。
