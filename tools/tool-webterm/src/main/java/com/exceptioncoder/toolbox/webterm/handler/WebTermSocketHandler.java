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
                        "未在 " + props.getOpenTimeoutMs() + "ms 内收到 open",
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

        WebTermSession session = registry.findByWs(ws);
        if (session == null) {
            sendErrorAndClose(ws, "OPEN_REQUIRED", "首条消息必须是 open",
                    new CloseStatus(1008, "OPEN_REQUIRED"));
            return;
        }

        if (msg instanceof ClientMessage.Input input) {
            session.writeStdin(input.data());
        } else if (msg instanceof ClientMessage.Resize resize) {
            session.setSize(resize.cols(), resize.rows());
        } else if (msg instanceof ClientMessage.Close) {
            session.close();
            registry.remove(ws);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession ws, CloseStatus status) {
        cancelOpenTimeout(ws);
        WebTermSession session = registry.findByWs(ws);
        if (session != null) {
            session.close();
            registry.remove(ws);
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

        if (!registry.hasFreeSlot()) {
            sendErrorAndClose(ws, "SESSION_LIMIT_EXCEEDED",
                    "并发会话已达上限：" + props.getMaxSessions(),
                    new CloseStatus(1011, "SESSION_LIMIT_EXCEEDED"));
            return;
        }

        Process process;
        try {
            process = launcher.launch(shell, cwd);
        } catch (IOException e) {
            log.warn("[webterm] launch shell failed: {}", e.getMessage());
            sendErrorAndClose(ws, "SHELL_LAUNCH_FAILED", e.getMessage(),
                    new CloseStatus(1011, "SHELL_LAUNCH_FAILED"));
            return;
        }

        WebTermSession session = new WebTermSession(
                ws, process, shell, cwd.toString(),
                open.cols(), open.rows(), props, mapper);
        registry.register(ws, session);
        session.startOutputForwarding();
        session.sendMessage(new ServerMessage.Ready(
                session.getSessionId(), shell, cwd.toString(), session.pid()));
        log.info("[webterm] session {} started: shell={}, cwd={}, pid={}",
                session.getSessionId(), shell, cwd, session.pid());
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
