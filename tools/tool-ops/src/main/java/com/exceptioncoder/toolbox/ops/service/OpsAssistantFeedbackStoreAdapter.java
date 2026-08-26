package com.exceptioncoder.toolbox.ops.service;

import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort;
import com.exceptioncoder.toolbox.common.requirement.RequirementType;
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
import java.sql.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** 复用系统中间件台已登记的 MySQL 连接池读写 Assistant 反馈归档。 */
@Component
public class OpsAssistantFeedbackStoreAdapter implements AssistantFeedbackStorePort {
    private static final String SCHEMA_RESOURCE = "mysql/assistant-feedback-schema.sql";
    private static final String COLUMNS = """
            id, session_id, source_watermark, feedback_category, requirement_type,
            source_content, feedback_content, confidence, classification_reason, page_url, page_title,
            candidate_status, detected_at, update_time,
            (SELECT COALESCE(MAX(r.revision_no), 0)
               FROM assistant_feedback_candidate_revision r
              WHERE r.candidate_id = assistant_feedback_candidate.id) AS revision_no
            """;
    private static final String UPSERT = """
            INSERT INTO assistant_feedback_candidate
              (id, source_system, session_id, source_watermark, creator_user_id, feedback_category,
               requirement_type, source_content, feedback_content, confidence, classification_reason, page_url,
               page_title, candidate_status, detected_at, create_time, update_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DETECTED', ?, ?, ?)
            ON DUPLICATE KEY UPDATE feedback_category=VALUES(feedback_category),
              requirement_type=VALUES(requirement_type), feedback_content=VALUES(feedback_content),
              confidence=VALUES(confidence), classification_reason=VALUES(classification_reason),
              page_url=VALUES(page_url), page_title=VALUES(page_title), update_time=VALUES(update_time)
            """;
    private static final String UPSERT_ATTACHMENT = """
            INSERT INTO assistant_feedback_candidate_attachment
              (candidate_id, attachment_id, original_name, mime_type, size_bytes, create_time)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE original_name=VALUES(original_name), mime_type=VALUES(mime_type),
              size_bytes=VALUES(size_bytes)
            """;

    private final SystemRepository systems;
    private final DatasourceRepository datasources;
    private final OpsDataSourcePool pool;
    private final String datasourceId;
    private final String systemCode;
    private final String environment;
    private final String datasourceName;
    private final Set<String> initialized = ConcurrentHashMap.newKeySet();

    public OpsAssistantFeedbackStoreAdapter(SystemRepository systems, DatasourceRepository datasources,
            OpsDataSourcePool pool,
            @Value("${toolbox.assistant.feedback-store.datasource-id:}") String datasourceId,
            @Value("${toolbox.assistant.feedback-store.system-code:yoooni-one}") String systemCode,
            @Value("${toolbox.assistant.feedback-store.environment:PROD}") String environment,
            @Value("${toolbox.assistant.feedback-store.datasource-name:}") String datasourceName) {
        this.systems = systems;
        this.datasources = datasources;
        this.pool = pool;
        this.datasourceId = text(datasourceId);
        this.systemCode = text(systemCode);
        this.environment = text(environment);
        this.datasourceName = text(datasourceName);
    }

    @Override
    public void saveCandidates(SaveCommand command) {
        if (command == null || command.candidates().isEmpty()) return;
        connection(true, sql -> transaction(sql, () -> {
            try (PreparedStatement statement = sql.prepareStatement(UPSERT);
                 PreparedStatement attachments = sql.prepareStatement(UPSERT_ATTACHMENT)) {
                boolean hasAttachments = false;
                for (FeedbackCandidate candidate : command.candidates()) {
                    bindCandidate(statement, command.context(), candidate);
                    statement.addBatch();
                }
                statement.executeBatch();
                for (FeedbackCandidate candidate : command.candidates()) {
                    if (candidate.attachments().isEmpty()) continue;
                    String storedCandidateId = storedCandidateId(sql, command.context(), candidate);
                    for (FeedbackAttachment attachment : candidate.attachments()) {
                        attachments.setString(1, storedCandidateId);
                        attachments.setString(2, attachment.id());
                        attachments.setString(3, attachment.name());
                        attachments.setString(4, attachment.mime());
                        attachments.setLong(5, attachment.size());
                        attachments.setLong(6, candidate.detectedAt());
                        attachments.addBatch();
                        hasAttachments = true;
                    }
                }
                if (hasAttachments) attachments.executeBatch();
            }
            return null;
        }));
    }

    @Override
    public Map<String, FeedbackCounts> summarizeCandidates(long userId, List<String> sessionIds) {
        if (sessionIds == null || sessionIds.isEmpty()) return Map.of();
        return connection(false, sql -> {
            String query = "SELECT session_id, feedback_category, COUNT(*) total FROM assistant_feedback_candidate"
                    + " WHERE creator_user_id=? AND session_id IN (" + marks(sessionIds.size()) + ")"
                    + " GROUP BY session_id, feedback_category";
            Map<String, long[]> values = new LinkedHashMap<>();
            try (PreparedStatement statement = sql.prepareStatement(query)) {
                statement.setLong(1, userId);
                bindStrings(statement, sessionIds, 2);
                try (ResultSet result = statement.executeQuery()) {
                    while (result.next()) {
                        long[] count = values.computeIfAbsent(result.getString("session_id"), key -> new long[3]);
                        switch (FeedbackCategory.valueOf(result.getString("feedback_category"))) {
                            case BUG -> count[0] = result.getLong("total");
                            case OPTIMIZATION -> count[1] = result.getLong("total");
                            case REQUIREMENT -> count[2] = result.getLong("total");
                            case NONE -> { }
                        }
                    }
                }
            }
            Map<String, FeedbackCounts> response = new LinkedHashMap<>();
            values.forEach((id, count) -> response.put(id, new FeedbackCounts(count[0], count[1], count[2])));
            return Map.copyOf(response);
        });
    }

    @Override
    public CandidatePage listCandidates(CandidateQuery query) {
        return connection(false, sql -> {
            int limit = limit(query.limit());
            boolean cursor = query.beforeDetectedAt() != null && !text(query.beforeId()).isBlank();
            String statementSql = "SELECT " + COLUMNS + " FROM assistant_feedback_candidate"
                    + " WHERE creator_user_id=? AND session_id=? AND feedback_category=?"
                    + (cursor ? " AND (detected_at<? OR (detected_at=? AND id<?))" : "")
                    + " ORDER BY detected_at DESC, id DESC LIMIT ?";
            List<Row> rows = new ArrayList<>();
            try (PreparedStatement statement = sql.prepareStatement(statementSql)) {
                int index = 1;
                statement.setLong(index++, query.creatorUserId());
                statement.setString(index++, query.sessionId());
                statement.setString(index++, query.category().name());
                if (cursor) {
                    statement.setLong(index++, query.beforeDetectedAt());
                    statement.setLong(index++, query.beforeDetectedAt());
                    statement.setString(index++, query.beforeId());
                }
                statement.setInt(index, limit + 1);
                try (ResultSet result = statement.executeQuery()) {
                    while (result.next()) rows.add(row(result));
                }
            }
            boolean hasMore = rows.size() > limit;
            if (hasMore) rows = new ArrayList<>(rows.subList(0, limit));
            List<String> ids = rows.stream().map(Row::id).toList();
            Map<String, List<FeedbackAttachment>> attachments = attachments(sql, ids);
            Map<String, FeedbackRevision> originals = originals(sql, ids);
            return new CandidatePage(rows.stream().map(row -> row.view(
                    originals.get(row.id()), attachments.getOrDefault(row.id(), List.of()), row.revisionNo()))
                    .toList(), hasMore);
        });
    }

    @Override
    public RevisionPage listRevisions(RevisionQuery query) {
        return connection(false, sql -> {
            owned(sql, query.creatorUserId(), query.sessionId(), query.candidateId(), false);
            int limit = limit(query.limit());
            boolean cursor = query.beforeRevisionNo() != null;
            String statementSql = "SELECT revision_no, revision_source, editor_user_id, feedback_category,"
                    + " requirement_type, feedback_content, create_time FROM assistant_feedback_candidate_revision"
                    + " WHERE candidate_id=?" + (cursor ? " AND revision_no<?" : "")
                    + " ORDER BY revision_no DESC LIMIT ?";
            List<FeedbackRevision> items = new ArrayList<>();
            try (PreparedStatement statement = sql.prepareStatement(statementSql)) {
                int index = 1;
                statement.setString(index++, query.candidateId());
                if (cursor) statement.setInt(index++, query.beforeRevisionNo());
                statement.setInt(index, limit + 1);
                try (ResultSet result = statement.executeQuery()) {
                    while (result.next()) items.add(revision(result));
                }
            }
            boolean hasMore = items.size() > limit;
            return new RevisionPage(hasMore ? items.subList(0, limit) : items, hasMore);
        });
    }

    @Override
    public FeedbackCandidateView updateCandidate(UpdateCandidateCommand command) {
        return connection(true, sql -> transaction(sql, () -> {
            Row current = owned(sql, command.creatorUserId(), command.sessionId(), command.candidateId(), true);
            if (current.updateTime() != command.expectedUpdateTime()) throw new ConcurrentFeedbackUpdateException();
            insertOriginal(sql, current);
            int revisionNo = nextRevision(sql, current.id());
            try (PreparedStatement statement = sql.prepareStatement("""
                    UPDATE assistant_feedback_candidate SET feedback_category=?, requirement_type=?,
                      feedback_content=?, update_time=?
                    WHERE id=? AND creator_user_id=? AND session_id=? AND update_time=?
                    """)) {
                statement.setString(1, command.category().name());
                statement.setString(2, command.requirementType().name());
                statement.setString(3, command.content());
                statement.setLong(4, command.editedAt());
                statement.setString(5, command.candidateId());
                statement.setLong(6, command.creatorUserId());
                statement.setString(7, command.sessionId());
                statement.setLong(8, command.expectedUpdateTime());
                if (statement.executeUpdate() != 1) throw new ConcurrentFeedbackUpdateException();
            }
            insertUserRevision(sql, command, revisionNo);
            Row updated = owned(sql, command.creatorUserId(), command.sessionId(), command.candidateId(), false);
            return updated.view(originals(sql, List.of(updated.id())).get(updated.id()),
                    attachments(sql, List.of(updated.id())).getOrDefault(updated.id(), List.of()), revisionNo);
        }));
    }

    @Override
    public Optional<FeedbackAttachment> findCandidateAttachment(long userId, String sessionId,
            String candidateId, String attachmentId) {
        return connection(false, sql -> {
            try (PreparedStatement statement = sql.prepareStatement("""
                    SELECT a.attachment_id, a.original_name, a.mime_type, a.size_bytes
                    FROM assistant_feedback_candidate_attachment a
                    JOIN assistant_feedback_candidate c ON c.id=a.candidate_id
                    WHERE c.creator_user_id=? AND c.session_id=? AND c.id=? AND a.attachment_id=?
                    """)) {
                statement.setLong(1, userId);
                statement.setString(2, sessionId);
                statement.setString(3, candidateId);
                statement.setString(4, attachmentId);
                try (ResultSet result = statement.executeQuery()) {
                    return result.next() ? Optional.of(attachment(result)) : Optional.empty();
                }
            }
        });
    }

    private void bindCandidate(PreparedStatement statement, FeedbackContext context,
            FeedbackCandidate candidate) throws SQLException {
        int index = 1;
        statement.setString(index++, candidate.id());
        statement.setString(index++, context.sourceSystem());
        statement.setString(index++, context.sessionId());
        statement.setLong(index++, candidate.sourceWatermark());
        statement.setLong(index++, context.creatorUserId());
        statement.setString(index++, candidate.category().name());
        statement.setString(index++, candidate.requirementType().name());
        statement.setString(index++, candidate.sourceContent());
        statement.setString(index++, candidate.content());
        statement.setBigDecimal(index++, BigDecimal.valueOf(candidate.confidence()));
        statement.setString(index++, text(candidate.reason()));
        statement.setString(index++, text(context.pageUrl()));
        statement.setString(index++, text(context.pageTitle()));
        statement.setLong(index++, candidate.detectedAt());
        statement.setLong(index++, candidate.detectedAt());
        statement.setLong(index, candidate.detectedAt());
    }

    private String storedCandidateId(Connection sql, FeedbackContext context,
                                     FeedbackCandidate candidate) throws SQLException {
        try (PreparedStatement statement = sql.prepareStatement("""
                SELECT id FROM assistant_feedback_candidate
                WHERE source_system=? AND session_id=? AND source_watermark=?
                """)) {
            statement.setString(1, context.sourceSystem());
            statement.setString(2, context.sessionId());
            statement.setLong(3, candidate.sourceWatermark());
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) throw new SQLException("反馈候选幂等写入后未能回读");
                return result.getString(1);
            }
        }
    }

    private Row owned(Connection sql, long userId, String sessionId, String candidateId,
            boolean lock) throws SQLException {
        try (PreparedStatement statement = sql.prepareStatement("SELECT " + COLUMNS
                + " FROM assistant_feedback_candidate WHERE creator_user_id=? AND session_id=? AND id=?"
                + (lock ? " FOR UPDATE" : ""))) {
            statement.setLong(1, userId);
            statement.setString(2, sessionId);
            statement.setString(3, candidateId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) throw new IllegalArgumentException("反馈记录不存在或无权访问");
                return row(result);
            }
        }
    }

    private void insertOriginal(Connection sql, Row row) throws SQLException {
        try (PreparedStatement statement = sql.prepareStatement("""
                INSERT IGNORE INTO assistant_feedback_candidate_revision
                  (candidate_id, revision_no, revision_source, editor_user_id, feedback_category,
                   requirement_type, feedback_content, create_time)
                VALUES (?, 0, 'AI', NULL, ?, ?, ?, ?)
                """)) {
            statement.setString(1, row.id());
            statement.setString(2, row.category().name());
            statement.setString(3, row.requirementType().name());
            statement.setString(4, row.content());
            statement.setLong(5, row.detectedAt());
            statement.executeUpdate();
        }
    }

    private int nextRevision(Connection sql, String candidateId) throws SQLException {
        try (PreparedStatement statement = sql.prepareStatement(
                "SELECT COALESCE(MAX(revision_no),0)+1 FROM assistant_feedback_candidate_revision "
                        + "WHERE candidate_id=?")) {
            statement.setString(1, candidateId);
            try (ResultSet result = statement.executeQuery()) {
                result.next();
                return result.getInt(1);
            }
        }
    }

    private void insertUserRevision(Connection sql, UpdateCandidateCommand command, int revision) throws SQLException {
        try (PreparedStatement statement = sql.prepareStatement("""
                INSERT INTO assistant_feedback_candidate_revision
                  (candidate_id, revision_no, revision_source, editor_user_id, feedback_category,
                   requirement_type, feedback_content, create_time)
                VALUES (?, ?, 'USER', ?, ?, ?, ?, ?)
                """)) {
            statement.setString(1, command.candidateId());
            statement.setInt(2, revision);
            statement.setLong(3, command.creatorUserId());
            statement.setString(4, command.category().name());
            statement.setString(5, command.requirementType().name());
            statement.setString(6, command.content());
            statement.setLong(7, command.editedAt());
            statement.executeUpdate();
        }
    }

    private Map<String, List<FeedbackAttachment>> attachments(Connection sql, List<String> ids) throws SQLException {
        if (ids.isEmpty()) return Map.of();
        Map<String, List<FeedbackAttachment>> values = new HashMap<>();
        try (PreparedStatement statement = sql.prepareStatement("SELECT candidate_id, attachment_id, original_name,"
                + " mime_type, size_bytes FROM assistant_feedback_candidate_attachment WHERE candidate_id IN ("
                + marks(ids.size()) + ") ORDER BY create_time, attachment_id")) {
            bindStrings(statement, ids, 1);
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) values.computeIfAbsent(result.getString("candidate_id"), key -> new ArrayList<>())
                        .add(attachment(result));
            }
        }
        return values;
    }

    private Map<String, FeedbackRevision> originals(Connection sql, List<String> ids) throws SQLException {
        if (ids.isEmpty()) return Map.of();
        Map<String, FeedbackRevision> values = new HashMap<>();
        try (PreparedStatement statement = sql.prepareStatement("SELECT candidate_id, revision_no, revision_source,"
                + " editor_user_id, feedback_category, requirement_type, feedback_content, create_time"
                + " FROM assistant_feedback_candidate_revision WHERE revision_no=0 AND candidate_id IN ("
                + marks(ids.size()) + ")")) {
            bindStrings(statement, ids, 1);
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) values.put(result.getString("candidate_id"), revision(result));
            }
        }
        return values;
    }

    private Row row(ResultSet result) throws SQLException {
        return new Row(result.getString("id"), result.getString("session_id"),
                result.getLong("source_watermark"), FeedbackCategory.valueOf(result.getString("feedback_category")),
                RequirementType.valueOf(result.getString("requirement_type")),
                result.getString("source_content"), result.getString("feedback_content"),
                result.getDouble("confidence"), result.getString("classification_reason"),
                result.getString("page_url"), result.getString("page_title"),
                result.getString("candidate_status"), result.getLong("detected_at"),
                result.getLong("update_time"), result.getInt("revision_no"));
    }

    private FeedbackRevision revision(ResultSet result) throws SQLException {
        long editor = result.getLong("editor_user_id");
        return new FeedbackRevision(result.getInt("revision_no"), result.getString("revision_source"),
                result.wasNull() ? null : editor, FeedbackCategory.valueOf(result.getString("feedback_category")),
                RequirementType.valueOf(result.getString("requirement_type")),
                result.getString("feedback_content"), result.getLong("create_time"));
    }

    private FeedbackAttachment attachment(ResultSet result) throws SQLException {
        return new FeedbackAttachment(result.getString("attachment_id"), result.getString("original_name"),
                result.getString("mime_type"), result.getLong("size_bytes"));
    }

    private OpsDatasource resolve() {
        if (!datasourceId.isBlank()) {
            OpsDatasource datasource = datasources.findById(datasourceId)
                    .orElseThrow(() -> new IllegalStateException("未找到 Assistant 反馈数据源: " + datasourceId));
            requireMysql(datasource);
            return datasource;
        }
        OpsSystem system = systems.findByCode(systemCode)
                .orElseThrow(() -> new IllegalStateException("系统中间件台未登记系统: " + systemCode));
        List<OpsDatasource> matches = datasources.findMysqlBySystemAndEnvironment(system.getId(), environment)
                .stream().filter(candidate -> datasourceName.isBlank()
                        || datasourceName.equalsIgnoreCase(text(candidate.getName()))).toList();
        if (matches.size() != 1) throw new IllegalStateException(
                "yoooni-one 目标 MySQL 数据源匹配数必须为 1，当前为 " + matches.size());
        return matches.getFirst();
    }

    private void requireMysql(OpsDatasource datasource) {
        if (datasource.getType() != DatasourceType.MYSQL) throw new IllegalStateException(
                "Assistant 反馈数据源必须为 MySQL: " + datasource.getId());
    }

    private <T> T connection(boolean write, SqlWork<T> work) {
        OpsDatasource datasource = resolve();
        try (Connection sql = pool.borrowSql(datasource)) {
            if (write && sql.isReadOnly()) throw new IllegalStateException(
                    "yoooni-one MySQL 连接池为只读，无法修改反馈归档");
            schema(sql, datasource.getId());
            return work.run(sql);
        } catch (SQLException | IOException exception) {
            throw new DataAccessResourceFailureException("yoooni-one 公网 MySQL 反馈归档访问失败", exception);
        }
    }

    private void schema(Connection sql, String id) throws SQLException, IOException {
        if (initialized.contains(id)) return;
        synchronized (initialized) {
            if (initialized.contains(id)) return;
            String ddl = new ClassPathResource(SCHEMA_RESOURCE).getContentAsString(StandardCharsets.UTF_8);
            try (Statement statement = sql.createStatement()) {
                for (String part : ddl.split(";")) if (!part.isBlank()) statement.execute(part.trim());
            }
            ensureSourceContentColumn(sql);
            initialized.add(id);
        }
    }

    private void ensureSourceContentColumn(Connection sql) throws SQLException {
        try (Statement statement = sql.createStatement()) {
            if (!hasColumn(sql, "assistant_feedback_candidate", "source_content")) {
                statement.execute("ALTER TABLE assistant_feedback_candidate "
                        + "ADD COLUMN source_content TEXT NULL AFTER requirement_type");
            }
            statement.execute("UPDATE assistant_feedback_candidate "
                    + "SET source_content=feedback_content WHERE source_content IS NULL");
            statement.execute("ALTER TABLE assistant_feedback_candidate "
                    + "MODIFY COLUMN source_content TEXT NOT NULL");
        }
    }

    private boolean hasColumn(Connection sql, String table, String column) throws SQLException {
        DatabaseMetaData metadata = sql.getMetaData();
        try (ResultSet result = metadata.getColumns(sql.getCatalog(), null, table, column)) {
            if (result.next()) {
                return true;
            }
        }
        try (ResultSet result = metadata.getColumns(sql.getCatalog(), null,
                table.toUpperCase(Locale.ROOT), column.toUpperCase(Locale.ROOT))) {
            return result.next();
        }
    }

    private <T> T transaction(Connection sql, SqlSupplier<T> action) throws SQLException {
        boolean autoCommit = sql.getAutoCommit();
        sql.setAutoCommit(false);
        try {
            T result = action.get();
            sql.commit();
            return result;
        } catch (SQLException | RuntimeException exception) {
            try { sql.rollback(); } catch (SQLException rollback) { exception.addSuppressed(rollback); }
            throw exception;
        } finally {
            sql.setAutoCommit(autoCommit);
        }
    }

    private static int limit(int value) { return Math.max(1, Math.min(value, 100)); }
    private static String marks(int size) { return String.join(",", Collections.nCopies(size, "?")); }
    private static String text(String value) { return value == null ? "" : value.trim(); }
    private static void bindStrings(PreparedStatement statement, List<String> values, int start) throws SQLException {
        for (int index = 0; index < values.size(); index++) statement.setString(start + index, values.get(index));
    }

    @FunctionalInterface private interface SqlWork<T> { T run(Connection sql) throws SQLException, IOException; }
    @FunctionalInterface private interface SqlSupplier<T> { T get() throws SQLException; }

    private record Row(String id, String sessionId, long watermark, FeedbackCategory category,
            RequirementType requirementType, String sourceContent, String content, double confidence, String reason,
            String pageUrl, String pageTitle, String status, long detectedAt, long updateTime,
            int revisionNo) {
        FeedbackCandidateView view(FeedbackRevision original, List<FeedbackAttachment> attachments, int revision) {
            return new FeedbackCandidateView(id, sessionId, watermark, category, requirementType,
                    sourceContent, content,
                    confidence, reason, pageUrl, pageTitle, status, detectedAt, updateTime,
                    revision, original, attachments);
        }
    }
}
