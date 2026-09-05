package com.exceptioncoder.toolbox.claudechat.domain.autopilot;

/** 自动监督运行的互斥生命周期状态。 */
public enum AutopilotState {
    ACTIVE,
    PAUSED,
    WAITING_USER,
    FAILED,
    COMPLETED,
    STOPPED;

    public boolean terminal() {
        return this == FAILED || this == COMPLETED || this == STOPPED;
    }
}
