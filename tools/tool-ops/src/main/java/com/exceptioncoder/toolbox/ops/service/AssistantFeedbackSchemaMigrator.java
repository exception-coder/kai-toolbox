package com.exceptioncoder.toolbox.ops.service;

import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Locale;

/** 将 Assistant 反馈表幂等迁移到当前三层正文模型。 */
final class AssistantFeedbackSchemaMigrator {
    private static final String SCHEMA_RESOURCE = "mysql/assistant-feedback-schema.sql";
    private static final String CANDIDATE_TABLE = "assistant_feedback_candidate";

    /** 创建新表并迁移既有候选表。 */
    void migrate(Connection connection) throws SQLException, IOException {
        executeSchema(connection);
        applyTableComments(connection);
        boolean legacyContentExists = hasColumn(connection, CANDIDATE_TABLE, "feedback_content");
        addContentColumns(connection);
        if (legacyContentExists) {
            backfillLegacyContent(connection);
        }
        enforceRequiredContent(connection);
        if (legacyContentExists) {
            dropLegacyContent(connection);
        }
    }

    private void applyTableComments(Connection connection) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.execute("ALTER TABLE assistant_feedback_candidate "
                    + "COMMENT='彩虹胶囊自动识别的 Bug、优化建议和需求反馈候选主表'");
            statement.execute("ALTER TABLE assistant_feedback_candidate_revision "
                    + "COMMENT='反馈候选的 AI 原稿及用户历次修订记录'");
            statement.execute("ALTER TABLE assistant_feedback_candidate_attachment "
                    + "COMMENT='反馈候选关联的会话图片与附件元数据'");
        }
    }

    private void executeSchema(Connection connection) throws SQLException, IOException {
        String ddl = new ClassPathResource(SCHEMA_RESOURCE).getContentAsString(StandardCharsets.UTF_8);
        try (Statement statement = connection.createStatement()) {
            for (String part : ddl.split(";")) {
                if (!part.isBlank()) {
                    statement.execute(part.trim());
                }
            }
        }
    }

    private void addContentColumns(Connection connection) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            if (!hasColumn(connection, CANDIDATE_TABLE, "source_content")) {
                statement.execute("ALTER TABLE assistant_feedback_candidate "
                        + "ADD COLUMN source_content TEXT NULL AFTER requirement_type");
            }
            if (!hasColumn(connection, CANDIDATE_TABLE, "ai_optimized_content")) {
                statement.execute("ALTER TABLE assistant_feedback_candidate "
                        + "ADD COLUMN ai_optimized_content TEXT NULL AFTER source_content");
            }
            if (!hasColumn(connection, CANDIDATE_TABLE, "user_rewritten_content")) {
                statement.execute("ALTER TABLE assistant_feedback_candidate "
                        + "ADD COLUMN user_rewritten_content TEXT NULL AFTER ai_optimized_content");
            }
        }
    }

    private void backfillLegacyContent(Connection connection) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.execute("UPDATE assistant_feedback_candidate SET source_content=feedback_content "
                    + "WHERE source_content IS NULL");
            statement.execute("""
                    UPDATE assistant_feedback_candidate candidate
                    LEFT JOIN assistant_feedback_candidate_revision original
                      ON original.candidate_id=candidate.id AND original.revision_no=0
                    SET candidate.ai_optimized_content=COALESCE(
                      candidate.ai_optimized_content, original.feedback_content, candidate.feedback_content)
                    WHERE candidate.ai_optimized_content IS NULL
                    """);
            statement.execute("""
                    UPDATE assistant_feedback_candidate candidate
                    JOIN assistant_feedback_candidate_revision user_revision
                      ON user_revision.candidate_id=candidate.id AND user_revision.revision_source='USER'
                    LEFT JOIN assistant_feedback_candidate_revision newer_revision
                      ON newer_revision.candidate_id=user_revision.candidate_id
                     AND newer_revision.revision_source='USER'
                     AND newer_revision.revision_no>user_revision.revision_no
                    SET candidate.user_rewritten_content=user_revision.feedback_content
                    WHERE candidate.user_rewritten_content IS NULL AND newer_revision.id IS NULL
                    """);
        }
    }

    private void enforceRequiredContent(Connection connection) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.execute("ALTER TABLE assistant_feedback_candidate "
                    + "MODIFY COLUMN source_content TEXT NOT NULL");
            statement.execute("ALTER TABLE assistant_feedback_candidate "
                    + "MODIFY COLUMN ai_optimized_content TEXT NOT NULL");
        }
    }

    private void dropLegacyContent(Connection connection) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.execute("ALTER TABLE assistant_feedback_candidate DROP COLUMN feedback_content");
        }
    }

    private boolean hasColumn(Connection connection, String table, String column) throws SQLException {
        DatabaseMetaData metadata = connection.getMetaData();
        try (ResultSet result = metadata.getColumns(connection.getCatalog(), null, table, column)) {
            if (result.next()) {
                return true;
            }
        }
        try (ResultSet result = metadata.getColumns(connection.getCatalog(), null,
                table.toUpperCase(Locale.ROOT), column.toUpperCase(Locale.ROOT))) {
            return result.next();
        }
    }
}
