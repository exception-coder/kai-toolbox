package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatWsProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import jakarta.websocket.ContainerProvider;
import jakarta.websocket.WebSocketContainer;
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
@Component("claudeChatSidecarClient")
public class SidecarClient {

    private final ClaudeChatProperties props;
    private final ClaudeChatWsProperties wsProps;
    private final ObjectMapper mapper;
    private final StandardWebSocketClient client;

    /** (sessionId|null, eventNode) -> 处理；sessionId 为 null 表示连接级事件（如断开） */
    private volatile BiConsumer<String, JsonNode> listener = (s, n) -> {};
    private volatile WebSocketSession session;
    /** 本实例已随 Spring 上下文停机；不得再建连、不得再上报断开 */
    private volatile boolean shuttingDown;

    public SidecarClient(ClaudeChatProperties props, ClaudeChatWsProperties wsProps, ObjectMapper mapper) {
        this.props = props;
        this.wsProps = wsProps;
        this.mapper = mapper;
        // 客户端接收缓冲默认过小，来自 sidecar 的大消息会超限被 1009 断连、确认丢失，调到可配置大值。
        WebSocketContainer container = ContainerProvider.getWebSocketContainer();
        container.setDefaultMaxTextMessageBufferSize(wsProps.getMaxMessageBytes());
        container.setDefaultMaxBinaryMessageBufferSize(wsProps.getMaxMessageBytes());
        this.client = new StandardWebSocketClient(container);
    }

    public void setListener(BiConsumer<String, JsonNode> listener) {
        this.listener = listener;
    }

    /** 幂等连接，带超时重试。需在 sidecar 进程已启动后调用。 */
    public synchronized void ensureConnected() throws IOException {
        if (shuttingDown) {
            throw new IOException("sidecar 客户端已停机");
        }
        if (session != null && session.isOpen()) {
            return;
        }
        // 旧连接不留：半开的连接会一直挂在 sidecar 上，其关闭回调还会误伤后来的新连接。
        // 先摘掉引用再关，免得自己触发的关闭又被当成一次「链路断开」上报。
        WebSocketSession stale = session;
        session = null;
        closeQuietly(stale);
        URI uri = URI.create("ws://127.0.0.1:" + props.getSidecarPort());
        long deadline = System.nanoTime() + props.getSidecarStartupTimeoutMs() * 1_000_000L;
        IOException last = null;
        while (System.nanoTime() < deadline) {
            try {
                WebSocketSession ws = client.execute(new ClientHandler(), uri.toString()).get();
                ws.setTextMessageSizeLimit(wsProps.getMaxMessageBytes());
                ws.setBinaryMessageSizeLimit(wsProps.getMaxMessageBytes());
                session = ws;
                log.info("[claude-chat] 已连接 sidecar {}", uri);
                return;
            } catch (Exception e) {
                last = new IOException("连接 sidecar 失败：" + e.getMessage(), e);
                sleep(300);
            }
        }
        throw last != null ? last : new IOException("连接 sidecar 超时");
    }

    /**
     * 随 Spring 上下文停机：断开连接并封死重连入口。
     *
     * <p>不做这一步，DevTools 热重启后旧上下文的本 bean 会连着不放、监听器照收事件、重连线程照跑，
     * 和新上下文抢同一个 sidecar —— 事件可能被投递到已经没有浏览器观察者的那一端，前端就永远等不到回复。
     */
    @PreDestroy
    public synchronized void shutdown() {
        shuttingDown = true;
        WebSocketSession cur = session;
        session = null;
        closeQuietly(cur);
    }

    /** 当前生效的连接才代表链路状态；陈旧连接的事件不得改写 {@link #session} 或上报断开。 */
    private boolean isCurrent(WebSocketSession ws) {
        WebSocketSession cur = session;
        return cur != null && cur.getId().equals(ws.getId());
    }

    private static void closeQuietly(WebSocketSession ws) {
        if (ws == null) {
            return;
        }
        try {
            ws.close();
        } catch (Exception ignore) {
            // 关一条已经不用的连接，失败无所谓
        }
    }

    public boolean isConnected() {
        return session != null && session.isOpen();
    }

    public void startSession(String sessionId, String cwd, String model, String mode, String engine,
                             String apiBaseUrl, String authToken, String codexHome, boolean autoApprove,
                             String codexReasoningEffort, String codexSpeed, String toolPolicy) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", "start");
        m.put("sessionId", sessionId);
        m.put("cwd", nz(cwd));
        m.put("model", nz(model));
        m.put("mode", nz(mode));
        m.put("engine", nz(engine));
        m.put("apiBaseUrl", nz(apiBaseUrl));
        m.put("authToken", nz(authToken));
        m.put("codexHome", nz(codexHome));
        m.put("autoApprove", autoApprove);
        m.put("codexReasoningEffort", nz(codexReasoningEffort));
        m.put("codexSpeed", nz(codexSpeed));
        m.put("toolPolicy", nz(toolPolicy));
        send(m);
    }

    /**
     * 福利签收演示会话：cwd = 一次性副本根、固定 claude 引擎、demo=true（sidecar 据此走沙箱硬裁决并注入
     * welfare_db MCP）。demoApiBase 供 welfare_db 工具回灌后端执行受限 SQL。
     */
    public void startDemoSession(String sessionId, String cwd, String demoApiBase) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", "start");
        m.put("sessionId", sessionId);
        m.put("cwd", nz(cwd));
        m.put("model", "");
        m.put("mode", "bypassPermissions");
        m.put("engine", "claude");
        m.put("apiBaseUrl", "");
        m.put("authToken", "");
        m.put("demo", true);
        m.put("demoApiBase", nz(demoApiBase));
        send(m);
    }

    /**
     * 恢复会话。mode / autoApprove 必须一并回灌——sidecar 重建后 Session 是全新对象，权限模式会退回
     * default。以前只靠前端收到 ready 再补发 setMode 纠正，可一旦当时没有浏览器在线（用户切走页面、
     * 或后端自愈式 resume），模式就长期停在 default：本该全自动的会话又开始弹审批，弹了也没人看。
     */
    public void resumeSession(String sessionId, String sdkSessionId, String cwd, String engine,
                              String apiBaseUrl, String authToken, String codexHome,
                              String mode, boolean autoApprove, String model,
                              String codexReasoningEffort, String codexSpeed, String toolPolicy) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", "resume");
        m.put("sessionId", sessionId);
        m.put("sdkSessionId", nz(sdkSessionId));
        m.put("cwd", nz(cwd));
        m.put("engine", nz(engine));
        m.put("apiBaseUrl", nz(apiBaseUrl));
        m.put("authToken", nz(authToken));
        m.put("codexHome", nz(codexHome));
        m.put("mode", nz(mode));
        m.put("autoApprove", autoApprove);
        m.put("model", nz(model));
        m.put("codexReasoningEffort", nz(codexReasoningEffort));
        m.put("codexSpeed", nz(codexSpeed));
        m.put("toolPolicy", nz(toolPolicy));
        send(m);
    }

    public void userMessage(String sessionId, String text) {
        send(Map.of("type", "user", "sessionId", sessionId, "text", nz(text)));
    }

    /** 转发权限/提问决策到 sidecar。返回 false=sidecar 未连/发送失败（决策未送达），调用方据此告知前端别误以为已批准。 */
    public boolean decision(String sessionId, String reqId, String behavior,
                            Object updatedInput, Object answers) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", "decision");
        m.put("sessionId", sessionId);
        m.put("reqId", reqId);
        m.put("behavior", behavior);
        m.put("updatedInput", updatedInput);
        m.put("answers", answers);
        return send(m);
    }

    /**
     * 请求 sidecar 中断当前轮。
     *
     * @return true 表示中断消息已写入 sidecar WebSocket；false 表示链路不可用，调用方不能假装中断成功
     */
    public boolean interrupt(String sessionId) {
        return send(Map.of("type", "interrupt", "sessionId", sessionId));
    }

    public void setMode(String sessionId, String mode) {
        send(Map.of("type", "setMode", "sessionId", sessionId, "mode", nz(mode)));
    }

    /** 同步「弹窗自动允许」：由 sidecar 内同步裁决，不依赖浏览器在线。 */
    public void setAutoApprove(String sessionId, boolean autoApprove) {
        send(Map.of("type", "setAutoApprove", "sessionId", sessionId, "autoApprove", autoApprove));
    }

    public void setModel(String sessionId, String model) {
        send(Map.of("type", "setModel", "sessionId", sessionId, "model", nz(model)));
    }

    /** 主动同步模型清单：让 sidecar 重新询问 claude 二进制并回发最新 models。 */
    public void refreshModels(String sessionId) {
        send(Map.of("type", "refreshModels", "sessionId", sessionId));
    }

    public void setCodexOptions(String sessionId, String reasoningEffort, String speed) {
        send(Map.of("type", "setCodexOptions", "sessionId", sessionId,
                "reasoningEffort", nz(reasoningEffort), "speed", nz(speed)));
    }

    /**
     * 会话内切引擎：sidecar 置新 engine 并把 sdkSessionId 设为 Java 提供的目标句柄
     * （切回曾用引擎为其原生句柄、首次为空＝起新会话）。Java 持久化映射、是权威源。
     */
    public void switchEngine(String sessionId, String engine, String sdkSessionId,
                             String apiBaseUrl, String authToken) {
        send(Map.of("type", "switchEngine", "sessionId", sessionId,
                "engine", nz(engine), "sdkSessionId", nz(sdkSessionId),
                "apiBaseUrl", nz(apiBaseUrl), "authToken", nz(authToken)));
    }

    /** 会话内切服务商：仅透传 apiBaseUrl/authToken，sidecar 就地更新、下一轮生效（空 baseUrl＝官方）。 */
    public void switchProvider(String sessionId, String apiBaseUrl, String authToken) {
        send(Map.of("type", "switchProvider", "sessionId", sessionId,
                "apiBaseUrl", nz(apiBaseUrl), "authToken", nz(authToken)));
    }

    public void forkSession(String sessionId, String upToMessageId) {
        send(Map.of("type", "forkSession", "sessionId", sessionId, "upToMessageId", nz(upToMessageId)));
    }

    /** 一次性无状态生成（高质量简历优化用）。sessionId 约定以 {@code oneshot:} 前缀，事件由 AgentOneShotService 收。 */
    /** 一次性生成；engine 为 claude 或 codex。 */
    public void oneShot(String sessionId, String systemPrompt, String userPrompt, String model, String engine,
                        java.util.List<com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner.ImageInput> images) {
        var request = new com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner.ExecutionRequest(
                systemPrompt, userPrompt, null, model, engine,
                null, null, null, null, null, null);
        oneShot(sessionId, request, engine, images);
    }

    /** 按指定执行配置发起独立的一次性任务。 */
    public void oneShot(String sessionId,
                        com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner.ExecutionRequest request,
                        String normalizedEngine,
                        java.util.List<com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner.ImageInput> images) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "oneShot");
        payload.put("sessionId", sessionId);
        payload.put("systemPrompt", nz(request.systemPrompt()));
        payload.put("userPrompt", nz(request.userPrompt()));
        payload.put("cwd", nz(request.cwd()));
        payload.put("model", nz(request.model()));
        payload.put("engine", nz(normalizedEngine));
        payload.put("reasoningEffort", nz(request.reasoningEffort()));
        payload.put("speed", nz(request.speed()));
        payload.put("apiBaseUrl", nz(request.apiBaseUrl()));
        payload.put("authToken", nz(request.authToken()));
        payload.put("codexHome", nz(request.codexHome()));
        payload.put("toolPolicy", nz(request.toolPolicy()));
        if (images != null && !images.isEmpty()) {
            payload.put("images", images.stream()
                    .map(img -> Map.of("mediaType", img.mimeType(), "data", img.base64Data()))
                    .toList());
        }
        send(payload);
    }

    /** 发送一条消息到 sidecar。返回是否真正发出（未连接/异常返回 false，供决策类消息据此回告前端）。 */
    private synchronized boolean send(Map<String, ?> payload) {
        if (session == null || !session.isOpen()) {
            log.warn("[claude-chat] sidecar 未连接，丢弃消息 type={}", payload.get("type"));
            return false;
        }
        try {
            session.sendMessage(new TextMessage(mapper.writeValueAsString(payload)));
            return true;
        } catch (IOException e) {
            log.warn("[claude-chat] 发送到 sidecar 失败：{}", e.getMessage());
            return false;
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
            if (shuttingDown) {
                return;
            }
            if (!isCurrent(ws)) {
                // 陈旧连接的收尾：链路已由新连接接管，据此上报断开会把一次断开放大成多轮重连
                log.debug("[claude-chat] 陈旧 sidecar 连接关闭，忽略：{}", status);
                return;
            }
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
