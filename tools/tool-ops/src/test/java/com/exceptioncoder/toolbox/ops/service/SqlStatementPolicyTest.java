package com.exceptioncoder.toolbox.ops.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SqlStatementPolicyTest {

    @Test
    void classifiesReadDmlAndDdlStatements() {
        assertThat(SqlStatementPolicy.analyze("select 1;").statementType())
                .isEqualTo(SqlStatementPolicy.StatementType.READ);
        assertThat(SqlStatementPolicy.analyze("update orders set status = 1").statementType())
                .isEqualTo(SqlStatementPolicy.StatementType.DML);
        assertThat(SqlStatementPolicy.analyze("alter table orders add note varchar(20)").statementType())
                .isEqualTo(SqlStatementPolicy.StatementType.DDL);
    }

    @Test
    void permitsDelimitersInCommentsQuotesAndBackticks() {
        assertThat(SqlStatementPolicy.analyze(
                "-- example; only\nselect 'a;b' as `semi;colon`").statementType())
                .isEqualTo(SqlStatementPolicy.StatementType.READ);
    }

    @Test
    void rejectsBlankAndMultipleStatements() {
        assertThatThrownBy(() -> SqlStatementPolicy.analyze("  "))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> SqlStatementPolicy.analyze("select 1; delete from orders"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("一次只能");
    }
}
