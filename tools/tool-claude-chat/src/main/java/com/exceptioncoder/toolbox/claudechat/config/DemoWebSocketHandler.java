package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.claudechat.api.dto.ServerMessage;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatService;
import com.exceptioncoder.toolbox.claudechat.service.WelfareDemoSandboxProvisioner;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.UUID;

/**
 * 免登录的福利签收演示 WS 端点 /api/claude-chat/demo/ws。握手不挂 AdminHandshakeInterceptor，公开可连。
 *
 * <p>每个连接 open 时供给一份一次性副本（克隆 welfare-sign 源码 + 独立 demo 库），以副本为 cwd 建演示会话；
 * 仅支持 open / send / interrupt；断连即销毁副本。约束（只能改副本内文件、只能改 welfare_sign_* 表）由
 * sidecar canUseTool 与后端 SQL 服务硬保证。</p>
 */
@Slf4j
@Component
public class DemoWebSocketHandler extends TextWebSocketHandler {

    private static final int MSG_LIMIT = 256 * 1024;

    private final WelfareDemoProperties props;
    private final WelfareDemoSandboxProvisioner provisioner;
    private final ClaudeChatService service;
    private final ObjectMapper mapper;
    private final String demoApiBase;

    public DemoWebSocketHandler(WelfareDemoProperties props,
                                WelfareDemoSandboxProvisioner provisioner,
                                ClaudeChatService service,
                                ObjectMapper mapper,
                                @Value("${server.port:18080}") int serverPort) {
        this.props = props;
        this.provisioner = provisioner;
        this.service = service;
        this.mapper = mapper;
        this.demoApiBase = "http://127.0.0.1:" + serverPort;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession ws) {
        if (!props.isEnabled()) {
            sendErrorAndClose(ws, "DISABLED", "福利签收演示未开启");
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
        } catch (Exception e) {
            sendErrorAndClose(ws, "BAD_MESSAGE", "消息解析失败");
            return;
        }
        // 演示开放：开会话 / 发消息 / 中断 / 回灌决策（AskUserQuestion 等用户作答）。其它一律忽略。
        if (msg instanceof ClientMessage.Open) {
            openDemo(ws);
        } else if (msg instanceof ClientMessage.Send send) {
            service.sendUserMessage(ws, send);
        } else if (msg instanceof ClientMessage.Decision d) {
            service.decision(ws, d);
        } else if (msg instanceof ClientMessage.Interrupt) {
            service.interrupt(ws);
        }
    }

    private void openDemo(WebSocketSession ws) {
        String sessionId = "demo-" + UUID.randomUUID();
        try {
            WelfareDemoSandboxProvisioner.Sandbox sb = provisioner.provision(sessionId);
            service.openDemoSession(ws, sessionId, sb.dir().toString(), demoApiBase);
        } catch (ResponseStatusException e) {
            sendErrorAndClose(ws, "DEMO_UNAVAILABLE", e.getReason());
        } catch (RuntimeException e) {
            log.warn("[welfare-demo] 供给副本失败：{}", e.getMessage());
            sendErrorAndClose(ws, "DEMO_FAILED", "演示环境准备失败");
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession ws, CloseStatus status) {
        service.onBrowserDisconnected(ws);
    }

    private void sendErrorAndClose(WebSocketSession ws, String code, String msg) {
        try {
            String json = mapper.writeValueAsString(new ServerMessage.Error(0, code, msg));
            if (ws.isOpen()) {
                ws.sendMessage(new TextMessage(json));
                ws.close(new CloseStatus(1011, code));
            }
        } catch (IOException ignore) {
            // 连接已断，无需处理
        }
    }
}
