package com.exceptioncoder.toolbox.claudechat.domain.delegation;

/** 会话委托领域规则拒绝操作时抛出的稳定异常。 */
public class SessionGrantException extends RuntimeException {

    private final SessionClientErrorCode code;

    /**
     * 创建领域异常。
     *
     * @param code 稳定错误码
     * @param message 可安全展示的原因
     */
    public SessionGrantException(SessionClientErrorCode code, String message) {
        super(message);
        this.code = code;
    }

    /**
     * 返回稳定错误码。
     *
     * @return Session Client 错误码
     */
    public SessionClientErrorCode code() {
        return code;
    }
}
