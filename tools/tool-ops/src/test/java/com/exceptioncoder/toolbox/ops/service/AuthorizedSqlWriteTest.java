package com.exceptioncoder.toolbox.ops.service;

import com.exceptioncoder.toolbox.common.resource.SqlWriteAuthorization;
import com.exceptioncoder.toolbox.ops.api.dto.SqlQueryResult;
import com.exceptioncoder.toolbox.ops.domain.DatasourceType;
import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;
import com.exceptioncoder.toolbox.ops.repository.QueryHistoryRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.sql.SQLException;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 临时本地历史库 + 模拟外部连接器，验证授权声明、边界与持久去重；不写真实资源。 */
class AuthorizedSqlWriteTest {
    private static final String SQL = "update orders set status=1 where id=7";
    private static final String REQUEST_ID = "2736707c-75c2-4beb-9ba5-31c04edd1531";
    private static final String HISTORY_ID = "forge-sql-write:" + REQUEST_ID;
    private static final SqlWriteAuthorization AUTH = new SqlWriteAuthorization(
            "session", "允许执行测试库订单 7 的状态更新", "TEST/orders/id=7/status=1", REQUEST_ID);
    @TempDir Path directory;
    private JdbcTemplate jdbc;
    private OpsDatasource datasource;
    private OpsDatasourceService datasources;
    private SqlConnector connector;
    private QueryHistoryRepository history;
    private OpsQueryService service;

    @BeforeEach void setUp() throws Exception {
        jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:sqlite:" + directory.resolve("history.db")));
        for (String statement : new ClassPathResource("db/ops-schema.sql")
                .getContentAsString(StandardCharsets.UTF_8).split(";")) {
            if (!statement.isBlank()) jdbc.execute(statement);
        }
        datasource = OpsDatasource.builder().id("test-db").env("TEST").type(DatasourceType.MYSQL).build();
        datasources = mock(OpsDatasourceService.class);
        when(datasources.findRequired("test-db")).thenReturn(datasource);
        connector = mock(SqlConnector.class);
        history = new QueryHistoryRepository(jdbc);
        service = createService(history);
    }

    private OpsQueryService createService(QueryHistoryRepository repository) {
        return new OpsQueryService(datasources, repository, connector, mock(RedisConnector.class), new ObjectMapper());
    }

    @Test void recordsBeforeExecutionAndReusesSuccessAfterRecreatingService() throws Exception {
        when(connector.query(eq(datasource), eq(SQL), eq(200))).thenAnswer(invocation -> {
            var claimed = history.findById(HISTORY_ID).orElseThrow();
            assertEquals("RUNNING", claimed.getStatus());
            assertTrue(claimed.getContent().contains(AUTH.userInstruction()));
            assertTrue(claimed.getContent().contains(AUTH.scope()));
            assertTrue(claimed.getContent().contains(AUTH.sessionId()));
            assertThrows(IllegalStateException.class, () -> service.authorizedSqlWrite("test-db", SQL, AUTH));
            return new SqlQueryResult(List.of(), List.of(), 0, 1, false, 8);
        });
        var first = service.authorizedSqlWrite("test-db", SQL + ";", AUTH);
        var repeated = createService(new QueryHistoryRepository(jdbc)).authorizedSqlWrite("test-db", SQL, AUTH);
        assertEquals("OK", repeated.status());
        assertEquals(first.result(), repeated.result());
        assertEquals(1, history.findByDatasource("test-db", 20).size());
        assertEquals("OK", history.findById(HISTORY_ID).orElseThrow().getStatus());
        verify(connector, times(1)).query(any(), any(), any());
    }

    @Test void rejectsMissingOrMalformedDeclarationsAndNonDdlDmlBeforeClaim() throws Exception {
        assertThrows(IllegalArgumentException.class, () -> service.authorizedSqlWrite("test-db", SQL, null));
        for (var invalid : List.of(
                new SqlWriteAuthorization("session", " ", AUTH.scope(), REQUEST_ID),
                new SqlWriteAuthorization("session", AUTH.userInstruction(), "", REQUEST_ID),
                new SqlWriteAuthorization("", AUTH.userInstruction(), AUTH.scope(), REQUEST_ID),
                new SqlWriteAuthorization("session", AUTH.userInstruction(), AUTH.scope(), "new-request"))) {
            assertThrows(IllegalArgumentException.class, () -> service.authorizedSqlWrite("test-db", SQL, invalid));
        }
        for (String sql : List.of(SQL + "; delete from orders", "select 1", "call repair_orders()")) {
            assertThrows(IllegalArgumentException.class, () -> service.authorizedSqlWrite("test-db", sql, AUTH));
        }
        assertTrue(history.findByDatasource("test-db", 20).isEmpty());
        verify(connector, never()).query(any(), any(), any());
    }

    @Test void rejectsProductionUnknownAndNonSqlResourcesEvenWithAuthorization() throws Exception {
        for (String env : new String[]{"PROD", "production", "", null}) {
            datasource.setEnv(env);
            assertThrows(IllegalArgumentException.class, () -> service.authorizedSqlWrite("test-db", SQL, AUTH));
        }
        datasource.setEnv("TEST");
        datasource.setType(DatasourceType.REDIS);
        assertThrows(IllegalArgumentException.class, () -> service.authorizedSqlWrite("test-db", SQL, AUTH));
        assertTrue(history.findByDatasource("test-db", 20).isEmpty());
        verify(connector, never()).query(any(), any(), any());
    }

    @Test void uncertainDatabaseResponseIsPersistedAndNeverReplayed() throws Exception {
        when(connector.query(any(), any(), any())).thenThrow(new SQLException("连接在提交后中断"));
        var exception = assertThrows(IllegalArgumentException.class,
                () -> service.authorizedSqlWrite("test-db", SQL, AUTH));
        assertTrue(exception.getMessage().contains("SQL_WRITE_RESULT_UNKNOWN"));
        assertEquals("UNKNOWN", history.findById(HISTORY_ID).orElseThrow().getStatus());
        assertThrows(IllegalStateException.class,
                () -> createService(new QueryHistoryRepository(jdbc)).authorizedSqlWrite("test-db", SQL, AUTH));
        assertThrows(IllegalArgumentException.class, () -> service.authorizedSqlWrite("test-db", SQL + " and id=8", AUTH));
        var changed = new SqlWriteAuthorization("other-session", AUTH.userInstruction(), AUTH.scope(), REQUEST_ID);
        assertThrows(IllegalArgumentException.class, () -> service.authorizedSqlWrite("test-db", SQL, changed));
        verify(connector, times(1)).query(any(), any(), any());
    }

    @Test void localResultRecordingFailureLeavesClaimAndDoesNotRepeatRemoteWrite() throws Exception {
        var unavailable = new QueryHistoryRepository(jdbc) {
            @Override public void finishSqlWrite(String id, String status, Integer rows, Long elapsed,
                                                  String error, String result) {
                throw new IllegalStateException("本地记录写入中断");
            }
        };
        when(connector.query(any(), any(), any()))
                .thenReturn(new SqlQueryResult(List.of(), List.of(), 0, 1, false, 8));
        var exception = assertThrows(IllegalStateException.class,
                () -> createService(unavailable).authorizedSqlWrite("test-db", SQL, AUTH));
        assertTrue(exception.getMessage().contains("SQL_WRITE_RESULT_UNKNOWN"));
        assertEquals("RUNNING", history.findById(HISTORY_ID).orElseThrow().getStatus());
        assertThrows(IllegalStateException.class, () -> service.authorizedSqlWrite("test-db", SQL, AUTH));
        verify(connector, times(1)).query(any(), any(), any());
    }
}
