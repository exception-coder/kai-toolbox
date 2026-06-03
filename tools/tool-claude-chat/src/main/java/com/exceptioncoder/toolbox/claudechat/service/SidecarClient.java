package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.BiConsumer;

/**
 * Java ↔ Node sidecar 的 WebSocket 客户端。
 *
 * 单条连接复用所有会话，靠消息里的 sessionId 路由。Node 侧事件经 {@link #listener}
 * 回调给 {@link ClaudeChatService}。连接断开（sidecar 崩溃）也通过 listener 上报。
 */
@Slf4j
@Component
public class SidecarClient {

    private final ClaudeChatProperties props;
    private final ObjectMapper mapper;
    private final StandardWebSocketClient client = new StandardWebSocketClient();

    /** (sessionId|null, eventNode) -> 处理；sessionId 为 null 表示连接级事件（如断开） */
    private volatile BiConsumer<String, JsonNode> listener = (s, n) -> {};
    private volatile WebSocketSession session;

    public SidecarClient(ClaudeChatProperties props, ObjectMapper mapper) {
        this.props = props;
        this.mapper = mapper;
    }

    public void setListener(BiConsumer<String, JsonNode> listener) {
        this.listener = listener;
    }

    /** 幂等连接，带超时重试。需在 sidecar 进程已启动后调用。 */
    public synchronized void ensureConnected() throws IOException {
        if (session != null && session.isOpen()) {
            return;
        }
        URI uri = URI.create("ws://127.0.0.1:" + props.getSidecarPort());
        long deadline = System.nanoTime() + props.getSidecarStartupTimeoutMs() * 1_000_000L;
        IOException last = null;
        while (System.nanoTime() < deadline) {
            try {
                session = client.execute(new ClientHandler(), uri.toString()).get();
                log.info("[claude-chat] 已连接 sidecar {}", uri);
                return;
            } catch (Exception e) {
                last = new IOException("连接 sidecar 失败：" + e.getMessage(), e);
                sleep(300);
            }
        }
        throw last != null ? last : new IOException("连接 sidecar 超时");
    }

    public boolean isConnected() {
        return session != null && session.isOpen();
    }

    public void startSession(String sessionId, String cwd, String model, String mode) {
        send(Map.of("type", "start", "sessionId", sessionId,
                "cwd", nz(cwd), "model", nz(model), "mode", nz(mode)));
    }

    public void resumeSession(String sessionId, String sdkSessionId, String cwd) {
        send(Map.of("type", "resume", "sessionId", sessionId,
                "sdkSessionId", nz(sdkSessionId), "cwd", nz(cwd)));
    }

    public void userMessage(String sessionId, String text) {
        send(Map.of("type", "user", "sessionId", sessionId, "text", nz(text)));
    }

    public void decision(String sessionId, String reqId, String behavior,
                         Object updatedInput, Object answers) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", "decision");
        m.put("sessionId", sessionId);
        m.put("reqId", reqId);
        m.put("behavior", behavior);
        m.put("updatedInput", updatedInput);
        m.put("answers", answers);
        send(m);
    }

    public void interrupt(String sessionId) {
        send(Map.of("type", "interrupt", "sessionId", sessionId));
    }

    public void setMode(String sessionId, String mode) {
        send(Map.of("type", "setMode", "sessionId", sessionId, "mode", nz(mode)));
    }

    public void setModel(String sessionId, String model) {
        send(Map.of("type", "setModel", "sessionId", sessionId, "model", nz(model)));
    }

    private synchronized void send(Map<String, ?> payload) {
        if (session == null || !session.isOpen()) {
            log.warn("[claude-chat] sidecar 未连接，丢弃消息 type={}", payload.get("type"));
            return;
        }
        try {
            session.sendMessage(new TextMessage(mapper.writeValueAsString(payload)));
        } catch (IOException e) {
            log.warn("[claude-chat] 发送到 sidecar 失败：{}", e.getMessage());
        }
    }

    private class ClientHandler extends TextWebSocketHandler {
        @Override
        protected void handleTextMessage(WebSocketSession ws, TextMessage message) {
            try {
                JsonNode node = mapper.readTree(message.getPayload());
                String sessionId = node.path("sessionId").asText(null);
                listener.accept(sessionId, node);
            } catch (Exception e) {
                log.warn("[claude-chat] 解析 sidecar 消息失败：{}", e.getMessage());
            }
        }

        @Override
        public void afterConnectionClosed(WebSocketSession ws, CloseStatus status) {
            log.warn("[claude-chat] 与 sidecar 的连接已关闭：{}", status);
            session = null;
            // 连接级事件：通知 service 把挂着的会话标记 INTERRUPTED
            listener.accept(null, null);
        }
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
