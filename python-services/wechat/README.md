# wechat sidecar（wxauto 微信监控 / 操作）

基于 [wxauto](https://github.com/cluic/wxauto) / wxautox 的 Windows UI 自动化 sidecar，
为 kai-toolbox 的 `tool-wechat` 模块提供「读微信消息 / 监听新消息 / 发文字」能力。

与 `visitor-analysis`、`faster-whisper` 两个 sidecar 同构：Python 起 FastAPI + uvicorn，
Java 侧用 JDK HttpClient 调本服务。**落库 / SSE 实时推送 / 历史检索都在 Java 侧，本服务只和微信 GUI 打交道。**

## 前置条件（重要）

1. **这台 PC 必须装了微信桌面客户端，并且已登录、窗口可见**——wxauto 是驱动微信 GUI 的，
   微信没开或没登录，`/health` 会回 `wechat_online=false`，操作类接口报未就绪。
2. Python 3.10+ 在 PATH 里。
3. **按你的微信版本选库**（见 `requirements.txt`）：
   - 微信 **3.9.x**（旧版，最成熟）→ 保留 `wxauto`
   - 微信 **4.0+**（新版）→ 注释掉 `wxauto`，改用 `wxauto-4.0` 或 `wxautox4`
   - 不确定版本：微信「设置 → 关于」可看。先按默认 `wxauto` 跑，`/health` 报错再切。

## 启动

```bat
start.bat
```

首次会建 `.venv` 并 `pip install`，之后秒起。监听 `http://127.0.0.1:9700`。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET  | `/health` | 探活 + 能力上报（lib / 版本 / 是否登录 / 监听列表 / 待取消息数） |
| GET  | `/sessions` | 会话列表 `[{name, unread}]` |
| GET  | `/messages?who=X&count=N` | 切到会话 X，取可见消息（count>0 取最近 N 条） |
| POST | `/send` | `{who, text}` 发文字 |
| POST | `/listen/add` | `{who}` 登记监听该会话 |
| POST | `/listen/remove` | `{who}` 取消监听 |
| GET  | `/listen/poll` | 一次性 drain 监听到的新消息（Java 定时来拉） |

## 设计要点

- **拉模式监听**：后台线程跑 wxauto `GetListenMessage`，把新消息塞进内存队列；Java 定时
  `GET /listen/poll` drain。Python 不反向推，断连自愈、实现简单。
- **串行化**：所有对 wxauto 的调用加全局锁——它驱动同一个微信窗口，并发会互相打架。
- **版本兼容**：`server.py` 做了兼容导入与反射式取属性，但不同 wxauto 版本控件/字段仍可能差异；
  跑不通时先看 `/health` 的 `lib` / `lib_version`，再对照库文档微调 `server.py` 里的方法名。

## 合规

仅用于操作**你自己登录**的微信、读取你自己的聊天内容。请遵守微信使用条款与当地法律。
