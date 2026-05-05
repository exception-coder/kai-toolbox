package com.exceptioncoder.toolbox.lanshare.api.dto;

import com.exceptioncoder.toolbox.lanshare.domain.DeviceSession;

public record PeerView(String deviceId, String nickname, long joinedAt) {
    public static PeerView from(DeviceSession ds) {
        return new PeerView(ds.getDeviceId(), ds.getNickname(), ds.getJoinedAt());
    }
}
