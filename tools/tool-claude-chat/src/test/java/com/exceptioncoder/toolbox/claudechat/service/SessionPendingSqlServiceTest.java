package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SessionPendingSql;
import com.exceptioncoder.toolbox.claudechat.domain.SqlDdlEvidence;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionPendingSqlRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Optional;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionPendingSqlServiceTest {

    private SessionPendingSqlRepository repository;
    private ClaudeChatSessionRepository sessionRepository;
    private SqlDdlEvidenceService ddlEvidenceService;
    private SessionPendingSqlService service;

    @BeforeEach
    void setUp() {
        repository = mock(SessionPendingSqlRepository.class);
        sessionRepository = mock(ClaudeChatSessionRepository.class);
        ddlEvidenceService = mock(SqlDdlEvidenceService.class);
        service = new SessionPendingSqlService(repository, sessionRepository, ddlEvidenceService);
        when(sessionRepository.findById("session-1")).thenReturn(Optional.of(mock(ClaudeChatSession.class)));
        when(ddlEvidenceService.verifyRegistration(
                org.mockito.ArgumentMatchers.eq("session-1"),
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.nullable(String.class)))
                .thenReturn(new SqlDdlEvidence(
                        "evidence-1", SqlDdlEvidence.STATUS_VERIFIED, "test", "ddl-baseline.md",
                        List.of("QUOTE"), List.of("QUOTE"), List.of(), List.of("test"), Map.of(),
                        "已核验", 123L));
    }

    @Test
    void saveNormalizesInputAndAlwaysReturnsToPending() {
        SessionPendingSql existing = new SessionPendingSql(
                "session-1", "旧标题", "测试库", "DDL", "ALTER TABLE old_table;",
                SessionPendingSql.STATUS_EXECUTED, 100L, 200L, 200L);
        when(repository.findBySessionId("session-1")).thenReturn(existing);

        SessionPendingSql result = service.save(
                "session-1", "  新标题  ", " 生产库 ", "dml", "  UPDATE sample SET value = 1;  ");

        ArgumentCaptor<SessionPendingSql> captor = ArgumentCaptor.forClass(SessionPendingSql.class);
        verify(repository).upsert(captor.capture());
        SessionPendingSql saved = captor.getValue();
        assertThat(saved.title()).isEqualTo("新标题");
        assertThat(saved.targetEnvironment()).isEqualTo("生产库");
        assertThat(saved.changeType()).isEqualTo(SessionPendingSql.TYPE_DML);
        assertThat(saved.sqlText()).isEqualTo("UPDATE sample SET value = 1;");
        assertThat(saved.status()).isEqualTo(SessionPendingSql.STATUS_PENDING);
        assertThat(saved.createdAt()).isEqualTo(100L);
        assertThat(saved.executedAt()).isNull();
        assertThat(result).isEqualTo(saved);
    }

    @Test
    void executedStatusWritesExecutionTimeWithoutExecutingSql() {
        SessionPendingSql existing = new SessionPendingSql(
                "session-1", null, null, "MIXED", "SELECT 1;",
                SessionPendingSql.STATUS_PENDING, 100L, 100L, null);
        when(repository.findBySessionId("session-1")).thenReturn(existing);

        SessionPendingSql result = service.updateStatus("session-1", "executed");

        assertThat(result.status()).isEqualTo(SessionPendingSql.STATUS_EXECUTED);
        assertThat(result.executedAt()).isNotNull();
        verify(repository).updateStatus(
                org.mockito.ArgumentMatchers.eq("session-1"),
                org.mockito.ArgumentMatchers.eq(SessionPendingSql.STATUS_EXECUTED),
                org.mockito.ArgumentMatchers.anyLong(),
                org.mockito.ArgumentMatchers.anyLong());
    }

    @Test
    void rejectsBlankSqlAndUnknownStatus() {
        assertThatThrownBy(() -> service.save("session-1", null, null, "DDL", "  "))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("SQL 内容不能为空");

        SessionPendingSql existing = new SessionPendingSql(
                "session-1", null, null, "DDL", "CREATE TABLE sample(id INTEGER);",
                SessionPendingSql.STATUS_PENDING, 100L, 100L, null);
        when(repository.findBySessionId("session-1")).thenReturn(existing);
        assertThatThrownBy(() -> service.updateStatus("session-1", "FAILED"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不支持的 SQL 登记状态");
    }

    @Test
    void forgeToolAppendsDistinctSqlAndMergesChangeType() {
        SessionPendingSql existing = new SessionPendingSql(
                "session-1", "新增报价表", "SRM 测试库", "DDL", "CREATE TABLE quote(id BIGINT);",
                SessionPendingSql.STATUS_PENDING, 100L, 100L, null);
        when(repository.findBySessionId("session-1")).thenReturn(existing);

        SessionPendingSql result = service.registerFromTool(
                "session-1", null, null, "DML", "INSERT INTO quote(id) VALUES (1);", "append", null);

        ArgumentCaptor<SessionPendingSql> captor = ArgumentCaptor.forClass(SessionPendingSql.class);
        verify(repository).upsert(captor.capture());
        assertThat(captor.getValue().sqlText()).contains("CREATE TABLE quote", "INSERT INTO quote");
        assertThat(captor.getValue().changeType()).isEqualTo(SessionPendingSql.TYPE_MIXED);
        assertThat(captor.getValue().title()).isEqualTo("新增报价表");
        assertThat(result.status()).isEqualTo(SessionPendingSql.STATUS_PENDING);
    }

    @Test
    void forgeToolIsIdempotentAndRejectsSelectOnlySql() {
        SessionPendingSql existing = new SessionPendingSql(
                "session-1", "新增报价表", "SRM 测试库", "DDL", "CREATE TABLE quote(id BIGINT);",
                SessionPendingSql.STATUS_EXECUTED, 100L, 200L, 200L,
                SqlDdlEvidence.STATUS_VERIFIED, "test", "ddl-baseline.md", "evidence-1",
                List.of("QUOTE"), List.of(), 123L);
        when(repository.findBySessionId("session-1")).thenReturn(existing);

        SessionPendingSql unchanged = service.registerFromTool(
                "session-1", "新增报价表", "SRM 测试库", "DDL", "CREATE TABLE quote(id BIGINT);", "append", null);

        assertThat(unchanged).isSameAs(existing);
        assertThat(unchanged.status()).isEqualTo(SessionPendingSql.STATUS_EXECUTED);
        assertThatThrownBy(() -> service.registerFromTool(
                "session-1", null, null, "DML", "SELECT * FROM quote", "append", null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("纯查询 SQL");
    }
}
