package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.claudechat.api.dto.ServerMessage;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;

/**
 * 浏览器侧 WS 端点 /api/claude-chat/ws，纯协议适配：解析 {@link ClientMessage} 后转交
 * {@link ClaudeChatService}。会话编排、事件缓冲、通知都在 service。
 */
@Slf4j
@Component
public class ClaudeChatWebSocketHandler extends TextWebSocketHandler {

    private static final int MSG_LIMIT = 256 * 1024;

    private final ClaudeChatProperties props;
    private final ClaudeChatService service;
    private final ObjectMapper mapper;

    public ClaudeChatWebSocketHandler(ClaudeChatProperties props,
                                      ClaudeChatService service,
                                      ObjectMapper mapper) {
        this.props = props;
        this.service = service;
        this.mapper = mapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession ws) {
        if (!props.isEnabled()) {
            sendErrorAndClose(ws, "DISABLED", "Claude 助手已禁用");
            return;
        }
        ws.setTextMessageSizeLimit(MSG_LIMIT);
        ws.setBinaryMessageSizeLimit(MSG_LIMIT);
    }

    @Override
    protected void handleTextMessage(WebSocketSession ws, TextMessage message) {
        ClientMessage msg;
        try {
            msg = mapper.readValue(message.getPayload(), ClientMessage.class);
        } catch (JsonProcessingException e) {
            log.debug("[claude-chat] 非法客户端消息：{}", e.getMessage());
            sendErrorAndClose(ws, "BAD_MESSAGE", "消息解析失败");
            return;
        }

        switch (msg) {
            case ClientMessage.Open open -> service.openSession(ws, open);
            case ClientMessage.Attach attach -> service.attach(ws, attach);
            case ClientMessage.SwitchSession s -> service.switchSession(ws, s);
            case ClientMessage.ResumeHistory rh -> service.resumeHistory(ws, rh);
            case ClientMessage.Send send -> service.sendUserMessage(ws, send);
            case ClientMessage.Decision d -> service.decision(ws, d);
            case ClientMessage.Interrupt ignored -> service.interrupt(ws);
            case ClientMessage.SetMode sm -> service.setMode(ws, sm);
            case ClientMessage.SetModel sm -> service.setModel(ws, sm);
            case ClientMessage.SwitchEngine se -> service.switchEngine(ws, se);
            case ClientMessage.ForkSession fs -> service.forkSession(ws, fs);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession ws, CloseStatus status) {
        // WS 断开 ≠ 终结会话：解绑浏览器，任务继续在 sidecar 跑，等下次 attach。
        service.onBrowserDisconnected(ws);
    }

    @Override
    public void handleTransportError(WebSocketSession ws, Throwable exception) {
        log.debug("[claude-chat] transport error：{}", exception.getMessage());
    }

    private void sendErrorAndClose(WebSocketSession ws, String code, String msg) {
        try {
            String json = mapper.writeValueAsString(new ServerMessage.Error(0, code, msg));
            if (ws.isOpen()) {
                ws.sendMessage(new TextMessage(json));
                ws.close(new CloseStatus(1011, code));
            }
        } catch (IOException ignore) {
        }
    }
}
