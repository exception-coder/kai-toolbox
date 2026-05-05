package com.exceptioncoder.toolbox.lanshare.service;

import com.exceptioncoder.toolbox.lanshare.api.dto.PeerView;
import com.exceptioncoder.toolbox.lanshare.domain.DeviceSession;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.List;
import java.util.regex.Pattern;

@Slf4j
@Component
@RequiredArgsConstructor
public class SignalingWebSocketHandler extends TextWebSocketHandler {

    private static final Pattern ROOM_ID_PATTERN = Pattern.compile("^[a-zA-Z0-9_\\-\\u4e00-\\u9fa5]{1,64}$");
    private static final int NICKNAME_MAX = 32;

    private final RoomRegistry registry;
    private final ObjectMapper mapper;

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        JsonNode root;
        try {
            root = mapper.readTree(message.getPayload());
        } catch (Exception e) {
            sendError(session, "invalid-payload", "JSON 解析失败");
            return;
        }
        String type = root.path("type").asText(null);
        if (type == null) {
            sendError(session, "invalid-payload", "缺少 type 字段");
            return;
        }
        switch (type) {
            case "join" -> handleJoin(session, root);
            case "leave" -> handleLeave(session);
            case "signal" -> handleSignal(session, root);
            default -> sendError(session, "invalid-payload", "未知 type: " + type);
        }
    }

    private void handleJoin(WebSocketSession session, JsonNode root) throws IOException {
        String roomId = root.path("roomId").asText("").trim();
        String deviceId = root.path("deviceId").asText("").trim();
        String nickname = root.path("nickname").asText("").trim();

        if (!ROOM_ID_PATTERN.matcher(roomId).matches()) {
            sendError(session, "invalid-payload", "房间号格式不合法");
            session.close(CloseStatus.NOT_ACCEPTABLE);
            return;
        }
        if (deviceId.isEmpty() || deviceId.length() > 128) {
            sendError(session, "invalid-payload", "deviceId 不合法");
            session.close(CloseStatus.NOT_ACCEPTABLE);
            return;
        }
        if (nickname.isEmpty() || nickname.length() > NICKNAME_MAX) {
            sendError(session, "invalid-payload", "昵称长度需 1-" + NICKNAME_MAX);
            session.close(CloseStatus.NOT_ACCEPTABLE);
            return;
        }

        RoomRegistry.JoinResult result = registry.join(roomId, deviceId, nickname, session);
        if (result.roomFull()) {
            sendError(session, "room-full", "房间已满 " + com.exceptioncoder.toolbox.lanshare.domain.Room.MAX_MEMBERS + " 人");
            session.close(CloseStatus.NOT_ACCEPTABLE);
            return;
        }

        // 1) 关闭被替换的旧会话（同 deviceId 重连）
        DeviceSession evicted = result.evictedOldSession();
        if (evicted != null && evicted.getWsSession().isOpen()
                && !evicted.getWsSession().getId().equals(session.getId())) {
            try { evicted.getWsSession().close(CloseStatus.POLICY_VIOLATION.withReason("replaced")); }
            catch (IOException ignore) {}
        }

        // 2) 给本端发 joined（含当前其他成员名册）
        ObjectNode joined = mapper.createObjectNode();
        joined.put("type", "joined");
        joined.put("self", deviceId);
        joined.set("peers", mapper.valueToTree(toViews(result.peers())));
        send(session, joined);

        // 3) 仅"全新加入"才广播 peer-joined（重连不广播，避免对端列表闪烁）
        if (evicted == null) {
            ObjectNode broadcast = mapper.createObjectNode();
            broadcast.put("type", "peer-joined");
            broadcast.set("peer", mapper.valueToTree(new PeerView(deviceId, nickname, System.currentTimeMillis())));
            for (DeviceSession peer : result.peers()) {
                send(peer.getWsSession(), broadcast);
            }
        }
    }

    private void handleLeave(WebSocketSession session) throws IOException {
        RoomRegistry.Binding b = registry.leaveBySession(session);
        if (b != null) broadcastLeft(b);
        try { session.close(CloseStatus.NORMAL); } catch (IOException ignore) {}
    }

    private void handleSignal(WebSocketSession session, JsonNode root) throws IOException {
        RoomRegistry.Binding b = registry.bindingOf(session);
        if (b == null) {
            sendError(session, "not-in-room", "未加入任何房间");
            return;
        }
        String to = root.path("to").asText(null);
        JsonNode payload = root.path("payload");
        if (to == null || payload.isMissingNode()) {
            sendError(session, "invalid-payload", "signal 缺少 to 或 payload");
            return;
        }
        DeviceSession target = registry.findInRoom(b.roomId(), to);
        if (target == null) {
            sendError(session, "peer-not-found", "目标设备不在房间内");
            return;
        }
        ObjectNode forward = mapper.createObjectNode();
        forward.put("type", "signal");
        forward.put("from", b.deviceId());
        forward.set("payload", payload);
        send(target.getWsSession(), forward);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        RoomRegistry.Binding b = registry.leaveBySession(session);
        if (b != null) broadcastLeft(b);
    }

    private void broadcastLeft(RoomRegistry.Binding b) {
        ObjectNode msg = mapper.createObjectNode();
        msg.put("type", "peer-left");
        msg.put("deviceId", b.deviceId());
        for (DeviceSession peer : registry.snapshotOthers(b.roomId(), b.deviceId())) {
            send(peer.getWsSession(), msg);
        }
    }

    private List<PeerView> toViews(List<DeviceSession> sessions) {
        return sessions.stream().map(PeerView::from).toList();
    }

    private void send(WebSocketSession ws, ObjectNode msg) {
        if (!ws.isOpen()) return;
        try {
            ws.sendMessage(new TextMessage(mapper.writeValueAsString(msg)));
        } catch (IOException e) {
            log.warn("send to {} failed: {}", ws.getId(), e.getMessage());
        }
    }

    private void sendError(WebSocketSession ws, String code, String message) {
        ObjectNode msg = mapper.createObjectNode();
        msg.put("type", "error");
        msg.put("code", code);
        msg.put("message", message);
        send(ws, msg);
    }
}
