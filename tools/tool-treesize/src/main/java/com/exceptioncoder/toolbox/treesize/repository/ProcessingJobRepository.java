package com.exceptioncoder.toolbox.treesize.repository;

import com.exceptioncoder.toolbox.treesize.domain.ProcessingJob;
import com.exceptioncoder.toolbox.treesize.domain.ProcessingJobStatus;
import com.exceptioncoder.toolbox.treesize.domain.ProcessingJobType;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * video_processing_job 表 CRUD。所有进度更新都通过本类走，VideoProcessingJobService 持有
 * 该类的引用做单点写入，业务 service 不直接拼 SQL。
 *
 * <p>error_msg 列长度被截断到 500 字符防止 stacktrace 撑爆列宽。
 */
@Repository
public class ProcessingJobRepository {

    private static final int ERROR_MSG_MAX_LEN = 500;

    private final JdbcTemplate jdbc;

    public ProcessingJobRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<ProcessingJob> MAPPER = (rs, i) -> new ProcessingJob(
            rs.getString("id"),
            ProcessingJobType.valueOf(rs.getString("type")),
            ProcessingJobStatus.valueOf(rs.getString("status")),
            rs.getLong("total"),
            rs.getLong("processed"),
            rs.getLong("succeeded"),
            rs.getLong("failed"),
            rs.getString("current_path"),
            rs.getString("error_msg"),
            rs.getLong("started_at"),
            (Long) rs.getObject("finished_at")
    );

    /** 新建 RUNNING 行，返回 jobId。 */
    public String insertRunning(ProcessingJobType type, long startedAt) {
        String id = UUID.randomUUID().toString();
        jdbc.update(
                "INSERT INTO video_processing_job(id, type, status, started_at) VALUES (?, ?, ?, ?)",
                id, type.name(), ProcessingJobStatus.RUNNING.name(), startedAt);
        return id;
    }

    public void updateTotal(String jobId, long total) {
        jdbc.update("UPDATE video_processing_job SET total = ? WHERE id = ?", total, jobId);
    }

    /**
     * 单次进度更新：incrementally 累加 processed / succeeded / failed，覆盖 current_path /
     * error_msg。所有计数都是 +=（用 SQL 表达式），方便后续从多线程上报扩展。
     */
    public void recordSuccess(String jobId, String currentPath) {
        jdbc.update(
                "UPDATE video_processing_job " +
                        "SET processed = processed + 1, succeeded = succeeded + 1, current_path = ? " +
                        "WHERE id = ?",
                currentPath, jobId);
    }

    public void recordFailure(String jobId, String currentPath, String errorMsg) {
        String truncated = errorMsg == null ? null
                : errorMsg.length() > ERROR_MSG_MAX_LEN ? errorMsg.substring(0, ERROR_MSG_MAX_LEN) : errorMsg;
        jdbc.update(
                "UPDATE video_processing_job " +
                        "SET processed = processed + 1, failed = failed + 1, current_path = ?, error_msg = ? " +
                        "WHERE id = ?",
                currentPath, truncated, jobId);
    }

    public void finish(String jobId, ProcessingJobStatus terminalStatus, long finishedAt) {
        jdbc.update(
                "UPDATE video_processing_job SET status = ?, finished_at = ? WHERE id = ?",
                terminalStatus.name(), finishedAt, jobId);
    }

    public void finish(String jobId, ProcessingJobStatus terminalStatus, long finishedAt, String errorMsg) {
        String truncated = errorMsg == null ? null
                : errorMsg.length() > ERROR_MSG_MAX_LEN ? errorMsg.substring(0, ERROR_MSG_MAX_LEN) : errorMsg;
        jdbc.update(
                "UPDATE video_processing_job SET status = ?, finished_at = ?, error_msg = ? WHERE id = ?",
                terminalStatus.name(), finishedAt, truncated, jobId);
    }

    public Optional<ProcessingJob> findRunning(ProcessingJobType type) {
        try {
            ProcessingJob job = jdbc.queryForObject(
                    "SELECT * FROM video_processing_job WHERE type = ? AND status = 'RUNNING' " +
                            "ORDER BY started_at DESC LIMIT 1",
                    MAPPER, type.name());
            return Optional.ofNullable(job);
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        }
    }

    public Optional<ProcessingJob> findLatest(ProcessingJobType type) {
        try {
            ProcessingJob job = jdbc.queryForObject(
                    "SELECT * FROM video_processing_job WHERE type = ? " +
                            "ORDER BY started_at DESC LIMIT 1",
                    MAPPER, type.name());
            return Optional.ofNullable(job);
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        }
    }

    public Optional<ProcessingJob> findById(String jobId) {
        try {
            ProcessingJob job = jdbc.queryForObject(
                    "SELECT * FROM video_processing_job WHERE id = ?", MAPPER, jobId);
            return Optional.ofNullable(job);
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        }
    }

    /**
     * 启动时清理：把 status=RUNNING AND finished_at IS NULL 的"上次崩溃残留"行
     * 一次性置为 FAILED。这样下次启动 findRunning 不会被幽灵任务挡住。
     */
    public int cleanupStaleRunning(long finishedAt) {
        return jdbc.update(
                "UPDATE video_processing_job SET status = 'FAILED', finished_at = ?, " +
                        "error_msg = 'interrupted by restart' " +
                        "WHERE status = 'RUNNING' AND finished_at IS NULL",
                finishedAt);
    }
}
