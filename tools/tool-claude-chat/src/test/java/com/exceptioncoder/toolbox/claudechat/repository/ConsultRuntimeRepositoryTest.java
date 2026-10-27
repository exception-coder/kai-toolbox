package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import static org.assertj.core.api.Assertions.*;

class ConsultRuntimeRepositoryTest {
    private ConsultRuntimeRepository repository;
    private JdbcTemplate jdbc;

    @BeforeEach
    void setUp() throws Exception {
        jdbc = new JdbcTemplate(new SingleConnectionDataSource("jdbc:sqlite::memory:", true));
        String schema = new String(getClass().getResourceAsStream("/db/claude-consult-runtime-schema.sql").readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        for (String statement : schema.split(";")) if (!statement.isBlank()) jdbc.execute(statement);
        repository = new ConsultRuntimeRepository(jdbc, new ObjectMapper());
    }

    @Test
    void longSqlAndSupplementaryUnicodeRoundTripThroughBoundedPaging() {
        String sql = "SELECT '最新修正😀' AS 业务规则\n" + "x".repeat(71000) + "; -- 有效SQL末尾";
        repository.append("s", "sql", "assistant", sql, true);
        StringBuilder text = new StringBuilder();
        int offset = 0;
        for (int i = 0; i < 100; i++) {
            var page = repository.read("s", offset, 997);
            assertThat(page.nextOffset()).isGreaterThan(offset);
            text.append(page.text());
            offset = page.nextOffset();
            if (page.complete()) break;
        }
        assertThat(text.toString()).endsWith(sql);
    }

    @Test
    void duplicateRequestDoesNotCreateSecondRunAndSegmentsAreKept() {
        repository.segment("a", "s", "A", "native-A", 1);
        repository.segment("b", "s", "B", null, 2);
        repository.request("s", "request", "turn", "b", "B", 2);
        assertThatThrownBy(() -> repository.request("s", "request", "turn2", "b", "B", 2))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(repository.hasRequest("s", "request")).isTrue();
        assertThat(repository.hasRequest("other-user-session", "request")).isFalse();
        repository.initialized("b", "native-B");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM claude_consult_segment", Integer.class)).isEqualTo(2);
        assertThat(repository.latest("s").orElseThrow().nativeId()).isEqualTo("native-B");
    }

    @Test
    void savedHistoryAndGapsAreIndependentOfAiCredentialsAndPaginate() {
        repository.imported("s", "旧历史缺失");
        for (int i = 0; i < 5; i++) repository.importMessage("s", ChatMessageView.user("u" + i, "条件" + i, 10L));
        var last = repository.messages("s", null, 2);
        assertThat(last.items()).extracting(ChatMessageView::text).containsExactly("条件3", "条件4");
        assertThat(repository.messages("s", last.nextBefore(), 3).items()).hasSize(3);
        assertThat(repository.read("s", 0, 500).gap()).isEqualTo("旧历史缺失");
        assertThat(repository.messages("other", null, 30).items()).isEmpty();
    }

    @Test
    void toolResultRetainsOriginalSqlInputAndGeneratedFileReferences() {
        repository.importMessage("s", ChatMessageView.tool("t", "query", java.util.Map.of("sql", "SELECT '正确规则'"), null, false, 1L));
        repository.importMessage("s", ChatMessageView.tool("t", "query", null, "downloadUrl=/original/file", false, 2L));
        var page = repository.read("s", 0, 5000);
        assertThat(page.text()).contains("SELECT '正确规则'", "downloadUrl=/original/file");
        assertThat(repository.messages("s", null, 30).items()).hasSize(1);
    }
}
