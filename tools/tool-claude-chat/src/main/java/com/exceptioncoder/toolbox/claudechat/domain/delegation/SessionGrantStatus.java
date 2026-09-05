package com.exceptioncoder.toolbox.claudechat.domain.delegation;

/** 会话委托授权的生命周期状态。 */
public enum SessionGrantStatus {
    /** 授权有效，可建立连接并提交命令。 */
    ACTIVE,
    /** 所有者暂时停止参与者访问，可恢复。 */
    PAUSED,
    /** 所有者永久撤销授权。 */
    REVOKED,
    /** 授权已超过有效期。 */
    EXPIRED
}
