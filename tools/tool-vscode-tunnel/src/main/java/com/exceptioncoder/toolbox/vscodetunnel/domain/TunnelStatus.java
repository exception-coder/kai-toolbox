package com.exceptioncoder.toolbox.vscodetunnel.domain;

import java.time.Instant;

/**
 * 隧道当前状态的不可变快照。通过 GET /status 与 SSE 事件下发到前端。
 * 字段全部允许为 null（除 state 外），含义随 state 决定：
 * - STOPPED: 仅 state
 * - STARTING: state + tunnelName + pid + startedAt
 * - AUTH_REQUIRED: 上述 + deviceCode + deviceLoginUrl
 * - RUNNING: STARTING 字段 + tunnelUrl
 * - ERROR: state + lastError
 */
public record TunnelStatus(
        TunnelState state,
        String tunnelUrl,
        String deviceCode,
        String deviceLoginUrl,
        String tunnelName,
        Long pid,
        Instant startedAt,
        String lastError
) {

    public static final String DEFAULT_DEVICE_LOGIN_URL = "https://github.com/login/device";

    public static TunnelStatus stopped() {
        return new TunnelStatus(TunnelState.STOPPED, null, null, null, null, null, null, null);
    }

    public TunnelStatus withState(TunnelState next) {
        return new TunnelStatus(next, tunnelUrl, deviceCode, deviceLoginUrl, tunnelName, pid, startedAt, lastError);
    }

    public TunnelStatus withTunnelUrl(String url) {
        return new TunnelStatus(state, url, deviceCode, deviceLoginUrl, tunnelName, pid, startedAt, lastError);
    }

    public TunnelStatus withDeviceCode(String code) {
        return new TunnelStatus(state, tunnelUrl, code, DEFAULT_DEVICE_LOGIN_URL, tunnelName, pid, startedAt, lastError);
    }

    public TunnelStatus withError(String err) {
        return new TunnelStatus(state, tunnelUrl, deviceCode, deviceLoginUrl, tunnelName, pid, startedAt, err);
    }
}
