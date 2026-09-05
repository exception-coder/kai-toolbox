package com.exceptioncoder.forge.sessionrelay.web;

import com.exceptioncoder.forge.sessionrelay.ForgeRelayBinding;
import com.exceptioncoder.forge.sessionrelay.autoconfigure.ForgeSessionRelayProperties;
import com.exceptioncoder.forge.sessionrelay.support.ForgeRelayUpstreamClient;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.net.URI;
import java.util.ArrayDeque;
import java.util.Deque;

/** 将同源下游连接桥接到 Forge 公共 WebSocket，不接触管理端协议。 */
public final class ForgeRelayWebSocketHandler extends TextWebSocketHandler {
    private final ForgeRelayUpstreamClient upstream;
    private final ForgeSessionRelayProperties properties;
    private final StandardWebSocketClient webSocketClient;

    public ForgeRelayWebSocketHandler(ForgeRelayUpstreamClient upstream,
                                      ForgeSessionRelayProperties properties,
                                      StandardWebSocketClient webSocketClient) {
        this.upstream = upstream;
        this.properties = properties;
        this.webSocketClient = webSocketClient;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession downstream) {
        ForgeRelayBinding binding = (ForgeRelayBinding) downstream.getAttributes()
                .get(ForgeRelayHandshakeInterceptor.BINDING_ATTRIBUTE);
        Bridge bridge = new Bridge(downstream, properties.getMaxPendingFrames(), properties.getMaxFrameBytes());
        downstream.getAttributes().put(Bridge.class.getName(), bridge);
        try {
            URI uri = upstream.createWebSocketUri(binding);
            webSocketClient.execute(new UpstreamHandler(bridge), new WebSocketHttpHeaders(), uri)
                    .whenComplete((session, error) -> {
                        if (error != null) bridge.close(CloseStatus.SERVER_ERROR);
                        else bridge.attachUpstream(session);
                    });
        } catch (RuntimeException error) {
            bridge.close(CloseStatus.SERVER_ERROR);
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        bridge(session).fromDownstream(message);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        bridge(session).close(status);
    }

    private static Bridge bridge(WebSocketSession session) {
        return (Bridge) session.getAttributes().get(Bridge.class.getName());
    }

    private static final class UpstreamHandler implements WebSocketHandler {
        private final Bridge bridge;
        private UpstreamHandler(Bridge bridge) { this.bridge = bridge; }
        @Override public void afterConnectionEstablished(WebSocketSession session) { }
        @Override public void handleMessage(WebSocketSession session, WebSocketMessage<?> message) {
            if (message instanceof TextMessage text) bridge.fromUpstream(text);
        }
        @Override public void handleTransportError(WebSocketSession session, Throwable exception) {
            bridge.close(CloseStatus.SERVER_ERROR);
        }
        @Override public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
            bridge.close(status);
        }
        @Override public boolean supportsPartialMessages() { return false; }
    }

    static final class Bridge {
        private final WebSocketSession downstream;
        private final int maxPendingFrames;
        private final int maxFrameBytes;
        private final Deque<TextMessage> pending = new ArrayDeque<>();
        private WebSocketSession upstream;
        private boolean closed;

        Bridge(WebSocketSession downstream, int maxPendingFrames, int maxFrameBytes) {
            this.downstream = downstream;
            this.maxPendingFrames = maxPendingFrames;
            this.maxFrameBytes = maxFrameBytes;
        }

        synchronized void attachUpstream(WebSocketSession session) {
            if (closed) { closeQuietly(session, CloseStatus.NORMAL); return; }
            upstream = session;
            while (!pending.isEmpty()) sendOrClose(upstream, pending.removeFirst());
        }

        synchronized void fromDownstream(TextMessage message) {
            if (closed) return;
            if (message.getPayloadLength() > maxFrameBytes) { close(CloseStatus.TOO_BIG_TO_PROCESS); return; }
            if (upstream != null && upstream.isOpen()) { sendOrClose(upstream, message); return; }
            if (pending.size() >= maxPendingFrames) { close(CloseStatus.POLICY_VIOLATION); return; }
            pending.addLast(message);
        }

        synchronized void fromUpstream(TextMessage message) {
            if (!closed && downstream.isOpen()) sendOrClose(downstream, message);
        }

        synchronized void close(CloseStatus status) {
            if (closed) return;
            closed = true;
            pending.clear();
            closeQuietly(upstream, status);
            closeQuietly(downstream, status);
        }

        private void sendOrClose(WebSocketSession target, TextMessage message) {
            try { target.sendMessage(message); }
            catch (IOException error) { close(CloseStatus.SERVER_ERROR); }
        }

        private static void closeQuietly(WebSocketSession target, CloseStatus status) {
            if (target == null || !target.isOpen()) return;
            try { target.close(status); } catch (IOException ignored) { }
        }
    }
}
