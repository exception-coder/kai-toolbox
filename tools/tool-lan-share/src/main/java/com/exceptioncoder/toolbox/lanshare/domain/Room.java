package com.exceptioncoder.toolbox.lanshare.domain;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class Room {

    public static final int MAX_MEMBERS = 10;

    private final String roomId;
    private final Map<String, DeviceSession> members = new LinkedHashMap<>();

    public Room(String roomId) {
        this.roomId = roomId;
    }

    public String roomId() {
        return roomId;
    }

    /**
     * 添加或替换设备会话；返回操作前已存在的旧会话（用于"同 deviceId 重连"语义：踢掉旧 WS、不广播 peer-joined）。
     */
    public synchronized DeviceSession addOrReplace(DeviceSession session) {
        return members.put(session.getDeviceId(), session);
    }

    /**
     * 房间已满检查；同 deviceId 替换不算新增容量。
     */
    public synchronized boolean wouldExceedCapacity(String deviceId) {
        if (members.containsKey(deviceId)) return false;
        return members.size() >= MAX_MEMBERS;
    }

    public synchronized List<DeviceSession> snapshotOthers(String excludeDeviceId) {
        List<DeviceSession> out = new ArrayList<>(members.size());
        for (DeviceSession ds : members.values()) {
            if (!ds.getDeviceId().equals(excludeDeviceId)) out.add(ds);
        }
        return out;
    }

    public synchronized DeviceSession find(String deviceId) {
        return members.get(deviceId);
    }

    public synchronized DeviceSession remove(String deviceId) {
        return members.remove(deviceId);
    }

    public synchronized boolean isEmpty() {
        return members.isEmpty();
    }
}
