package com.exceptioncoder.toolbox.claudechat.domain.autopilot;

/** Agent 通过受限进度工具提交的候选处置。 */
public enum AutopilotDisposition {
    CONTINUE,
    COMPLETE,
    WAITING_USER,
    BLOCKED,
    FAILED
}
