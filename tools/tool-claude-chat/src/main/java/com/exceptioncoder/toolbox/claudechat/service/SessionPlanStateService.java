package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SessionPlanState;
import com.exceptioncoder.toolbox.claudechat.domain.SessionStatus;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionPlanStateRepository;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.Map;

/**
 * 会话规划过期、解锁和发送许可的聚焦业务服务。
 */
@Service("claudeChatSessionPlanStateService")
public class SessionPlanStateService {

    private final ClaudeChatSessionRepository sessionRepository;
    private final SessionPlanStateRepository stateRepository;

    public SessionPlanStateService(ClaudeChatSessionRepository sessionRepository,
                                   SessionPlanStateRepository stateRepository) {
        this.sessionRepository = sessionRepository;
        this.stateRepository = stateRepository;
    }

    /**
     * 批量读取会话规划状态，供列表视图一次组装。
     *
     * @param sessionIds 逻辑会话 ID 集合
     * @return 状态映射
     */
    public Map<String, SessionPlanState> listStates(Collection<String> sessionIds) {
        return stateRepository.findBySessionIds(sessionIds);
    }

    /**
     * 标记空闲会话规划过期；运行中或不存在时返回明确结果。
     *
     * @param sessionId 逻辑会话 ID
     * @param live 会话是否仍连接活跃 sidecar
     * @return 标记结果
     */
    public ExpireResult expire(String sessionId, boolean live) {
        ClaudeChatSession session = sessionRepository.findById(sessionId).orElse(null);
        if (session == null) {
            return ExpireResult.NOT_FOUND;
        }
        if (live && SessionStatus.RUNNING.equals(session.getStatus())) {
            return ExpireResult.RUNNING;
        }
        stateRepository.expire(sessionId, System.currentTimeMillis());
        return ExpireResult.SUCCESS;
    }

    /**
     * 显式解除会话规划锁定。
     *
     * @param sessionId 逻辑会话 ID
     * @return 会话存在时返回 true
     */
    public boolean unlock(String sessionId) {
        if (sessionRepository.findById(sessionId).isEmpty()) {
            return false;
        }
        stateRepository.unlock(sessionId, System.currentTimeMillis());
        return true;
    }

    /**
     * 判断会话是否允许启动新一轮用户消息。
     *
     * @param sessionId 逻辑会话 ID
     * @return 未过期时返回 true
     */
    public boolean writable(String sessionId) {
        return !stateRepository.planExpired(sessionId);
    }

    /** 标记规划过期的业务结果。 */
    public enum ExpireResult {
        /** 标记成功。 */
        SUCCESS,
        /** 会话不存在。 */
        NOT_FOUND,
        /** 会话仍在运行。 */
        RUNNING
    }
}
