package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.common.session.SessionOwnershipPort;
import org.springframework.stereotype.Service;

/** 对外暴露 Claude Chat 会话所有权判断，不泄漏模块内部 Repository。 */
@Service
public class ClaudeChatSessionOwnershipAdapter implements SessionOwnershipPort {

    private final ClaudeChatSessionAccessPolicy accessPolicy;

    public ClaudeChatSessionOwnershipAdapter(ClaudeChatSessionAccessPolicy accessPolicy) {
        this.accessPolicy = accessPolicy;
    }

    @Override
    public boolean canCurrentUserAccess(String sessionId) {
        return accessPolicy.canAccessCurrentUser(sessionId);
    }
}
