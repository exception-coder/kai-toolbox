package com.exceptioncoder.toolbox.claudechat.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class DiagnosticDbReadOnlyPolicyTest {

    @Test
    void acceptsSingleSelectOrWithAcrossAllDiagnosticConnections() {
        assertThat(ErpDbService.isReadOnly("SELECT status FROM orders WHERE id = ?")).isTrue();
        assertThat(SrmDbService.isReadOnly("WITH target AS (SELECT id FROM orders WHERE id = ?) SELECT * FROM target")).isTrue();
        assertThat(ScmDbService.isReadOnly("SELECT 1")).isTrue();
    }

    @Test
    void rejectsWritesDdlAndMultipleStatements() {
        for (String sql : new String[]{
                "UPDATE orders SET status = 'DONE'", "DROP TABLE orders",
                "SELECT * FROM orders; DELETE FROM orders", "CALL rebuild_orders()"}) {
            assertThat(ErpDbService.isReadOnly(sql)).as(sql).isFalse();
            assertThat(SrmDbService.isReadOnly(sql)).as(sql).isFalse();
            assertThat(ScmDbService.isReadOnly(sql)).as(sql).isFalse();
        }
    }
}
