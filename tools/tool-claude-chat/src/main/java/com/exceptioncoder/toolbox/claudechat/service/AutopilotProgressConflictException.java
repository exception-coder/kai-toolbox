package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotState;

/** Progress reports cannot override a paused run or a pending human decision. */
public final class AutopilotProgressConflictException extends RuntimeException {
    private final AutopilotState state;
    private final long version;

    public AutopilotProgressConflictException(AutopilotState state, long version) {
        super("自动监督当前状态为 " + state + "，不能接收进度；读取当前运行后按版本调用 actions/resume 恢复");
        this.state = state;
        this.version = version;
    }

    public AutopilotState state() {
        return state;
    }

    public long version() {
        return version;
    }
}
