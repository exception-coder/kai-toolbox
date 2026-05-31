# tool-magnet 设计文档指针

本模块的设计文档统一维护在 kai-toolbox 项目用户知识库下：

- 实施路线：本机 aria2c 子进程作为 BT 引擎，走家庭带宽下载，文件直接落在用户硬盘。
- 协议覆盖：HTTP/HTTPS、Magnet、.torrent、Metalink、FTP（aria2 全协议覆盖）。
- 提速核心：提交磁力前并发查公共 .torrent 缓存站（itorrents / torrage / btcache 等），
  命中即拿到完整 metadata 喂给 aria2 跳过 DHT 解析阶段。镜像列表在 application.yml 维护。
- 与 tool-downloader 关系：tool-downloader 专注纯 HTTP/HTTPS 大文件加速；tool-magnet 专注 P2P + 多源。
