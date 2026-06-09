# undetected-browser sidecar

免检测浏览器旁路服务：用 [patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright)（打补丁的 Playwright）规避
`Runtime.enable` → CDP 检测（标准 Playwright 被 BOSS zpAegis 等商用反爬识别的根本破绽）。
浏览器控制全在本进程，`browser-request`（Java）通过本机 HTTP 桥接调用——Java 自带的 Playwright **不能**进控制链路，
否则 CDP 又会暴露。

## 为什么需要它

实测：标准 Playwright 打开 BOSS 直聘，`cdpConsoleDetected=true`（被检测为自动化）→ 页面被反爬潰成 about:blank。
换 patchright 后 `cdpConsoleDetected=false`，BOSS 正常加载并停住。详见
`{USER_DOCUMENTS}/ai-docs/kai-toolbox/knowledge-graph/scenarios/浏览器自动化反爬与CDP检测.md`。

## 安装

```bash
cd node-services/undetected-browser
npm install
npm run install-browser   # 下载 patchright 的 chromium（首次，约 100-170MB）
```

需要本机已装 Chrome（默认 `channel=chrome`，最隐蔽）；没有则自动回退到内置 chromium。

## 运行（通常由 Java 自动拉起，手动调试时）

```bash
node server.js
```

环境变量：

| 变量 | 默认 | 说明 |
|---|---|---|
| `BROWSER_SIDECAR_PORT` | 18092 | 监听端口（仅 127.0.0.1） |
| `BROWSER_SIDECAR_TOKEN` | 空 | 设置后所有请求需带 `X-Sidecar-Token` 头 |
| `BROWSER_SIDECAR_CHANNEL` | chrome | 浏览器渠道；空=内置 chromium |
| `BROWSER_SIDECAR_HEADLESS` | false | 默认有头（扫码登录需可见窗口） |
| `BROWSER_SIDECAR_DATA_DIR` | `~/.kai-toolbox/browser-request` | 每会话持久 profile 存放根目录 |

## HTTP 接口（Phase 1）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 存活 + 引擎信息 + 已开会话 |
| POST | `/sessions/{id}/open` `{url}` | 有头打开持久会话并导航；已开则复用并导航 |
| GET | `/sessions/{id}/pages` | 当前所有页签 URL（区分 tracked/崩溃/正常） |
| POST | `/sessions/{id}/save` `{path?}` | 导出 storageState（登录态）到文件 |
| POST | `/sessions/{id}/close` | 关闭会话窗口 |
| POST | `/sessions/{id}/clear` | 关闭并删除持久 profile（登出） |

Phase 1 仅会话生命周期（开/保活/页签/存登录态/清除/关闭）。录制/回放后续阶段再迁。
