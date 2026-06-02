package com.exceptioncoder.toolbox.videocondense.repository;

import com.exceptioncoder.toolbox.videocondense.domain.CondenseJob;
import com.exceptioncoder.toolbox.videocondense.domain.JobStatus;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * video_condense_job 表 CRUD。所有状态/曲线写入集中在本类，service 不直接拼 SQL。
 * error 列截断到 500 字符，防 ffmpeg stderr 撑爆列宽。
 */
@Repository
public class CondenseJobRepository {

    private static final int ERROR_MAX_LEN = 500;

    private final JdbcTemplate jdbc;

    public CondenseJobRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<CondenseJob> MAPPER = (rs, i) -> new CondenseJob(
            rs.getString("id"),
            rs.getString("input_path"),
            JobStatus.valueOf(rs.getString("status")),
            (Double) rs.getObject("duration_sec"),
            rs.getString("curve_json"),
            rs.getString("error"),
            rs.getLong("created_at"),
            rs.getLong("updated_at")
    );

    public void insert(CondenseJob job) {
        jdbc.update(
                "INSERT INTO video_condense_job(id, input_path, status, duration_sec, curve_json, error, created_at, updated_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                job.id(), job.inputPath(), job.status().name(), job.durationSec(),
                job.curveJson(), job.error(), job.createdAt(), job.updatedAt());
    }

    public void updateStatus(String id, JobStatus status, String error, long updatedAt) {
        jdbc.update("UPDATE video_condense_job SET status = ?, error = ?, updated_at = ? WHERE id = ?",
                status.name(), truncate(error), updatedAt, id);
    }

    /** ANALYZED 时回填时长 + 曲线，并置状态。 */
    public void updateCurve(String id, Double durationSec, String curveJson, JobStatus status, long updatedAt) {
        jdbc.update(
                "UPDATE video_condense_job SET duration_sec = ?, curve_json = ?, status = ?, updated_at = ? WHERE id = ?",
                durationSec, curveJson, status.name(), updatedAt, id);
    }

    public Optional<CondenseJob> findById(String id) {
        try {
            return Optional.ofNullable(
                    jdbc.queryForObject("SELECT * FROM video_condense_job WHERE id = ?", MAPPER, id));
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        }
    }

    public List<CondenseJob> findRecent(int limit) {
        return jdbc.query("SELECT * FROM video_condense_job ORDER BY created_at DESC LIMIT ?",
                MAPPER, Math.max(1, limit));
    }

    /** 启动时把上次崩溃残留的 ANALYZING/RENDERING 行置 FAILED，避免幽灵作业卡在运行态。 */
    public int cleanupStaleRunning(long updatedAt) {
        return jdbc.update(
                "UPDATE video_condense_job SET status = 'FAILED', error = 'interrupted by restart', updated_at = ? "
                        + "WHERE status IN ('ANALYZING', 'RENDERING')",
                updatedAt);
    }

    private static String truncate(String s) {
        if (s == null) return null;
        return s.length() > ERROR_MAX_LEN ? s.substring(0, ERROR_MAX_LEN) : s;
    }
}
