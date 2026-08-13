package com.exceptioncoder.toolbox.ops.service;

import com.exceptioncoder.toolbox.ops.api.dto.SqlQueryResult;
import com.exceptioncoder.toolbox.ops.domain.DatasourceType;
import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;
import com.exceptioncoder.toolbox.ops.repository.QueryHistoryRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OpsQueryServiceTest {

    private OpsDatasourceService datasources;
    private QueryHistoryRepository histories;
    private SqlConnector sqlConnector;
    private OpsQueryService service;
    private OpsDatasource datasource;

    @BeforeEach
    void setUp() {
        datasources = mock(OpsDatasourceService.class);
        histories = mock(QueryHistoryRepository.class);
        sqlConnector = mock(SqlConnector.class);
        service = new OpsQueryService(datasources, histories, sqlConnector,
                mock(RedisConnector.class), new ObjectMapper());
        datasource = OpsDatasource.builder().id("mysql-dev").type(DatasourceType.MYSQL).build();
        when(datasources.findRequired("mysql-dev")).thenReturn(datasource);
    }

    @Test
    void rejectsWriteWithoutExplicitConfirmation() throws Exception {
        assertThatThrownBy(() -> service.sqlQuery(
                "mysql-dev", "update orders set status = 1", 1000, false))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageStartingWith(OpsQueryService.WRITE_CONFIRMATION_REQUIRED);

        verify(sqlConnector, never()).query(any(), any(), any());
        verify(histories, never()).insert(any());
    }

    @Test
    void executesConfirmedWriteAndRecordsIt() throws Exception {
        when(sqlConnector.query(eq(datasource), any(), eq(1000)))
                .thenReturn(new SqlQueryResult(List.of(), List.of(), 0, 2, false, 8));

        service.sqlQuery("mysql-dev", "update orders set status = 1;", 1000, true);

        verify(sqlConnector).query(datasource, "update orders set status = 1", 1000);
        verify(histories).insert(any());
    }

    @Test
    void executesSelectThroughReadOnlyConnectorEvenOnWritableEndpoint() throws Exception {
        when(sqlConnector.queryReadOnly(eq(datasource), any(), eq(1000)))
                .thenReturn(new SqlQueryResult(List.of("id"), List.of(List.of("1")), 1, -1, false, 3));

        service.sqlQuery("mysql-dev", "select id from orders", 1000, false);

        verify(sqlConnector).queryReadOnly(datasource, "select id from orders", 1000);
        verify(sqlConnector, never()).query(any(), any(), any());
    }
}
