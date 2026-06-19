"""微信监控 / 操作 sidecar（基于 wxauto 的 Windows UI 自动化）

为什么是 Python sidecar 而不是写进 Java：
- 拿微信内容的成熟开源方案 wxauto / wxautox 是 Python，且依赖 Windows UI Automation，
  只能跑在装了微信、已登录的那台 PC 上。Java 侧用 JDK HttpClient 调本服务即可（与
  visitor-analysis / faster-whisper 两个 sidecar 同构）。
- 本服务把"和微信 GUI 打交道"全部收敛在这里；Java 只做持久化、SSE 广播、对前端开 REST。

职责边界（与 Java 侧约定）：
- 本服务只负责"从微信 GUI 取结构化文本 / 往微信发消息"，不落库、不广播。
- 落库（SQLite）、给浏览器推实时消息（SSE）、历史检索都在 Java 侧。
- /listen/poll 是拉模式：本服务后台线程跑 wxauto 监听、把新消息塞进内存队列，
  Java 定时来 drain。拉模式比让 Python 反向推更简单、断连自愈，符合 deterministic-first。

强约束：
- wxauto 严重依赖微信客户端版本。微信 3.9.x 用 `wxauto`，微信 4.0+ 用 `wxauto-4.0` /
  `wxautox4`。本文件做了"兼容导入 + 反射式取属性"，但不同版本控件/字段仍可能有差异；
  /health 会回 lib 名与版本，跑不通时先看这里，再按 README 切库。

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

# —— 兼容导入：先试原版 wxauto（微信 3.9.x），再试 wxautox（4.0+ 增强版）——
WeChat = None  # type: ignore[assignment]
LIB = None
LIB_VERSION = None
try:
    import wxauto  # type: ignore
    from wxauto import WeChat  # type: ignore
    LIB = "wxauto"
    LIB_VERSION = getattr(wxauto, "__version__", "unknown")
except Exception:  # noqa: BLE001
    try:
        import wxautox  # type: ignore
        from wxautox import WeChat  # type: ignore
        LIB = "wxautox"
        LIB_VERSION = getattr(wxautox, "__version__", "unknown")
    except Exception:  # noqa: BLE001
        log.warning("未找到 wxauto / wxautox，/health 可用但操作类接口会报未就绪。"
                    "按 README 安装对应你微信版本的库。")

app = FastAPI(title="kai-toolbox wechat sidecar")

# —— 全局微信句柄 + 监听状态。所有对 wxauto 的调用都加锁串行化：
#    wxauto 驱动的是同一个微信窗口，并发点击会互相打架，串行最稳。——
_wx: Optional[Any] = None
_wx_lock = threading.RLock()
_listen_chats: set[str] = set()
# 后台监听线程把新消息塞这里，/listen/poll 一次性 drain。设上限防止 Java 长时间不来导致内存涨。
_inbox: deque[dict] = deque(maxlen=5000)
_inbox_lock = threading.Lock()
_listener_thread: Optional[threading.Thread] = None
_listener_stop = threading.Event()


def _ensure_wx() -> Any:
    """懒初始化微信句柄。失败抛异常，由各接口转 503/500。"""
    global _wx
    if WeChat is None:
        raise RuntimeError(f"wxauto/wxautox 未安装，无法操作微信（lib={LIB}）")
    with _wx_lock:
        if _wx is None:
            log.info("初始化微信句柄（%s %s）...", LIB, LIB_VERSION)
            _wx = WeChat()
            log.info("微信句柄就绪，昵称=%s", _safe_attr(_wx, "nickname"))
        return _wx


def _safe_attr(obj: Any, name: str, default: Any = None) -> Any:
    try:
        return getattr(obj, name, default)
    except Exception:  # noqa: BLE001
        return default


def _serialize_msg(m: Any, chat: str) -> dict:
    """把 wxauto 的消息对象/元组归一成统一 dict。

    不同版本 Message 形态各异：有的是带 .sender/.content/.type/.time 的对象，
    有的是 [type, content, sender] 这样的 list。两种都兜住，缺字段给空串，
    最终结构由 Java 侧再校验/落库（LLM-last 之外的同理：外部库输出当不可信入参）。
    """
    sender = _safe_attr(m, "sender")
    content = _safe_attr(m, "content")
    mtype = _safe_attr(m, "type")
    mtime = _safe_attr(m, "time")
    mid = _safe_attr(m, "id") or _safe_attr(m, "msgid")

    if content is None and isinstance(m, (list, tuple)):
        # [type, content, sender] 兼容
        parts = list(m) + ["", "", ""]
        mtype, content, sender = parts[0], parts[1], parts[2]

    return {
        "chat": chat,
        "sender": str(sender) if sender is not None else "",
        "content": str(content) if content is not None else "",
        "type": str(mtype) if mtype is not None else "",
        "time": str(mtime) if mtime is not None else "",
        "msg_id": str(mid) if mid is not None else "",
    }


def _get_all_messages(wx: Any) -> list:
    """取当前会话的全部可见消息。兼容不同版本方法名。"""
    for name in ("GetAllMessage", "GetAllMessages", "GetAllSubWindow"):
        fn = getattr(wx, name, None)
        if callable(fn):
            try:
                res = fn()
                if isinstance(res, dict):
                    # 某些版本回 {sender: [..]}，拍平
                    flat = []
                    for v in res.values():
                        flat.extend(v if isinstance(v, list) else [v])
                    return flat
                return list(res) if res else []
            except Exception as e:  # noqa: BLE001
                log.warning("%s 调用失败: %s", name, e)
    return []


# ---------------------------------------------------------------------------
# 监听线程：后台轮询 wxauto 的 GetListenMessage，把新消息推进 _inbox
# ---------------------------------------------------------------------------
def _listener_loop() -> None:
    import time
    log.info("监听线程启动")
    while not _listener_stop.is_set():
        try:
            if WeChat is None or not _listen_chats:
                time.sleep(1.0)
                continue
            with _wx_lock:
                wx = _ensure_wx()
                get_listen = getattr(wx, "GetListenMessage", None)
                msgs = get_listen() if callable(get_listen) else None
            if msgs:
                _drain_listen_result(msgs)
        except Exception as e:  # noqa: BLE001
            log.warning("监听循环异常（忽略，继续）: %s", e)
        finally:
            _listener_stop.wait(1.0)
    log.info("监听线程退出")


def _drain_listen_result(msgs: Any) -> None:
    """GetListenMessage 通常回 {chatWnd: [msg,...]}；逐条归一后入队。"""
    items: list[dict] = []
    try:
        if isinstance(msgs, dict):
            for chat_wnd, msg_list in msgs.items():
                chat_name = str(_safe_attr(chat_wnd, "who", None) or chat_wnd)
                for m in (msg_list or []):
                    items.append(_serialize_msg(m, chat_name))
        elif isinstance(msgs, (list, tuple)):
            for m in msgs:
                items.append(_serialize_msg(m, ""))
    except Exception as e:  # noqa: BLE001
        log.warning("解析监听结果失败: %s", e)
        return
    if items:
        with _inbox_lock:
            _inbox.extend(items)
        log.info("入队新消息 %d 条（待 Java drain）", len(items))


def _ensure_listener_started() -> None:
    global _listener_thread
    if _listener_thread is None or not _listener_thread.is_alive():
        _listener_stop.clear()
        _listener_thread = threading.Thread(target=_listener_loop, name="wx-listener", daemon=True)
        _listener_thread.start()


# ---------------------------------------------------------------------------
# HTTP 接口
# ---------------------------------------------------------------------------
@app.get("/health")
def health() -> dict:
    """探活 + 能力上报。Java 端启动/前端进页面都打这个。

    wechat_online 为 true 表示已成功拿到微信句柄（即微信已登录且库可用）。
    """
    online = False
    nickname = None
    err = None
    if WeChat is not None:
        try:
            wx = _ensure_wx()
            nickname = _safe_attr(wx, "nickname")
            online = True
        except Exception as e:  # noqa: BLE001
            err = str(e)
    return {
        "status": "ok",
        "lib": LIB,
        "lib_version": LIB_VERSION,
        "wechat_online": online,
        "nickname": nickname,
        "listening": sorted(_listen_chats),
        "inbox_pending": len(_inbox),
        "error": err,
    }


@app.get("/sessions")
def sessions() -> Any:
    """会话列表（最近聊天）。返回 [{name, unread}]，字段缺失则尽力而为。"""
    wx = _ensure_wx()
    with _wx_lock:
        fn = getattr(wx, "GetSessionList", None)
        raw = fn() if callable(fn) else None
    out = []
    if isinstance(raw, dict):
        for name, unread in raw.items():
            out.append({"name": str(name), "unread": _to_int(unread)})
    elif isinstance(raw, (list, tuple)):
        for s in raw:
            name = _safe_attr(s, "name", None) or str(s)
            out.append({"name": str(name), "unread": _to_int(_safe_attr(s, "unread", 0))})
    return out


@app.get("/messages")
def messages(who: str, count: int = 0) -> Any:
    """切到指定会话并取当前可见消息。count>0 时截取最近 count 条。"""
    wx = _ensure_wx()
    with _wx_lock:
        chat_with = getattr(wx, "ChatWith", None)
        if callable(chat_with):
            chat_with(who)
        raw = _get_all_messages(wx)
    out = [_serialize_msg(m, who) for m in raw]
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
        try:
            send_fn(text, who)
        except TypeError:
            # 某些版本签名是 SendMsg(msg=, who=)
            send_fn(msg=text, who=who)
    log.info("已发送 -> %s: %s", who, text[:30])
    return {"ok": True}


@app.post("/listen/add")
async def listen_add(request: Request) -> Any:
    """登记一个要监听的会话。之后该会话的新消息进 /listen/poll 队列。"""
    body = await request.json()
    who = (body or {}).get("who")
    if not who:
        return JSONResponse(status_code=400, content={"error": "who 必填"})
    wx = _ensure_wx()
    with _wx_lock:
        add_fn = getattr(wx, "AddListenChat", None)
        if callable(add_fn):
            try:
                add_fn(who=who, savepic=False)
            except TypeError:
                add_fn(who)
    _listen_chats.add(who)
    _ensure_listener_started()
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
                rm_fn(who=who)
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
