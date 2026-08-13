package com.exceptioncoder.toolbox.ops.service;

import com.exceptioncoder.toolbox.ops.api.dto.SqlCheckResult;
import com.exceptioncoder.toolbox.ops.domain.DatasourceType;
import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;
import org.junit.jupiter.api.Test;

import java.sql.CallableStatement;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Statement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.matches;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class SqlConnectorTest {

    @Test
    void mysqlCheckPreparesButNeverExecutesTargetSql() throws Exception {
        OpsDataSourcePool pool = mock(OpsDataSourcePool.class);
        Connection connection = mock(Connection.class);
        PreparedStatement bind = mock(PreparedStatement.class);
        Statement statement = mock(Statement.class);
        OpsDatasource datasource = OpsDatasource.builder().id("mysql-dev").type(DatasourceType.MYSQL).build();
        when(pool.borrowSql(datasource)).thenReturn(connection);
        when(connection.prepareStatement(startsWith("SET @toolbox_sql_check_"))).thenReturn(bind);
        when(connection.createStatement()).thenReturn(statement);

        SqlCheckResult result = new SqlConnector(pool).check(datasource, "update orders set status = 1");

        assertThat(result.status()).isEqualTo(SqlCheckResult.Status.VALID);
        verify(bind).setString(1, "update orders set status = 1");
        verify(statement).execute(matches("^PREPARE toolbox_sql_check_[a-f0-9]+ FROM @toolbox_sql_check_[a-f0-9]+$"));
        verify(statement).execute(matches("^DEALLOCATE PREPARE toolbox_sql_check_[a-f0-9]+$"));
        verify(statement, never()).execute(matches("^EXECUTE\\b.*"));
    }

    @Test
    void oracleDdlCheckIsRejectedBeforeOpeningConnection() {
        OpsDataSourcePool pool = mock(OpsDataSourcePool.class);
        OpsDatasource datasource = OpsDatasource.builder().id("oracle-prod").type(DatasourceType.ORACLE).build();

        SqlCheckResult result = new SqlConnector(pool).check(datasource, "drop table orders");

        assertThat(result.status()).isEqualTo(SqlCheckResult.Status.UNSUPPORTED);
        assertThat(result.message()).contains("隐式提交");
        verifyNoInteractions(pool);
    }

    @Test
    void oracleDmlCheckParsesWithoutExecutingTargetSql() throws Exception {
        OpsDataSourcePool pool = mock(OpsDataSourcePool.class);
        Connection connection = mock(Connection.class);
        CallableStatement statement = mock(CallableStatement.class);
        OpsDatasource datasource = OpsDatasource.builder().id("oracle-dev").type(DatasourceType.ORACLE).build();
        when(pool.borrowSql(datasource)).thenReturn(connection);
        when(connection.prepareCall(anyString())).thenReturn(statement);

        SqlCheckResult result = new SqlConnector(pool).check(datasource, "delete from orders where id = :id");

        assertThat(result.status()).isEqualTo(SqlCheckResult.Status.VALID);
        verify(statement).setString(1, "delete from orders where id = :id");
        verify(statement).execute();
    }
}
