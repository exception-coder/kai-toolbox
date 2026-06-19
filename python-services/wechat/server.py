"""微信监控 / 操作 sidecar（基于 wxautox4 的 Windows UI 自动化）

为什么是 Python sidecar 而不是写进 Java：
- 拿微信内容的成熟方案（wxauto 系）是 Python，且依赖 Windows UI Automation，
  只能跑在装了微信、已登录的那台 PC 上。Java 侧用 JDK HttpClient 调本服务即可（与
  visitor-analysis / faster-whisper 两个 sidecar 同构）。
- 本服务把"和微信 GUI 打交道"全部收敛在这里；Java 只做持久化、SSE 广播、对前端开 REST。

库与版本（重要）：
- 开源的 `wxauto` 已不在 PyPI 上。PyPI 上维护的是作者的商业后继：
  `wxautox`（旧版微信 3.9.x）、`wxautox4`（微信/Weixin 4.x）。本机跑的是 Weixin 4.x，用 wxautox4。
- wxautox/wxautox4 **可能需要激活码（付费授权）**。设环境变量 WXAUTOX_ACTIVATION_CODE 后，
  本服务启动时会调 `wxautox4.authenticate(code)`。未激活时部分/全部能力可能在运行时报错。

wxautox4 监听是"回调式"（不是老 wxauto 的轮询 GetListenMessage）：
- AddListenChat(nickname, callback)：为某会话注册回调；新消息到来时 wxautox4 的监听线程回调我们，
  我们把消息塞进内存队列。Java 定时 GET /listen/poll 一次性 drain（拉模式、断连自愈、实现简单）。

强约束：所有对 WeChat 句柄的调用加全局锁串行化——它驱动同一个微信窗口，并发会互相打架。
跑不通先看 /health 的 lib / lib_version / error，再对照库文档微调方法名。

启动见同目录 start.bat / README.md。
"""
from __future__ import annotations

import logging
import os
import threading
from collections import deque
from typing import Any, Optional

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)-5s [%(name)s] %(message)s")
log = logging.getLogger("wechat-sidecar")

# —— 兼容导入：本机是 wxautox4；保留对 wxautox / wxauto 的回退，便于换机/换版本 ——
_wxmod = None
WeChat = None  # type: ignore[assignment]
LIB = None
LIB_VERSION = None
for _name in ("wxautox4", "wxautox", "wxauto"):
    try:
        _wxmod = __import__(_name)
        WeChat = getattr(_wxmod, "WeChat")
        LIB = _name
        LIB_VERSION = getattr(_wxmod, "__version__", "unknown")
        break
    except Exception:  # noqa: BLE001
        _wxmod = None
if WeChat is None:
    log.warning("未找到 wxautox4 / wxautox / wxauto，/health 可用但操作类接口会报未就绪。"
                "按 README 安装对应你微信版本的库。")

ACTIVATION_CODE = os.getenv("WXAUTOX_ACTIVATION_CODE", "").strip()

app = FastAPI(title="kai-toolbox wechat sidecar")

# 全局微信句柄 + 串行锁；监听回调把新消息塞 _inbox，/listen/poll 一次性 drain。
_wx: Optional[Any] = None
_wx_lock = threading.RLock()
_listen_chats: set[str] = set()
_inbox: deque[dict] = deque(maxlen=5000)
_inbox_lock = threading.Lock()
_activated = False


def _safe(obj: Any, name: str, default: Any = None) -> Any:
    try:
        return getattr(obj, name, default)
    except Exception:  # noqa: BLE001
        return default


def _ensure_wx() -> Any:
    """懒初始化微信句柄。失败抛异常，由各接口转 5xx。"""
    global _wx, _activated
    if WeChat is None:
        raise RuntimeError(f"wxautox4/wxautox/wxauto 未安装，无法操作微信（lib={LIB}）")
    with _wx_lock:
        if _wx is None:
            # 设了激活码就先激活（wxautox4.authenticate(code)）；失败只记日志，让后续按未授权报错。
            if ACTIVATION_CODE and not _activated and hasattr(_wxmod, "authenticate"):
                try:
                    _wxmod.authenticate(ACTIVATION_CODE)
                    _activated = True
                    log.info("wxautox 激活成功")
                except Exception as e:  # noqa: BLE001
                    log.warning("wxautox 激活失败（部分功能可能不可用）: %s", e)
            log.info("初始化微信句柄（%s %s）...", LIB, LIB_VERSION)
            _wx = WeChat()
            log.info("微信句柄就绪")
        return _wx


def _serialize(msg: Any, chat: str) -> dict:
    """把 wxautox4 的 Message 对象归一成统一 dict。

    自己发的=Self*、收到的=Friend*、系统/时间=System/Time。用 .attr（self/friend/system/time）
    优先判定，没有就退到类名前缀。serialized "type" 直接给这个 attr，前端据此区分左右气泡/系统条。
    外部库输出一律当不可信入参，缺字段给空串，最终由 Java 侧落库前再校验。
    """
    cls = type(msg).__name__
    attr = _safe(msg, "attr")
    if not attr:
        if cls.startswith("Self"):
            attr = "self"
        elif cls.startswith("Friend") or cls.startswith("Human"):
            attr = "friend"
        elif cls.startswith("System"):
            attr = "system"
        elif cls.startswith("Time"):
            attr = "time"
        else:
            attr = ""
    return {
        "chat": chat,
        "sender": str(_safe(msg, "sender") or ""),
        "content": str(_safe(msg, "content") or ""),
        "type": str(attr or _safe(msg, "type") or ""),
        "time": str(_safe(msg, "time") or ""),
        "msg_id": str(_safe(msg, "id") or _safe(msg, "hash") or ""),
    }


def _enqueue(who: str, msg: Any) -> None:
    try:
        item = _serialize(msg, who)
    except Exception as e:  # noqa: BLE001
        log.warning("序列化监听消息失败: %s", e)
        return
    with _inbox_lock:
        _inbox.append(item)


def _make_callback(who: str):
    """AddListenChat 的回调：签名 (Message, Chat) -> None。闭包绑定会话名，免去从 Chat 反查。"""
    def _cb(msg: Any, _chat: Any) -> None:
        _enqueue(who, msg)
    return _cb


# ---------------------------------------------------------------------------
# HTTP 接口
# ---------------------------------------------------------------------------
@app.get("/health")
def health() -> dict:
    """探活 + 能力上报。wechat_online=true 表示已拿到句柄且微信在线。"""
    online = False
    nickname = None
    err = None
    if WeChat is not None:
        try:
            wx = _ensure_wx()
            is_online = getattr(wx, "IsOnline", None)
            online = bool(is_online()) if callable(is_online) else True
            get_info = getattr(wx, "GetMyInfo", None)
            if callable(get_info):
                info = get_info() or {}
                if isinstance(info, dict):
                    nickname = info.get("nickname") or info.get("name")
        except Exception as e:  # noqa: BLE001
            err = str(e)
    return {
        "status": "ok",
        "lib": LIB,
        "lib_version": LIB_VERSION,
        "activated": _activated,
        "wechat_online": online,
        "nickname": nickname,
        "listening": sorted(_listen_chats),
        "inbox_pending": len(_inbox),
        "error": err,
    }


@app.get("/sessions")
def sessions() -> Any:
    """会话列表（最近聊天）。返回 [{name, unread}]，字段缺失尽力而为。"""
    wx = _ensure_wx()
    with _wx_lock:
        fn = getattr(wx, "GetSession", None) or getattr(wx, "GetSessionList", None)
        raw = fn() if callable(fn) else None
    out = []
    if isinstance(raw, dict):
        for name, unread in raw.items():
            out.append({"name": str(name), "unread": _to_int(unread)})
    elif isinstance(raw, (list, tuple)):
        for s in raw:
            name = _safe(s, "name", None) or _safe(s, "nickname", None) or str(s)
            out.append({"name": str(name), "unread": _to_int(_safe(s, "unread", 0))})
    return out


@app.get("/messages")
def messages(who: str, count: int = 0) -> Any:
    """切到指定会话并取当前可见消息。count>0 时截取最近 count 条。"""
    wx = _ensure_wx()
    with _wx_lock:
        chat_with = getattr(wx, "ChatWith", None)
        if callable(chat_with):
            chat_with(who)
        get_all = getattr(wx, "GetAllMessage", None) or getattr(wx, "GetAllMessages", None)
        raw = get_all() if callable(get_all) else []
    out = [_serialize(m, who) for m in (raw or [])]
    if count and count > 0:
        out = out[-count:]
    return out


@app.post("/send")
async def send(request: Request) -> Any:
    """发送文字消息。body: {who, text}。"""
    body = await request.json()
    who = (body or {}).get("who")
    text = (body or {}).get("text")
    if not who or not text:
        return JSONResponse(status_code=400, content={"error": "who 和 text 必填"})
    wx = _ensure_wx()
    with _wx_lock:
        send_fn = getattr(wx, "SendMsg", None) or getattr(wx, "SendMessage", None)
        if not callable(send_fn):
            return JSONResponse(status_code=500, content={"error": "当前库无 SendMsg"})
        send_fn(text, who)
    log.info("已发送 -> %s: %s", who, str(text)[:30])
    return {"ok": True}


@app.post("/listen/add")
async def listen_add(request: Request) -> Any:
    """登记监听一个会话：AddListenChat(nickname, callback)，新消息回调入队。"""
    body = await request.json()
    who = (body or {}).get("who")
    if not who:
        return JSONResponse(status_code=400, content={"error": "who 必填"})
    wx = _ensure_wx()
    with _wx_lock:
        add_fn = getattr(wx, "AddListenChat", None)
        if callable(add_fn):
            try:
                add_fn(nickname=who, callback=_make_callback(who))
            except TypeError:
                add_fn(who, _make_callback(who))
        # 确保监听线程在跑（构造时 start_listener=True，这里再兜一手）
        start_fn = getattr(wx, "StartListening", None)
        if callable(start_fn):
            try:
                start_fn()
            except Exception:  # noqa: BLE001
                pass
    _listen_chats.add(who)
    return {"ok": True, "listening": sorted(_listen_chats)}


@app.post("/listen/remove")
async def listen_remove(request: Request) -> Any:
    body = await request.json()
    who = (body or {}).get("who")
    wx = _ensure_wx()
    with _wx_lock:
        rm_fn = getattr(wx, "RemoveListenChat", None)
        if callable(rm_fn) and who:
            try:
                rm_fn(nickname=who)
            except TypeError:
                rm_fn(who)
    _listen_chats.discard(who)
    return {"ok": True, "listening": sorted(_listen_chats)}


@app.get("/listen/poll")
def listen_poll() -> Any:
    """一次性 drain 监听到的新消息。Java 定时来拉。"""
    with _inbox_lock:
        items = list(_inbox)
        _inbox.clear()
    return items


def _to_int(v: Any) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0
