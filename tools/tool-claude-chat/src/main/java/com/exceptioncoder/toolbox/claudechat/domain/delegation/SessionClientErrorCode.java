package com.exceptioncoder.toolbox.claudechat.domain.delegation;

/** Session Client 稳定错误码及其默认可重试语义。 */
public enum SessionClientErrorCode {
    /** 身份或授权令牌缺失、无效或过期。 */
    AUTHENTICATION_REQUIRED(false),
    /** 授权已被永久撤销。 */
    GRANT_REVOKED(false),
    /** 授权已过期。 */
    GRANT_EXPIRED(false),
    /** 授权由所有者暂停。 */
    GRANT_PAUSED(true),
    /** 邀请无效、过期、已使用或主体不匹配。 */
    INVITATION_INVALID(false),
    /** WebSocket ticket 无效、过期或已使用。 */
    CONNECTION_TICKET_INVALID(true),
    /** 请求命令不在公共白名单中。 */
    COMMAND_UNSUPPORTED(false),
    /** 客户端携带了过期的会话版本。 */
    SESSION_VERSION_CONFLICT(true),
    /** 授权的轮数、输入或附件额度已耗尽。 */
    LIMIT_EXCEEDED(false),
    /** 请求内容或附件不符合约束。 */
    INVALID_INPUT(false),
    /** 历史事件已离开回放窗口。 */
    REPLAY_GAP(true),
    /** 本机 Forge 暂时不可用。 */
    HOST_OFFLINE(true),
    /** 服务端发生未分类故障。 */
    SERVER_ERROR(true);

    private final boolean retryable;

    SessionClientErrorCode(boolean retryable) {
        this.retryable = retryable;
    }

    /**
     * 返回客户端是否可在状态变化后重试。
     *
     * @return 可重试标记
     */
    public boolean retryable() {
        return retryable;
    }
}
