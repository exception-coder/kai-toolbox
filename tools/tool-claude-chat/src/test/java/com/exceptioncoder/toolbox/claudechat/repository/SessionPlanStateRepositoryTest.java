package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.SessionPlanState;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 会话规划状态持久化的幂等与批量读取测试。
 */
class SessionPlanStateRepositoryTest {

    private SessionPlanStateRepository repository;

    @BeforeEach
    void setUp() {
        SingleConnectionDataSource dataSource = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("""
                CREATE TABLE claude_chat_session_plan_state (
                    id TEXT PRIMARY KEY,
                    plan_expired INTEGER NOT NULL DEFAULT 0,
                    expired_at INTEGER,
                    unlocked_at INTEGER,
                    create_time INTEGER NOT NULL,
                    update_time INTEGER NOT NULL
                )
                """);
        repository = new SessionPlanStateRepository(jdbc);
    }

    /** 标记与解锁应保留最近时间并正确切换可写状态。 */
    @Test
    void expiresAndUnlocksSessionIdempotently() {
        repository.expire("session-1", 100L);
        repository.expire("session-1", 200L);

        assertThat(repository.planExpired("session-1")).isTrue();
        SessionPlanState expired = repository.findBySessionIds(List.of("session-1")).get("session-1");
        assertThat(expired.expiredAt()).isEqualTo(200L);

        repository.unlock("session-1", 300L);

        assertThat(repository.planExpired("session-1")).isFalse();
        SessionPlanState unlocked = repository.findBySessionIds(List.of("session-1")).get("session-1");
        assertThat(unlocked.expiredAt()).isEqualTo(200L);
        assertThat(unlocked.unlockedAt()).isEqualTo(300L);
    }

    /** 批量读取只返回存在状态行的会话，缺失项由服务层按未过期处理。 */
    @Test
    void listsOnlyPersistedStates() {
        repository.expire("session-1", 100L);

        Map<String, SessionPlanState> states = repository.findBySessionIds(List.of("session-1", "session-2"));

        assertThat(states).containsOnlyKeys("session-1");
        assertThat(repository.findBySessionIds(List.of())).isEmpty();
    }
}
