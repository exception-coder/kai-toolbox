package com.exceptioncoder.toolbox.treesize.repository;

import com.exceptioncoder.toolbox.treesize.domain.SubtitleJob;
import com.exceptioncoder.toolbox.treesize.domain.SubtitleStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public class SubtitleJobRepository {

    private final JdbcTemplate jdbc;

    public SubtitleJobRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<SubtitleJob> ROW = (rs, i) -> SubtitleJob.builder()
            .id(rs.getString("id"))
            .scanId(rs.getString("scan_id"))
            .videoPath(rs.getString("video_path"))
            .videoPathHash(rs.getString("video_path_hash"))
            .status(SubtitleStatus.valueOf(rs.getString("status")))
            .model(rs.getString("model"))
            .sourceLanguage(rs.getString("source_language"))
            .progress(rs.getDouble("progress"))
            .vttPath(rs.getString("vtt_path"))
            .translatedVttPath(rs.getString("translated_vtt_path"))
            .errorMsg(rs.getString("error_msg"))
            .createdAt(rs.getLong("created_at"))
            .startedAt(rs.getObject("started_at") == null ? null : rs.getLong("started_at"))
            .finishedAt(rs.getObject("finished_at") == null ? null : rs.getLong("finished_at"))
            .build();

    public void insert(SubtitleJob j) {
        jdbc.update("""
                INSERT INTO subtitle_job
                  (id, scan_id, video_path, video_path_hash, status, model, source_language,
                   progress, vtt_path, error_msg, created_at, started_at, finished_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                j.getId(), j.getScanId(), j.getVideoPath(), j.getVideoPathHash(),
                j.getStatus().name(), j.getModel(), j.getSourceLanguage(),
                j.getProgress(), j.getVttPath(), j.getErrorMsg(),
                j.getCreatedAt(), j.getStartedAt(), j.getFinishedAt());
    }

    public void updateStatus(String id, SubtitleStatus status, Long startedAt, Long finishedAt, String errorMsg) {
        jdbc.update("""
                UPDATE subtitle_job
                   SET status = ?, started_at = COALESCE(?, started_at),
                       finished_at = ?, error_msg = ?
                 WHERE id = ?
                """,
                status.name(), startedAt, finishedAt, errorMsg, id);
    }

    public void updateProgress(String id, double progress) {
        jdbc.update("UPDATE subtitle_job SET progress = ? WHERE id = ?", progress, id);
    }

    public void updateLanguage(String id, String language) {
        jdbc.update("UPDATE subtitle_job SET source_language = ? WHERE id = ?", language, id);
    }

    public void updateVttPath(String id, String vttPath) {
        jdbc.update("UPDATE subtitle_job SET vtt_path = ? WHERE id = ?", vttPath, id);
    }

    public void updateTranslatedVttPath(String id, String translatedVttPath) {
        jdbc.update("UPDATE subtitle_job SET translated_vtt_path = ? WHERE id = ?", translatedVttPath, id);
    }

    public Optional<SubtitleJob> findById(String id) {
        return jdbc.query("SELECT * FROM subtitle_job WHERE id = ?", ROW, id)
                .stream().findFirst();
    }

    public Optional<SubtitleJob> findByVideoPathHash(String hash) {
        return jdbc.query("SELECT * FROM subtitle_job WHERE video_path_hash = ?", ROW, hash)
                .stream().findFirst();
    }

    /** Hard delete — used when the user explicitly removes a subtitle so they can regenerate. */
    public void deleteById(String id) {
        jdbc.update("DELETE FROM subtitle_job WHERE id = ?", id);
    }
}
