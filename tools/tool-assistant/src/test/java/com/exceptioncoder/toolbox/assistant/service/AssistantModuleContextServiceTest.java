package com.exceptioncoder.toolbox.assistant.service;

import com.exceptioncoder.toolbox.assistant.repository.AssistantModuleContextRepository;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 用户隔离的模块探索摘要缓存测试。 */
class AssistantModuleContextServiceTest {

    private AssistantModuleContextService service;
    private JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new SingleConnectionDataSource("jdbc:sqlite::memory:", true));
        jdbc.execute("""
                CREATE TABLE assistant_module_context_cache (
                    id TEXT PRIMARY KEY, creator_user_id INTEGER NOT NULL, app_id TEXT NOT NULL,
                    module_key TEXT NOT NULL, route TEXT NOT NULL, source_revision TEXT NOT NULL,
                    summary_text TEXT NOT NULL, expires_at INTEGER NOT NULL,
                    create_time INTEGER NOT NULL, update_time INTEGER NOT NULL)
                """);
        jdbc.execute("""
                CREATE UNIQUE INDEX uk_assistant_module_context_owner
                ON assistant_module_context_cache(creator_user_id, app_id, module_key)
                """);
        service = new AssistantModuleContextService(new AssistantModuleContextRepository(jdbc));
        authenticate(7L);
    }

    @AfterEach
    void tearDown() {
        AuthContext.clear();
    }

    @Test
    void savesAndResolvesMatchingRevisionForCurrentUser() {
        service.save("ERP", "order-detail", "/orders/42", "2026.08", "审核状态由订单状态决定");

        AssistantModuleContextService.ResolveResult result = service.resolve(
                "ERP", "order-detail", "/orders/99", "2026.08");

        assertThat(result.found()).isTrue();
        assertThat(result.summary()).isEqualTo("审核状态由订单状态决定");
        assertThat(result.expiresAt()).isGreaterThan(result.updatedAt());
    }

    @Test
    void missesForAnotherUserOrChangedRevision() {
        service.save("ERP", "order-detail", "/orders/42", "v1", "历史探索");

        assertThat(service.resolve("ERP", "order-detail", "/orders/42", "v2").found()).isFalse();
        authenticate(8L);
        assertThat(service.resolve("ERP", "order-detail", "/orders/42", "v1").found()).isFalse();
    }

    @Test
    void atomicallyRefreshesTheSameUserModule() {
        service.save("ERP", "order-detail", "/orders/42", "v1", "旧摘要");
        service.save("ERP", "order-detail", "/orders/42", "v1", "新摘要");

        assertThat(service.resolve("ERP", "order-detail", "/orders/42", "v1").summary()).isEqualTo("新摘要");
    }

    @Test
    void missesWhenTheStoredSummaryHasExpired() {
        service.save("ERP", "order-detail", "/orders/42", "v1", "过期摘要");
        jdbc.update("UPDATE assistant_module_context_cache SET expires_at = ?", 1L);

        assertThat(service.resolve("ERP", "order-detail", "/orders/42", "v1").found()).isFalse();
    }

    @Test
    void rejectsOversizedSummary() {
        assertThatThrownBy(() -> service.save(
                "ERP", "order-detail", "/orders/42", "v1", "x".repeat(6_001)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("6000");
    }

    private void authenticate(long userId) {
        AuthContext.set(new AuthPrincipal(userId, "user", List.of("USER"), List.of(), "jti", Long.MAX_VALUE));
    }
}
