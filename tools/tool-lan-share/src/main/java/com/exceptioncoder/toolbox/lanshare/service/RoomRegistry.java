package com.exceptioncoder.toolbox.lanshare.service;

import com.exceptioncoder.toolbox.lanshare.domain.DeviceSession;
import com.exceptioncoder.toolbox.lanshare.domain.Room;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RoomRegistry {

    private final Map<String, Room> rooms = new ConcurrentHashMap<>();

    /**
     * 反查表：WebSocketSession.id → 房间号 + deviceId，
     * 用于 WS close 时快速定位并清理（无需遍历所有房间）。
     */
    private final Map<String, Binding> sessionIndex = new ConcurrentHashMap<>();

    public record Binding(String roomId, String deviceId) {}

    public record JoinResult(boolean roomFull, DeviceSession evictedOldSession, List<DeviceSession> peers) {
        public static JoinResult full() {
            return new JoinResult(true, null, List.of());
        }
    }

    public JoinResult join(String roomId, String deviceId, String nickname, WebSocketSession ws) {
        Room room = rooms.computeIfAbsent(roomId, Room::new);
        if (room.wouldExceedCapacity(deviceId)) {
            return JoinResult.full();
        }
        DeviceSession ds = new DeviceSession(deviceId, nickname, System.currentTimeMillis(), ws);
        DeviceSession evicted = room.addOrReplace(ds);
        sessionIndex.put(ws.getId(), new Binding(roomId, deviceId));
        // 替换旧会话时，旧 ws.id 的反查表条目仍指向同 deviceId；后续旧 ws close 时会触发 leave，
        // 我们在 leave 里用 deviceId 比对当前在册者，避免误删新会话。
        List<DeviceSession> peers = room.snapshotOthers(deviceId);
        return new JoinResult(false, evicted, peers);
    }

    public Binding leaveBySession(WebSocketSession ws) {
        Binding b = sessionIndex.remove(ws.getId());
        if (b == null) return null;
        Room room = rooms.get(b.roomId());
        if (room == null) return b;
        DeviceSession current = room.find(b.deviceId());
        if (current == null || !current.getWsSession().getId().equals(ws.getId())) {
            // 当前在册者已经是更新会话（同 deviceId 重连后），不能删
            return null;
        }
        DeviceSession removed = room.remove(b.deviceId());
        if (removed != null && room.isEmpty()) {
            rooms.remove(b.roomId());
        }
        return removed != null ? b : null;
    }

    public Binding leaveByDeviceId(String deviceId, WebSocketSession ws) {
        Binding b = sessionIndex.get(ws.getId());
        if (b == null || !b.deviceId().equals(deviceId)) return null;
        return leaveBySession(ws);
    }

    public DeviceSession findInRoom(String roomId, String deviceId) {
        Room room = rooms.get(roomId);
        return room == null ? null : room.find(deviceId);
    }

    public List<DeviceSession> snapshotOthers(String roomId, String excludeDeviceId) {
        Room room = rooms.get(roomId);
        return room == null ? List.of() : room.snapshotOthers(excludeDeviceId);
    }

    public Binding bindingOf(WebSocketSession ws) {
        return sessionIndex.get(ws.getId());
    }

    /**
     * 转发信令（按 to 查目标会话），返回目标会话；目标不存在返回 null。
     * payload 不解析，原样透传。
     */
    public DeviceSession resolveTarget(String roomId, String toDeviceId, JsonNode payload) {
        Room room = rooms.get(roomId);
        if (room == null) return null;
        return room.find(toDeviceId);
    }
}
