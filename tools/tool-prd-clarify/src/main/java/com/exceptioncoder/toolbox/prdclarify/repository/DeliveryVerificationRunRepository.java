package com.exceptioncoder.toolbox.prdclarify.repository;

import com.exceptioncoder.toolbox.prdclarify.domain.DeliveryVerificationRun;
import com.exceptioncoder.toolbox.prdclarify.domain.DeliveryVerificationStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/** 白名单构建与测试运行的数据访问层。 */
@Repository
public class DeliveryVerificationRunRepository {

    private static final RowMapper<DeliveryVerificationRun> ROW_MAPPER = (resultSet, rowNumber) -> {
        int exitCodeValue = resultSet.getInt("exit_code");
        Integer exitCode = resultSet.wasNull() ? null : exitCodeValue;
        int testCountValue = resultSet.getInt("test_count");
        Integer testCount = resultSet.wasNull() ? null : testCountValue;
        long finishedAtValue = resultSet.getLong("finished_at");
        Long finishedAt = resultSet.wasNull() ? null : finishedAtValue;
        return new DeliveryVerificationRun(
                resultSet.getString("id"),
                resultSet.getString("session_id"),
                resultSet.getString("command_id"),
                resultSet.getString("git_head"),
                DeliveryVerificationStatus.valueOf(resultSet.getString("status")),
                exitCode,
                testCount,
                resultSet.getString("output_summary"),
                resultSet.getString("last_error"),
                resultSet.getLong("started_at"),
                finishedAt,
                resultSet.getLong("created_at"),
                resultSet.getLong("updated_at"));
    };

    private final JdbcTemplate jdbc;

    public DeliveryVerificationRunRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 插入 RUNNING 运行身份。 */
    public void insert(DeliveryVerificationRun run) {
        jdbc.update("""
                INSERT INTO delivery_verification_run (
                    id, session_id, command_id, git_head, status, exit_code, test_count,
                    output_summary, last_error, started_at, finished_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, run.id(), run.sessionId(), run.commandId(), run.gitHead(), run.status().name(),
                run.exitCode(), run.testCount(), run.outputSummary(), run.lastError(), run.startedAt(),
                run.finishedAt(), run.createdAt(), run.updatedAt());
    }

    /** 同一会话是否已有运行中的验证。 */
    public boolean existsRunning(String sessionId) {
        Integer count = jdbc.queryForObject("""
                SELECT COUNT(*)
                FROM delivery_verification_run
                WHERE session_id = ? AND status = 'RUNNING'
                """, Integer.class, sessionId);
        return count != null && count > 0;
    }

    /** 只允许首个终态从 RUNNING 胜出。 */
    public boolean complete(String id, DeliveryVerificationStatus status, Integer exitCode, Integer testCount,
                            String outputSummary, String lastError, long finishedAt) {
        int updated = jdbc.update("""
                UPDATE delivery_verification_run
                SET status = ?, exit_code = ?, test_count = ?, output_summary = ?, last_error = ?,
                    finished_at = ?, updated_at = ?
                WHERE id = ? AND status = 'RUNNING'
                """, status.name(), exitCode, testCount, outputSummary, lastError,
                finishedAt, finishedAt, id);
        return updated == 1;
    }

    /** 返回会话最新一次验证运行。 */
    public Optional<DeliveryVerificationRun> findLatest(String sessionId) {
        return jdbc.query("""
                SELECT id, session_id, command_id, git_head, status, exit_code, test_count,
                       output_summary, last_error, started_at, finished_at, created_at, updated_at
                FROM delivery_verification_run
                WHERE session_id = ?
                ORDER BY created_at DESC
                LIMIT 1
                """, ROW_MAPPER, sessionId).stream().findFirst();
    }
}
