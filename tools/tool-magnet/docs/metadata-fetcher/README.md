# metadata-fetcher 部署指南（远端 170.106.186.65）

为 tool-magnet 提供 .torrent 元数据回源能力。

## 架构定位

```
浏览器贴磁力
   ↓
toolbox (本机)
   ↓  GET http://170.106.186.65:9000/metadata/<HASH>
metadata-fetcher (本服务,机房带宽 + 没墙的 DHT)
   ↓  返回 .torrent 字节 (30-60s)
toolbox → aria2 addTorrent
   ↓
本机 aria2 → BT P2P → 家庭带宽 → 文件落 D:\Downloads\
```

机房只做小数据量(.torrent 几十 KB)的元数据接力，
大文件下载留给家庭带宽。**不会浪费机房磁盘空间，也不会让你被
机房流量计费坑到**。

---

## 部署步骤

### 1. 把三个文件搬上去

```bash
mkdir -p /root/metadata-fetcher && cd /root/metadata-fetcher
# 用 scp / vim 把 app.py / Dockerfile / docker-compose.yml 三个文件贴进来
```

### 2. 构建启动

```bash
docker compose up -d --build
docker compose logs -f metadata-fetcher
```

启动日志正常应看到:
```
======== Running on http://0.0.0.0:9000 ========
```

### 3. 本机自测

```bash
# health
curl -s http://127.0.0.1:9000/health
# {"ok":true}

# 实际拉一个公认能搜到的种子,比如 Ubuntu 24.04 LTS
curl -v -o ubuntu.torrent --max-time 90 \
  "http://127.0.0.1:9000/metadata/<某个真实 infohash>"

# 30-60s 内出来一个 .torrent 文件
ls -la ubuntu.torrent
file ubuntu.torrent  # → 一般显示 "data" 或 "Bencode data"
head -c 1 ubuntu.torrent | xxd  # 头一个字节应该是 'd' (0x64)
```

如果 30 秒还没回包,大概率是 DHT bootstrap 节点没连上。
在容器里跑 `docker exec -it metadata-fetcher python -c "import socket; print(socket.gethostbyname('router.bittorrent.com'))"`
看 DNS 是否正常。

### 4. 放行端口

腾讯云 / 阿里云控制台 → 安全组 → 入站规则:
- **TCP 9000** — toolbox 调 HTTP API
- **UDP 全段 (1024-65535)** — DHT 节点会从随机端口回包,封死 UDP 会让 DHT 跑不起来。如果觉得太开放,至少放行 `6881-6889` 和 `40000-65535`。

### 5. 验证从你家也能调通

本机 PowerShell:
```powershell
curl.exe -v http://170.106.186.65:9000/health
```

200 + `{"ok":true}` = 链路通,可以去配 toolbox 了。

---

## toolbox 端配置

启动 toolbox 时设环境变量,或在 `application.yml` 里直接写死。
默认配置已经指向 `http://170.106.186.65:9000`,改 IP 用环境变量:

```powershell
# 可选: 覆盖默认 mirror 地址
$env:TOOLBOX_MAGNET_METADATA_URL = "http://170.106.186.65:9000/metadata/{HASH_UPPER}"
```

启动 toolbox → `/tools/magnet` 贴磁力 → 看 spring 日志:

- `torrent cache HIT @ http://...:9000/...` = 自托管命中,直接 addTorrent
- `torrent cache MISS infoHash=...` = 服务器都没找到元数据,fallback 走 aria2 原生 DHT (家里多半也找不到)

---

## 维护

- 升级 magnet2torrent: 改 Dockerfile 里的版本号 → `docker compose up -d --build`
- 看实时日志: `docker compose logs -f metadata-fetcher`
- 重启: `docker compose restart`
- 卸载: `docker compose down`

## 常见问题

**Q: 每次都 504 timeout?**
DHT 起不来。检查:
1. 安全组 UDP 是否开;
2. 容器是不是 `network_mode: host`;
3. 容器内能否 ping 8.8.8.8、能否解析 `router.bittorrent.com`。

**Q: 部分热门种子也 404?**
小众种子的 metadata 真的可能找不到。这是 BT 本质问题,不是服务的问题。
toolbox 这边会自动 fallback 到 aria2 原生 DHT,等 aria2 自己慢慢找。

**Q: 想加访问控制?**
当前没有鉴权,任何能连到 9000 的人都能用。如果你的安全组只对自己 IP 开放,问题不大。
想加 token,改 `app.py` 里 `get_metadata` 检查 `request.headers.get('X-Token')` 即可。
