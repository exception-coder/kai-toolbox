package com.exceptioncoder.toolbox.lanshare.domain;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.web.socket.WebSocketSession;

@Getter
@RequiredArgsConstructor
public class DeviceSession {
    private final String deviceId;
    private final String nickname;
    private final long joinedAt;
    private final WebSocketSession wsSession;
}
