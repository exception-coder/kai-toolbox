package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.claudechat.api.dto.VoiceOffer;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** 按发起连接绑定原生语音；SDP 与实时字幕不经过持久消息回放。 */
@Service
public class SessionVoiceService {
    private static final Logger log = LoggerFactory.getLogger(SessionVoiceService.class);
    private static final int MAX_SDP_CHARS = 64_000;
    private final Map<String, Binding> bindings = new ConcurrentHashMap<>();
    private final SidecarClient sidecar;
    private final ObjectMapper mapper;

    public SessionVoiceService(SidecarClient sidecar, ObjectMapper mapper) {
        this.sidecar = sidecar;
        this.mapper = mapper;
    }

    /** 会话快照提供的能力边界，禁止由客户端指定。 */
    public record Eligibility(String engine, String executionPolicy, String gateway, Boolean demo) {
    }

    private record Binding(String callId, WebSocketSession owner) {
    }

    /**
     * 由已绑定会话提供的重连依据。
     * @param sessionId 当前连接所属会话
     * @param eligibility 服务端能力边界
     * @param offer 新音频协商
     * @param writable 当前规划是否允许交互
     */
    public record Reconnection(String sessionId, Eligibility eligibility, VoiceOffer offer, boolean writable) {
    }

    /** 重连只发送音频事件，失败不终结或重启正在运行的代码任务。 */
    public void reconnect(WebSocketSession ws, Reconnection request) {
        Binding binding = new Binding(request.offer().callId(), ws);
        try {
            if (!request.writable()) {
                throw new IllegalArgumentException("该规划已过期，请先解锁后恢复语音");
            }
            validate(request.eligibility(), request.offer());
            startBinding(request.sessionId(), binding, request.offer(), true);
        } catch (RuntimeException exception) {
            send(binding, Map.of("type", "voiceEvent", "callId", String.valueOf(binding.callId()),
                    "event", "error", "message", exception.getMessage() == null ? "语音重连失败" : exception.getMessage()));
        }
    }

    public void bind(WebSocketSession ws, String sessionId, Eligibility eligibility, VoiceOffer offer) {
        if (offer == null) {
            return;
        }
        validate(eligibility, offer);
        Binding binding = new Binding(offer.callId(), ws);
        startBinding(sessionId, binding, offer, false);
    }

    private void startBinding(String sessionId, Binding binding, VoiceOffer offer, boolean reconnect) {
        Binding previous = reconnect ? bindings.put(sessionId, binding) : bindings.putIfAbsent(sessionId, binding);
        if (!reconnect && previous != null) {
            throw new IllegalArgumentException("当前会话已有语音连接，请先结束通话");
        }
        if (reconnect && previous != null) {
            send(previous, Map.of("type", "voiceEvent", "callId", previous.callId(),
                    "event", "closed", "message", "语音已转移到另一设备"));
        }
        try {
            boolean sent = reconnect ? sidecar.reconnectVoice(sessionId, offer) : sidecar.prepareVoice(sessionId, offer);
            if (!sent) {
                throw new IllegalArgumentException("语音启动未送达，请恢复会话连接后重试");
            }
        } catch (RuntimeException exception) {
            bindings.remove(sessionId, binding);
            if (reconnect && previous != null) {
                stopQuietly(sessionId, previous);
            }
            throw exception;
        }
    }

    static void validate(Eligibility eligibility, VoiceOffer offer) {
        if (!"codex".equals(eligibility.engine())
                || (!SessionExecutionPolicy.STANDARD.equals(eligibility.executionPolicy())
                    && !SessionExecutionPolicy.CONSULT_READONLY.equals(eligibility.executionPolicy()))
                || (eligibility.gateway() != null && !eligibility.gateway().isBlank())
                || Boolean.TRUE.equals(eligibility.demo())) {
            throw new IllegalArgumentException("原生语音仅支持官方 Codex 的开发或咨询会话");
        }
        if (offer.callId() == null || !offer.callId().matches("[a-zA-Z0-9_-]{1,100}")
                || offer.sdp() == null || !offer.sdp().startsWith("v=0")
                || offer.sdp().length() > MAX_SDP_CHARS) {
            throw new IllegalArgumentException("语音连接参数无效，请重新开始");
        }
    }

    public void control(WebSocketSession ws, ClientMessage.VoiceControl command) {
        if (command.sessionId() == null || command.callId() == null) {
            throw new IllegalArgumentException("缺少语音会话标识");
        }
        Binding binding = bindings.get(command.sessionId());
        if (binding == null || binding.owner() != ws || !binding.callId().equals(command.callId())) {
            return;
        }
        if (!"stop".equals(command.action()) && !"heartbeat".equals(command.action())) {
            throw new IllegalArgumentException("不支持的语音操作");
        }
        if (!sidecar.controlVoice(command.sessionId(), command.callId(), command.action())) {
            bindings.remove(command.sessionId(), binding);
            send(binding, Map.of("type", "voiceEvent", "callId", binding.callId(),
                    "event", "error", "message", "语音连接已断开，请重新开始"));
        }
    }

    /** 连接切换或断开时停止通话，但不发送代码任务 interrupt。 */
    public void disconnect(WebSocketSession ws) {
        bindings.forEach((sessionId, binding) -> {
            if (binding.owner() == ws && bindings.remove(sessionId, binding)) {
                stopQuietly(sessionId, binding);
            }
        });
    }

    public void cancel(String sessionId) {
        Binding binding = bindings.remove(sessionId);
        if (binding != null) {
            stopQuietly(sessionId, binding);
        }
    }

    public void sidecarDisconnected() {
        bindings.forEach((sessionId, binding) -> {
            if (bindings.remove(sessionId, binding)) {
                send(binding, Map.of("type", "voiceEvent", "callId", binding.callId(),
                        "event", "error", "message", "语音服务已断开，请恢复连接后重新开始"));
            }
        });
    }

    private void stopQuietly(String sessionId, Binding binding) {
        try {
            sidecar.controlVoice(sessionId, binding.callId(), "stop");
        } catch (RuntimeException exception) {
            log.warn("[claude-chat] 语音停止未送达，由租约清理 session={}", sessionId);
        }
    }

    /** 返回 true 表示已消费瞬时事件，普通轮次事件继续交给原消息流程。 */
    public boolean observe(String sessionId, JsonNode event) {
        boolean voiceEvent = "voiceEvent".equals(event.path("type").asText());
        Binding binding = bindings.get(sessionId);
        if (binding == null) {
            return voiceEvent;
        }
        if (voiceEvent && binding.callId().equals(event.path("callId").asText())) {
            send(binding, event);
            String kind = event.path("event").asText();
            if ("closed".equals(kind) || "error".equals(kind)) {
                bindings.remove(sessionId, binding);
            }
        } else if ("result".equals(event.path("type").asText())) {
            bindings.remove(sessionId, binding);
            send(binding, Map.of("type", "voiceEvent", "callId", binding.callId(), "event", "closed"));
        }
        return voiceEvent;
    }

    private void send(Binding binding, Object event) {
        WebSocketSession ws = binding.owner();
        try {
            synchronized (ws) {
                if (ws.isOpen()) {
                    ws.sendMessage(new TextMessage(mapper.writeValueAsString(event)));
                }
            }
        } catch (IOException exception) {
            disconnect(ws);
        }
    }
}
