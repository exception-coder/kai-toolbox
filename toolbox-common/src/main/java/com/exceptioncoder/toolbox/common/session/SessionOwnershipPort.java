package com.exceptioncoder.toolbox.common.session;

/** 跨工具查询当前认证用户是否拥有指定会话的稳定端口。 */
public interface SessionOwnershipPort {

    /**
     * 判断当前认证用户能否访问会话。
     *
     * @param sessionId 会话标识
     * @return true 表示允许访问
     */
    boolean canCurrentUserAccess(String sessionId);
}
