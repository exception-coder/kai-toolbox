package com.exceptioncoder.toolbox.common.requirement;

/** 需求类型事实的来源。 */
public enum RequirementTypeSource {
    /** 调用方显式提供并通过白名单校验。 */
    EXPLICIT,
    /** 由受控 AI 分类器生成。 */
    AI,
    /** 从已持久化的 PRD 会话同步。 */
    PRD_SESSION,
    /** 尚无可靠来源。 */
    UNKNOWN
}
