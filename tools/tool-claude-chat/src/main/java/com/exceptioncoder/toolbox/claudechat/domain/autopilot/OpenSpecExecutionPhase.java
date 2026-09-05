package com.exceptioncoder.toolbox.claudechat.domain.autopilot;

/** OpenSpec change 的运行时完成阶段。 */
public enum OpenSpecExecutionPhase {
    APPLY,
    VERIFY,
    QUALITY_GATE,
    STRICT_VALIDATE,
    ARCHIVE,
    DONE
}
