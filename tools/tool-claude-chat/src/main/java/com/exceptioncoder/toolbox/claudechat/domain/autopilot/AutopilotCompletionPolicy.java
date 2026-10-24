package com.exceptioncoder.toolbox.claudechat.domain.autopilot;

/** 自动监督完成证据的强度。 */
public enum AutopilotCompletionPolicy {
    OPEN_SPEC_STRICT,
    /** 需求驱动的有界持续执行；完成仅表示 Agent 自验，不代表严格规格验收。 */
    REQUIREMENT_BEST_EFFORT
}
