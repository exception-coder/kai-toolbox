package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SessionStatus;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionPlanStateRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 会话规划状态的运行中保护和可写规则测试。
 */
class SessionPlanStateServiceTest {

    private ClaudeChatSessionRepository sessionRepository;
    private SessionPlanStateRepository stateRepository;
    private SessionPlanStateService service;

    @BeforeEach
    void setUp() {
        sessionRepository = mock(ClaudeChatSessionRepository.class);
        stateRepository = mock(SessionPlanStateRepository.class);
        service = new SessionPlanStateService(sessionRepository, stateRepository);
    }

    /** 活跃运行中的会话不能被规划过期操作锁定。 */
    @Test
    void rejectsRunningLiveSession() {
        ClaudeChatSession session = ClaudeChatSession.builder()
                .id("session-1")
                .status(SessionStatus.RUNNING)
                .build();
        when(sessionRepository.findById("session-1")).thenReturn(Optional.of(session));

        SessionPlanStateService.ExpireResult result = service.expire("session-1", true);

        assertThat(result).isEqualTo(SessionPlanStateService.ExpireResult.RUNNING);
        verify(stateRepository, never()).expire(eq("session-1"), anyLong());
    }

    /** 持久化过期状态是启动新一轮消息的唯一否决条件。 */
    @Test
    void deniesWritingOnlyWhenPlanExpired() {
        when(stateRepository.planExpired("session-1")).thenReturn(true);
        when(stateRepository.planExpired("session-2")).thenReturn(false);

        assertThat(service.writable("session-1")).isFalse();
        assertThat(service.writable("session-2")).isTrue();
    }
}
