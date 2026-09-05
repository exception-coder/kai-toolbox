package com.exceptioncoder.toolbox.claudechat.domain.delegation;

/** 允许投影到业务参与者 Client 的事件类型。 */
public enum SessionClientEventType {
    /** 会话公开摘要及约束已就绪。 */
    READY,
    /** 可展示的用户或助手消息。 */
    MESSAGE,
    /** 命令已被服务端接受。 */
    COMMAND_ACCEPTED,
    /** 会话执行阶段或自动监督进度。 */
    PROGRESS,
    /** 需要业务参与者回答的问题。 */
    BUSINESS_QUESTION,
    /** 当前请求已完成。 */
    COMPLETED,
    /** 当前请求暂时受阻。 */
    BLOCKED,
    /** 客户端请求的事件已不在回放窗口。 */
    REPLAY_GAP,
    /** 稳定错误码描述的失败。 */
    ERROR
}
