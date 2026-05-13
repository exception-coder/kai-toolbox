package com.exceptioncoder.toolbox.webterm.handler;

import com.exceptioncoder.toolbox.webterm.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.webterm.api.dto.ServerMessage;
import com.exceptioncoder.toolbox.webterm.config.WebTermProperties;
import com.exceptioncoder.toolbox.webterm.service.ShellLauncher;
import com.exceptioncoder.toolbox.webterm.session.WebTermSession;
import com.exceptioncoder.toolbox.webterm.session.WebTermSessionRegistry;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

@Slf4j
@Component
public class WebTermSocketHandler extends TextWebSocketHandler {

    private final WebTermProperties props;
    private final WebTermSessionRegistry registry;
    private final ShellLauncher launcher;
    private final ObjectMapper mapper;

    private final ScheduledExecutorService scheduler =
            Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "webterm-open-timeout");
                t.setDaemon(true);
                return t;
            });
    private final Map<String, ScheduledFuture<?>> openTimeouts = new ConcurrentHashMap<>();

    public WebTermSocketHandler(WebTermProperties props,
                                WebTermSessionRegistry registry,
                                ShellLauncher launcher,
                                ObjectMapper mapper) {
        this.props = props;
        this.registry = registry;
        this.launcher = launcher;
        this.mapper = mapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession ws) {
        if (!props.isEnabled()) {
            sendErrorAndClose(ws, "DISABLED", "Web 终端已禁用", CloseStatus.SERVICE_RESTARTED);
            return;
        }
        ws.setTextMessageSizeLimit(64 * 1024);
        ws.setBinaryMessageSizeLimit(64 * 1024);

        ScheduledFuture<?> f = scheduler.schedule(() -> {
            if (registry.findByWs(ws) == null && ws.isOpen()) {
                sendErrorAndClose(ws, "OPEN_REQUIRED",
                        "未在 " + props.getOpenTimeoutMs() + "ms 内收到 open/attach",
                        new CloseStatus(1008, "OPEN_REQUIRED"));
            }
        }, props.getOpenTimeoutMs(), TimeUnit.MILLISECONDS);
        openTimeouts.put(ws.getId(), f);
    }

    @Override
    protected void handleTextMessage(WebSocketSession ws, TextMessage message) {
        ClientMessage msg;
        try {
            msg = mapper.readValue(message.getPayload(), ClientMessage.class);
        } catch (JsonProcessingException e) {
            log.debug("[webterm] invalid client message: {}", e.getMessage());
            sendErrorAndClose(ws, "INTERNAL_ERROR", "消息解析失败：" + e.getOriginalMessage(),
                    new CloseStatus(1011, "INTERNAL_ERROR"));
            return;
        }

        if (msg instanceof ClientMessage.Open open) {
            handleOpen(ws, open);
            return;
        }
        if (msg instanceof ClientMessage.Attach attach) {
            handleAttach(ws, attach);
            return;
        }

        WebTermSession session = registry.findByWs(ws);
        if (session == null) {
            sendErrorAndClose(ws, "OPEN_REQUIRED", "首条消息必须是 open 或 attach",
                    new CloseStatus(1008, "OPEN_REQUIRED"));
            return;
        }

        if (msg instanceof ClientMessage.Input input) {
            session.writeStdin(input.data());
        } else if (msg instanceof ClientMessage.Resize resize) {
            session.setSize(resize.cols(), resize.rows());
        } else if (msg instanceof ClientMessage.Close) {
            // 用户明确请求关闭 → 真正 close（不只是 detach）
            session.close();
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession ws, CloseStatus status) {
        cancelOpenTimeout(ws);
        WebTermSession session = registry.findByWs(ws);
        if (session != null) {
            // WS 断开 ≠ 用户想终结会话 —— 把 ws 解绑、PTY 继续保活，等下次 attach。
            // 超出 detachIdleTimeoutMs 后由 session 自己调度 close。
            registry.unbindWs(ws);
            session.detach();
        }
    }

    @Override
    public void handleTransportError(WebSocketSession ws, Throwable exception) {
        log.debug("[webterm] transport error: {}", exception.getMessage());
    }

    private void handleOpen(WebSocketSession ws, ClientMessage.Open open) {
        cancelOpenTimeout(ws);

        if (registry.findByWs(ws) != null) {
            sendErrorAndClose(ws, "OPEN_DUPLICATED", "重复的 open",
                    new CloseStatus(1008, "OPEN_DUPLICATED"));
            return;
        }
        if (!launcher.isWindows()) {
            sendErrorAndClose(ws, "UNSUPPORTED_PLATFORM", "仅 Windows 启用 Web 终端",
                    new CloseStatus(1011, "UNSUPPORTED_PLATFORM"));
            return;
        }

        String shell = open.shell();
        if (shell == null || shell.isBlank()) {
            shell = props.getDefaultShell();
        }
        if (!launcher.isShellSupported(shell)) {
            sendErrorAndClose(ws, "INVALID_SHELL", "不支持的 shell: " + shell,
                    new CloseStatus(1008, "INVALID_SHELL"));
            return;
        }
        if (open.cols() < 20 || open.cols() > 500 || open.rows() < 5 || open.rows() > 200) {
            sendErrorAndClose(ws, "INVALID_SIZE", "cols/rows 越界",
                    new CloseStatus(1008, "INVALID_SIZE"));
            return;
        }
        Path cwd = launcher.resolveCwd(open.cwd());

        // === 服务端去重 ===
        // 同 cwd + shell 已经有 PTY 活着的话，把 open 重定向成 attach 复用它。
        // 这样浏览器反复刷新 / 多 tab 打开 / URL 直接访问都不会再每次新 launch 一个
        // 孤儿 PTY 堆积到 maxSessions 上限。
        java.util.Optional<WebTermSession> existing = registry.findLiveBy(cwd.toString(), shell);
        if (existing.isPresent()) {
            WebTermSession session = existing.get();
            if (session.isAttached()) {
                sendErrorAndClose(ws, "SESSION_BUSY",
                        "同目录的 " + shell + " 终端已被另一个客户端连着，先把那个客户端断开",
                        new CloseStatus(1008, "SESSION_BUSY"));
                return;
            }
            registry.rebindWs(ws, session);
            session.sendMessage(new ServerMessage.Ready(
                    session.getSessionId(), session.getShell(), session.getCwd(), session.pid(), true));
            session.attach(ws, open.cols(), open.rows());
            log.info("[webterm] open 复用已有 PTY {} for cwd={}, shell={}",
                    session.getSessionId(), cwd, shell);
            return;
        }

        if (!registry.hasFreeSlot()) {
            sendErrorAndClose(ws, "SESSION_LIMIT_EXCEEDED",
                    "并发会话已达上限：" + props.getMaxSessions(),
                    new CloseStatus(1011, "SESSION_LIMIT_EXCEEDED"));
            return;
        }

        com.pty4j.PtyProcess process;
        try {
            process = launcher.launch(shell, cwd, open.cols(), open.rows());
        } catch (IOException e) {
            log.warn("[webterm] launch shell failed: {}", e.getMessage());
            sendErrorAndClose(ws, "SHELL_LAUNCH_FAILED", e.getMessage(),
                    new CloseStatus(1011, "SHELL_LAUNCH_FAILED"));
            return;
        }

        String finalShell = shell;
        String cwdString = cwd.toString();
        WebTermSession[] holder = new WebTermSession[1];
        WebTermSession session = new WebTermSession(
                ws, process, finalShell, cwdString,
                open.cols(), open.rows(), props, mapper,
                registry.scheduler(),
                () -> { if (holder[0] != null) registry.permanentRemove(holder[0].getSessionId()); });
        holder[0] = session;
        registry.register(ws, session);
        session.startOutputForwarding();
        session.sendMessage(new ServerMessage.Ready(
                session.getSessionId(), finalShell, cwdString, session.pid(), false));
        log.info("[webterm] session {} started: shell={}, cwd={}, pid={}",
                session.getSessionId(), finalShell, cwd, session.pid());
    }

    private void handleAttach(WebSocketSession ws, ClientMessage.Attach attach) {
        cancelOpenTimeout(ws);
        if (registry.findByWs(ws) != null) {
            sendErrorAndClose(ws, "OPEN_DUPLICATED", "重复的 open/attach",
                    new CloseStatus(1008, "OPEN_DUPLICATED"));
            return;
        }
        WebTermSession session = registry.findById(attach.sessionId());
        if (session == null) {
            // 客户端记得的 sessionId 已超时被回收 / 或服务重启过 —— 让前端走 fallback 重新 open
            sendErrorAndClose(ws, "SESSION_NOT_FOUND", "PTY 会话不存在（可能已超时关闭）",
                    new CloseStatus(1008, "SESSION_NOT_FOUND"));
            return;
        }
        if (session.isAttached()) {
            sendErrorAndClose(ws, "SESSION_BUSY", "该 PTY 已有别的客户端连着",
                    new CloseStatus(1008, "SESSION_BUSY"));
            return;
        }
        if (attach.cols() < 20 || attach.cols() > 500 || attach.rows() < 5 || attach.rows() > 200) {
            sendErrorAndClose(ws, "INVALID_SIZE", "cols/rows 越界",
                    new CloseStatus(1008, "INVALID_SIZE"));
            return;
        }
        registry.rebindWs(ws, session);
        // Ready 必须在 attach 回放 backlog 之前发，前端拿到 Ready 才会标记 socket 可用
        session.sendMessage(new ServerMessage.Ready(
                session.getSessionId(), session.getShell(), session.getCwd(), session.pid(), true));
        session.attach(ws, attach.cols(), attach.rows());
        log.info("[webterm] session {} reattached", session.getSessionId());
    }

    private void cancelOpenTimeout(WebSocketSession ws) {
        ScheduledFuture<?> f = openTimeouts.remove(ws.getId());
        if (f != null) f.cancel(false);
    }

    private void sendErrorAndClose(WebSocketSession ws, String code, String message, CloseStatus status) {
        try {
            String json = mapper.writeValueAsString(new ServerMessage.Error(code, message));
            if (ws.isOpen()) {
                ws.sendMessage(new TextMessage(json));
            }
        } catch (IOException e) {
            log.debug("[webterm] sendErrorAndClose: {}", e.getMessage());
        }
        try {
            if (ws.isOpen()) {
                ws.close(status);
            }
        } catch (IOException ignore) { }
    }
}
