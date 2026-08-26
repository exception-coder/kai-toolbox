package com.exceptioncoder.toolbox.ops.service;

import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.Statement;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Assistant 反馈候选三层正文迁移测试。 */
class AssistantFeedbackSchemaMigratorTest {

    @Test
    void migratesLegacyContentIntoThreeExplicitColumns() throws Exception {
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        Statement statement = mock(Statement.class);
        when(connection.getCatalog()).thenReturn("yoooni-one");
        when(connection.getMetaData()).thenReturn(metadata);
        when(connection.createStatement()).thenReturn(statement);
        when(metadata.getColumns(anyString(), isNull(), anyString(), anyString())).thenAnswer(invocation -> {
            ResultSet columns = mock(ResultSet.class);
            String column = invocation.getArgument(3);
            when(columns.next()).thenReturn("feedback_content".equalsIgnoreCase(column));
            return columns;
        });

        new AssistantFeedbackSchemaMigrator().migrate(connection);

        verify(statement).execute(contains("ADD COLUMN source_content"));
        verify(statement).execute(contains("ADD COLUMN ai_optimized_content"));
        verify(statement).execute(contains("ADD COLUMN user_rewritten_content"));
        verify(statement, atLeastOnce()).execute(
                contains("COMMENT='彩虹胶囊自动识别的 Bug、优化建议和需求反馈候选主表'"));
        verify(statement, atLeastOnce()).execute(contains("COMMENT='反馈候选的 AI 原稿及用户历次修订记录'"));
        verify(statement, atLeastOnce()).execute(contains("COMMENT='反馈候选关联的会话图片与附件元数据'"));
        verify(statement).execute(contains("SET source_content=feedback_content"));
        verify(statement).execute(contains("candidate.ai_optimized_content=COALESCE"));
        verify(statement).execute(contains("candidate.user_rewritten_content=user_revision.feedback_content"));
        verify(statement).execute(contains("DROP COLUMN feedback_content"));
    }
}
