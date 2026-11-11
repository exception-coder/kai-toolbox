package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ServerMessage;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.List;
import java.util.function.IntSupplier;

/**
 * 会话到浏览器的事件通道：为实时事件打序号、写入回放缓冲并广播给在看的连接；
 * 重连时按序号回放、提示缓冲空洞、重投未决请求；评审连接只发送公开投影。
 *
 * <p>从 ClaudeChatService 拆出，只依赖会话状态、ObjectMapper 与缓冲上限，不持有会话表。</p>
 */
@Slf4j
final class SessionEventChannel {

    private final ObjectMapper mapper;
    private final IntSupplier eventBufferSize;

    SessionEventChannel(ObjectMapper mapper, IntSupplier eventBufferSize) {
        this.mapper = mapper;
        this.eventBufferSize = eventBufferSize;
    }

    boolean hasActiveViewer(SessionCtx ctx) {
        return ctx.viewers.stream().anyMatch(WebSocketSession::isOpen);
    }

    /**
     * 回放前检测空洞：客户端 lastSeq 之后、缓冲窗口最旧 seq 之前的事件已被淘汰，回放补不回来。
     * 仅在 lastSeq>0（曾收到过、属重连续看）时提示；lastSeq=0 是首次 attach（历史走 transcript），不算空洞。
     */
    void warnIfReplayGap(SessionCtx ctx, WebSocketSession ws, long lastSeq) {
        if (lastSeq <= 0) return;
        long minBuf;
        synchronized (ctx.buffer) {
            ServerMessage first = ctx.buffer.peekFirst();
            minBuf = first == null ? 0 : first.seq();
        }
        if (minBuf > lastSeq + 1) {
            writeTo(ws, new ServerMessage.ReplayGap(0, lastSeq + 1, minBuf - 1));
            log.info("[claude-chat] 会话 {} 回放空洞：客户端 lastSeq={}，缓冲最旧={}，缺 {}~{}",
                    ctx.sessionId, lastSeq, minBuf, lastSeq + 1, minBuf - 1);
        }
    }

    /** 回放缓冲中 seq>lastSeq 的事件——只发给刚 attach 的这条连接（已在看的连接不重复收）。 */
    void replayBuffer(SessionCtx ctx, WebSocketSession ws, long lastSeq) {
        List<ServerMessage> pending;
        synchronized (ctx.buffer) {
            pending = ctx.buffer.stream().filter(m -> m.seq() > lastSeq).toList();
        }
        for (ServerMessage m : pending) {
            writeTo(ws, m);
        }
    }

    /**
     * 重连后重投仍未决的权限/提问请求，确保弹窗重新出现。
     * 仅当其 seq 未被本次 replayBuffer 覆盖（已读过）时补发，避免重复下发。
     */
    void redeliverPending(SessionCtx ctx, WebSocketSession ws, long lastSeq) {
        ServerMessage p = ctx.pendingRequest;
        if (p != null && p.seq() <= lastSeq) {
            writeTo(ws, p);
        }
    }

    /** 打 seq + 入缓冲 + 广播给本会话所有观察者。用于所有来自 sidecar 的实时事件。 */
    ServerMessage sendToBrowser(SessionCtx ctx, SeqMessageFactory factory) {
        ServerMessage msg = factory.build(ctx.seq.incrementAndGet());
        synchronized (ctx.buffer) {
            ctx.buffer.addLast(msg);
            while (ctx.buffer.size() > eventBufferSize.getAsInt()) {
                ctx.buffer.pollFirst();
            }
        }
        broadcast(ctx, msg);
        return msg;
    }

    /** 广播给会话所有在看的连接，顺手清掉已关闭的。 */
    void broadcast(SessionCtx ctx, ServerMessage msg) {
        for (WebSocketSession w : ctx.viewers) {
            if (w.isOpen()) {
                writeTo(w, msg);
            } else {
                ctx.viewers.remove(w);
            }
        }
    }

    /** 把一条消息发给指定连接（广播逐个调用 / 回放定向发给新连接）。 */
    void writeTo(WebSocketSession ws, ServerMessage msg) {
        if (ws == null || !ws.isOpen()) return;
        ServerMessage visibleMessage = SessionExecutionPolicy.isReviewOnly(
                SessionExecutionPolicy.forWebSocket(ws.getUri()))
                ? ReviewPublicMessageProjector.projectRealtime(msg) : msg;
        if (visibleMessage == null) return;
        try {
            synchronized (ws) {
                ws.sendMessage(new TextMessage(mapper.writeValueAsString(visibleMessage)));
            }
        } catch (IOException e) {
            log.debug("[claude-chat] 写浏览器失败：{}", e.getMessage());
        }
    }

    void sendError(WebSocketSession ws, long seq, String code, String message) {
        sendError(ws, seq, code, message, true);
    }

    /** 请求被拒绝不代表当前活动轮次已经结束。 */
    void sendError(WebSocketSession ws, long seq, String code, String message, boolean terminal) {
        try {
            String json = mapper.writeValueAsString(new ServerMessage.Error(seq, code, message, terminal));
            if (ws.isOpen()) ws.sendMessage(new TextMessage(json));
        } catch (IOException ignore) {
        }
    }

    @FunctionalInterface
    interface SeqMessageFactory {
        ServerMessage build(long seq);
    }
}
