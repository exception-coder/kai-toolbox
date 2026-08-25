package com.exceptioncoder.toolbox.ops.service;

import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort;
import com.exceptioncoder.toolbox.ops.domain.DatasourceType;
import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;
import com.exceptioncoder.toolbox.ops.domain.OpsSystem;
import com.exceptioncoder.toolbox.ops.repository.DatasourceRepository;
import com.exceptioncoder.toolbox.ops.repository.SystemRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/** 复用系统中间件台已登记的 MySQL 连接池保存 Assistant 反馈候选。 */
@Component
public class OpsAssistantFeedbackStoreAdapter implements AssistantFeedbackStorePort {

    private static final String SCHEMA_RESOURCE = "mysql/assistant-feedback-schema.sql";
    private static final String UPSERT_SQL = """
            INSERT INTO assistant_feedback_candidate
              (id, source_system, session_id, source_watermark, creator_user_id,
               feedback_category, requirement_type, feedback_content, confidence,
               classification_reason, page_url, page_title, candidate_status,
               detected_at, create_time, update_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DETECTED', ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              feedback_category = VALUES(feedback_category),
              requirement_type = VALUES(requirement_type),
              feedback_content = VALUES(feedback_content),
              confidence = VALUES(confidence),
              classification_reason = VALUES(classification_reason),
              page_url = VALUES(page_url),
              page_title = VALUES(page_title),
              update_time = VALUES(update_time)
            """;

    private final SystemRepository systems;
    private final DatasourceRepository datasources;
    private final OpsDataSourcePool pool;
    private final String datasourceId;
    private final String systemCode;
    private final String environment;
    private final String datasourceName;
    private final Set<String> initializedDatasources = ConcurrentHashMap.newKeySet();

    public OpsAssistantFeedbackStoreAdapter(
            SystemRepository systems,
            DatasourceRepository datasources,
            OpsDataSourcePool pool,
            @Value("${toolbox.assistant.feedback-store.datasource-id:}") String datasourceId,
            @Value("${toolbox.assistant.feedback-store.system-code:yoooni-one}") String systemCode,
            @Value("${toolbox.assistant.feedback-store.environment:PROD}") String environment,
            @Value("${toolbox.assistant.feedback-store.datasource-name:}") String datasourceName) {
        this.systems = systems;
        this.datasources = datasources;
        this.pool = pool;
        this.datasourceId = normalize(datasourceId);
        this.systemCode = normalize(systemCode);
        this.environment = normalize(environment);
        this.datasourceName = normalize(datasourceName);
    }

    @Override
    public void saveCandidates(SaveCommand command) {
        if (command == null || command.candidates().isEmpty()) {
            return;
        }
        OpsDatasource datasource = resolveDatasource();
        try (Connection connection = pool.borrowSql(datasource)) {
            if (connection.isReadOnly()) {
                throw new IllegalStateException("yoooni-one MySQL 连接池为只读，无法保存反馈候选");
            }
            initializeSchema(connection, datasource.getId());
            writeInTransaction(connection, command);
        } catch (SQLException | IOException exception) {
            throw new DataAccessResourceFailureException("yoooni-one 公网 MySQL 反馈候选写入失败", exception);
        }
    }

    private OpsDatasource resolveDatasource() {
        if (!datasourceId.isBlank()) {
            OpsDatasource datasource = datasources.findById(datasourceId)
                    .orElseThrow(() -> new IllegalStateException(
                            "未找到 Assistant 反馈数据源: " + datasourceId));
            requireMysql(datasource);
            return datasource;
        }
        if (systemCode.isBlank() || environment.isBlank()) {
            throw new IllegalStateException("Assistant 反馈数据源的系统编码和环境未配置");
        }
        OpsSystem system = systems.findByCode(systemCode)
                .orElseThrow(() -> new IllegalStateException(
                        "系统中间件台未登记系统: " + systemCode));
        List<OpsDatasource> matches = datasources.findMysqlBySystemAndEnvironment(system.getId(), environment)
                .stream()
                .filter(candidate -> datasourceName.isBlank()
                        || datasourceName.equalsIgnoreCase(normalize(candidate.getName())))
                .toList();
        if (matches.size() != 1) {
            throw new IllegalStateException("yoooni-one 目标 MySQL 数据源匹配数必须为 1，当前为 " + matches.size());
        }
        return matches.getFirst();
    }

    private void requireMysql(OpsDatasource datasource) {
        if (datasource.getType() != DatasourceType.MYSQL) {
            throw new IllegalStateException("Assistant 反馈数据源必须为 MySQL: " + datasource.getId());
        }
    }

    private void initializeSchema(Connection connection, String selectedDatasourceId)
            throws SQLException, IOException {
        if (initializedDatasources.contains(selectedDatasourceId)) {
            return;
        }
        synchronized (initializedDatasources) {
            if (initializedDatasources.contains(selectedDatasourceId)) {
                return;
            }
            String ddl = new ClassPathResource(SCHEMA_RESOURCE)
                    .getContentAsString(StandardCharsets.UTF_8);
            try (Statement statement = connection.createStatement()) {
                statement.execute(ddl);
            }
            initializedDatasources.add(selectedDatasourceId);
        }
    }

    private void writeInTransaction(Connection connection, SaveCommand command) throws SQLException {
        boolean originalAutoCommit = connection.getAutoCommit();
        connection.setAutoCommit(false);
        try {
            writeBatch(connection, command);
            connection.commit();
        } catch (SQLException exception) {
            rollback(connection, exception);
            throw exception;
        } finally {
            connection.setAutoCommit(originalAutoCommit);
        }
    }

    private void writeBatch(Connection connection, SaveCommand command) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(UPSERT_SQL)) {
            for (FeedbackCandidate candidate : command.candidates()) {
                bind(statement, command.context(), candidate);
                statement.addBatch();
            }
            statement.executeBatch();
        }
    }

    private void bind(PreparedStatement statement, FeedbackContext context,
                      FeedbackCandidate candidate) throws SQLException {
        int index = 1;
        statement.setString(index++, candidate.id());
        statement.setString(index++, context.sourceSystem());
        statement.setString(index++, context.sessionId());
        statement.setLong(index++, candidate.sourceWatermark());
        statement.setLong(index++, context.creatorUserId());
        statement.setString(index++, candidate.category().name());
        statement.setString(index++, candidate.requirementType().name());
        statement.setString(index++, candidate.content());
        statement.setBigDecimal(index++, BigDecimal.valueOf(candidate.confidence()));
        statement.setString(index++, normalize(candidate.reason()));
        statement.setString(index++, normalize(context.pageUrl()));
        statement.setString(index++, normalize(context.pageTitle()));
        statement.setLong(index++, candidate.detectedAt());
        statement.setLong(index++, candidate.detectedAt());
        statement.setLong(index, candidate.detectedAt());
    }

    private void rollback(Connection connection, SQLException original) {
        try {
            connection.rollback();
        } catch (SQLException rollbackException) {
            original.addSuppressed(rollbackException);
        }
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }
}
