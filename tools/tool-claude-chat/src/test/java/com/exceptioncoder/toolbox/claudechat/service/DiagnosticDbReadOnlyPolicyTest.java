package com.exceptioncoder.toolbox.claudechat.service;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

/** 旧独立连接执行入口不再访问数据库，任何SQL都只能得到迁移提示。 */
class DiagnosticDbReadOnlyPolicyTest {
    @Test void legacyQueriesCannotBypassResourceBindings() {
        for (String sql : new String[]{"select 1", "SELECT * FROM sensitive_table", "update orders set status=1"}) {
            assertThat(new ErpDbService().query(sql, null).error()).contains("已停用");
            assertThat(new SrmDbService().query(sql, null).error()).contains("已停用");
            assertThat(new ScmDbService().query(sql, null).error()).contains("已停用");
        }
    }
    @Test void legacyConnectionTestsDoNotOpenUnknownOrProductionConnections() {
        assertThat(new ErpDbService().test()).contains("已停用");
        assertThat(new SrmDbService().test()).contains("已停用");
        assertThat(new ScmDbService().test()).contains("已停用");
    }
}
