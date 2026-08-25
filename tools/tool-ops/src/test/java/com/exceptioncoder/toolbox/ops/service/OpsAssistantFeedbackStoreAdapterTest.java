package com.exceptioncoder.toolbox.ops.service;

import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort;
import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort.FeedbackCandidate;
import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort.FeedbackCategory;
import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort.FeedbackContext;
import com.exceptioncoder.toolbox.common.requirement.RequirementType;
import com.exceptioncoder.toolbox.ops.domain.DatasourceType;
import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;
import com.exceptioncoder.toolbox.ops.domain.OpsSystem;
import com.exceptioncoder.toolbox.ops.repository.DatasourceRepository;
import com.exceptioncoder.toolbox.ops.repository.SystemRepository;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Assistant 反馈直接复用 Ops MySQL 连接池的回归测试。 */
class OpsAssistantFeedbackStoreAdapterTest {

    private final SystemRepository systems = mock(SystemRepository.class);
    private final DatasourceRepository datasources = mock(DatasourceRepository.class);
    private final OpsDataSourcePool pool = mock(OpsDataSourcePool.class);

    @Test
    void resolvesYoooniOnePoolAndWritesCandidatesInTransaction() throws Exception {
        OpsSystem system = OpsSystem.builder().id("system-1").code("yoooni-one").build();
        OpsDatasource datasource = mysqlDatasource("mysql-1", "公网业务库");
        Connection connection = mock(Connection.class);
        Statement schemaStatement = mock(Statement.class);
        PreparedStatement preparedStatement = mock(PreparedStatement.class);
        when(systems.findByCode("yoooni-one")).thenReturn(Optional.of(system));
        when(datasources.findMysqlBySystemAndEnvironment("system-1", "PROD"))
                .thenReturn(List.of(datasource));
        when(pool.borrowSql(datasource)).thenReturn(connection);
        when(connection.createStatement()).thenReturn(schemaStatement);
        when(connection.prepareStatement(anyString())).thenReturn(preparedStatement);
        when(connection.getAutoCommit()).thenReturn(true);
        OpsAssistantFeedbackStoreAdapter adapter = new OpsAssistantFeedbackStoreAdapter(
                systems, datasources, pool, "", "yoooni-one", "PROD", "");

        adapter.saveCandidates(command());

        verify(schemaStatement).execute(anyString());
        verify(preparedStatement).addBatch();
        verify(preparedStatement).executeBatch();
        verify(connection).commit();
        verify(connection).setAutoCommit(true);
    }

    @Test
    void explicitDatasourceMustBeMysql() {
        OpsDatasource datasource = OpsDatasource.builder()
                .id("oracle-1")
                .type(DatasourceType.ORACLE)
                .build();
        when(datasources.findById("oracle-1")).thenReturn(Optional.of(datasource));
        OpsAssistantFeedbackStoreAdapter adapter = new OpsAssistantFeedbackStoreAdapter(
                systems, datasources, pool, "oracle-1", "", "", "");

        assertThatThrownBy(() -> adapter.saveCandidates(command()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("必须为 MySQL");
    }

    @Test
    void ambiguousPoolSelectionFailsBeforeBorrowingConnection() {
        OpsSystem system = OpsSystem.builder().id("system-1").code("yoooni-one").build();
        when(systems.findByCode("yoooni-one")).thenReturn(Optional.of(system));
        when(datasources.findMysqlBySystemAndEnvironment("system-1", "PROD"))
                .thenReturn(List.of(mysqlDatasource("mysql-1", "主库"), mysqlDatasource("mysql-2", "备库")));
        OpsAssistantFeedbackStoreAdapter adapter = new OpsAssistantFeedbackStoreAdapter(
                systems, datasources, pool, "", "yoooni-one", "PROD", "");

        assertThatThrownBy(() -> adapter.saveCandidates(command()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("匹配数必须为 1");
    }

    private OpsDatasource mysqlDatasource(String id, String name) {
        return OpsDatasource.builder()
                .id(id)
                .type(DatasourceType.MYSQL)
                .env("PROD")
                .name(name)
                .build();
    }

    private AssistantFeedbackStorePort.SaveCommand command() {
        FeedbackContext context = new FeedbackContext(
                7L, "session-1", "yoooni-one", "/new-product-progress", "新品生产进度");
        FeedbackCandidate candidate = new FeedbackCandidate(
                "candidate-1", 30L, FeedbackCategory.BUG, RequirementType.BUG_FIX,
                "导出失败", 0.95D, "已有功能失败", 1_000L);
        return new AssistantFeedbackStorePort.SaveCommand(context, List.of(candidate));
    }
}
