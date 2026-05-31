package com.exceptioncoder.toolbox.treesize.repository;

import com.exceptioncoder.toolbox.treesize.domain.VideoRow;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;

/**
 * treesize_video 表的所有 JDBC 读写。各子模块（语言识别 / 九宫格 / 年龄 / 时长 / 名称归类 /
 * 嵌入聚类）的写都必须通过本类暴露的 updateXxx 方法走，<b>禁止子模块自己拼 SQL</b>，
 * 保证 schema 演化时所有写入点集中可见。
 *
 * <p>读侧暴露各模块的 {@code findNeedingXxx} 配对方法：靠 schema 上的 partial index
 * 让待处理列表扫描永远不全表（{@code WHERE language IS NULL} / {@code grid_path IS NULL} ...）。
 */
@Repository
public class VideoTableRepository {

    /** SELECT 全 30 列的列清单。子模块查询时必须用这个，避免每个模块再列一遍。 */
    private static final String COLUMNS = "path, name, parent_path, ext, size, source_scan_id, " +
            "first_synced_at, last_synced_at, " +
            "duration_s, duration_bucket, width, height, video_codec, audio_codec, audio_lang_tag, " +
            "language, language_confidence, language_detected_at, " +
            "thumbnail_grid_path, thumbnail_grid_generated_at, " +
            "person_main_age_group, person_main_age, person_main_gender, " +
            "person_age_confidence, person_age_detected_at, person_age_reason, " +
            "series_signature, series_episode, " +
            "visual_cluster_id, visual_cluster_label, visual_clustered_at";

    private static final RowMapper<VideoRow> MAPPER = VideoTableRepository::mapRow;

    private final JdbcTemplate jdbc;

    public VideoTableRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ==================================================================================
    // 同步入口（本次模块）
    // ==================================================================================

    /**
     * batch INSERT OR IGNORE。冲突的行（path 已存在）自动跳过，返回实际插入行数。
     * batchUpdate 在不同 SQLite 驱动版本下返回 1（插入）/ 0（IGNORE）/ Statement.SUCCESS_NO_INFO(-2)；
     * 这里把 > 0 视为成功插入，足够准确（IGNORE 路径在 SQLite 上稳定返回 0）。
     */
    public long batchInsertIgnore(List<VideoRow> rows) {
        if (rows.isEmpty()) return 0;
        int[] results = jdbc.batchUpdate(
                "INSERT OR IGNORE INTO treesize_video " +
                        "(path, name, parent_path, ext, size, source_scan_id, first_synced_at, last_synced_at) " +
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                new BatchPreparedStatementSetter() {
                    @Override
                    public void setValues(PreparedStatement ps, int i) throws SQLException {
                        VideoRow r = rows.get(i);
                        ps.setString(1, r.path());
                        ps.setString(2, r.name());
                        ps.setString(3, r.parentPath());
                        ps.setString(4, r.ext());
                        ps.setLong(5, r.size());
                        ps.setString(6, r.sourceScanId());
                        ps.setLong(7, r.firstSyncedAt());
                        ps.setLong(8, r.lastSyncedAt());
                    }

                    @Override
                    public int getBatchSize() {
                        return rows.size();
                    }
                });
        long inserted = 0;
        for (int r : results) if (r > 0) inserted++;
        return inserted;
    }

    public long count() {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM treesize_video", Long.class);
        return n == null ? 0L : n;
    }

    // ==================================================================================
    // 后续子模块的 find / update 入口（占位，本次同步模块不调用）
    // 各子模块自身实现时调用这里；在本次提交里全部暴露，避免后续每个模块都改 Repository。
    // ==================================================================================

    // ----- 视频语言识别 -----

    public long countNeedingLanguageDetect() {
        Long n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM treesize_video WHERE language IS NULL", Long.class);
        return n == null ? 0L : n;
    }

    public List<VideoRow> findNeedingLanguageDetect(int limit, int offset) {
        return jdbc.query(
                "SELECT " + COLUMNS + " FROM treesize_video WHERE language IS NULL " +
                        "ORDER BY size DESC LIMIT ? OFFSET ?",
                MAPPER, limit, offset);
    }

    public void updateLanguage(String path, String iso, double confidence, long detectedAt) {
        jdbc.update(
                "UPDATE treesize_video SET language=?, language_confidence=?, language_detected_at=? WHERE path=?",
                iso, confidence, detectedAt, path);
    }

    // ----- 视频九宫格预览图 -----

    public long countNeedingThumbnailGrid() {
        Long n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM treesize_video WHERE thumbnail_grid_path IS NULL", Long.class);
        return n == null ? 0L : n;
    }

    public List<VideoRow> findNeedingThumbnailGrid(int limit, int offset) {
        return jdbc.query(
                "SELECT " + COLUMNS + " FROM treesize_video WHERE thumbnail_grid_path IS NULL " +
                        "ORDER BY size DESC LIMIT ? OFFSET ?",
                MAPPER, limit, offset);
    }

    public void updateThumbnailGrid(String path, String gridPath, long generatedAt) {
        jdbc.update(
                "UPDATE treesize_video SET thumbnail_grid_path=?, thumbnail_grid_generated_at=? WHERE path=?",
                gridPath, generatedAt, path);
    }

    /**
     * 取图端点用：返回视频的九宫格 JPEG 绝对路径。{@code null} 字段（还没生成）或行不存在都返回空。
     */
    public Optional<String> findGridPathByVideoPath(String videoPath) {
        List<String> r = jdbc.queryForList(
                "SELECT thumbnail_grid_path FROM treesize_video " +
                        "WHERE path=? AND thumbnail_grid_path IS NOT NULL",
                String.class, videoPath);
        return r.isEmpty() ? Optional.empty() : Optional.of(r.get(0));
    }

    // ----- 视频时长区间分类 -----

    public long countNeedingDuration() {
        Long n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM treesize_video WHERE duration_s IS NULL", Long.class);
        return n == null ? 0L : n;
    }

    public List<VideoRow> findNeedingDuration(int limit, int offset) {
        return jdbc.query(
                "SELECT " + COLUMNS + " FROM treesize_video WHERE duration_s IS NULL " +
                        "ORDER BY size DESC LIMIT ? OFFSET ?",
                MAPPER, limit, offset);
    }

    public void updateDuration(String path, Double durationS, String bucket) {
        jdbc.update(
                "UPDATE treesize_video SET duration_s=?, duration_bucket=? WHERE path=?",
                durationS, bucket, path);
    }

    // ----- 视频名称归类 -----

    public long countNeedingNameGrouping() {
        Long n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM treesize_video WHERE series_signature IS NULL", Long.class);
        return n == null ? 0L : n;
    }

    public List<VideoRow> findNeedingNameGrouping(int limit, int offset) {
        return jdbc.query(
                "SELECT " + COLUMNS + " FROM treesize_video WHERE series_signature IS NULL " +
                        "ORDER BY size DESC LIMIT ? OFFSET ?",
                MAPPER, limit, offset);
    }

    public void updateSeries(String path, String signature, Integer episode) {
        jdbc.update(
                "UPDATE treesize_video SET series_signature=?, series_episode=? WHERE path=?",
                signature, episode, path);
    }

    public List<VideoRow> findBySeriesSignature(String signature) {
        return jdbc.query(
                "SELECT " + COLUMNS + " FROM treesize_video WHERE series_signature=? " +
                        "ORDER BY series_episode IS NULL, series_episode, name COLLATE NOCASE",
                MAPPER, signature);
    }

    // ----- 视频人物年龄识别 -----

    public long countNeedingPersonAge() {
        Long n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM treesize_video " +
                        "WHERE thumbnail_grid_path IS NOT NULL AND person_main_age_group IS NULL",
                Long.class);
        return n == null ? 0L : n;
    }

    public List<VideoRow> findNeedingPersonAge(int limit, int offset) {
        return jdbc.query(
                "SELECT " + COLUMNS + " FROM treesize_video " +
                        "WHERE thumbnail_grid_path IS NOT NULL AND person_main_age_group IS NULL " +
                        "ORDER BY size DESC LIMIT ? OFFSET ?",
                MAPPER, limit, offset);
    }

    public void updatePersonAge(String path, String ageGroup, Integer age, String gender,
                                 Double confidence, long detectedAt, String reason) {
        jdbc.update(
                "UPDATE treesize_video SET " +
                        "  person_main_age_group=?, person_main_age=?, person_main_gender=?, " +
                        "  person_age_confidence=?, person_age_detected_at=?, person_age_reason=? " +
                        "WHERE path=?",
                ageGroup, age, gender, confidence, detectedAt, reason, path);
    }

    // ----- 视频嵌入与相似聚类 -----

    public List<VideoRow> findNeedingVisualEmbedding(int limit, int offset) {
        return jdbc.query(
                "SELECT " + ("v." + COLUMNS.replace(", ", ", v.")) + " FROM treesize_video v " +
                        "LEFT JOIN video_embedding e ON e.path=v.path " +
                        "WHERE v.thumbnail_grid_path IS NOT NULL AND e.path IS NULL " +
                        "ORDER BY v.size DESC LIMIT ? OFFSET ?",
                MAPPER, limit, offset);
    }

    public void updateVisualCluster(String path, int clusterId, String label, long clusteredAt) {
        jdbc.update(
                "UPDATE treesize_video SET visual_cluster_id=?, visual_cluster_label=?, visual_clustered_at=? WHERE path=?",
                clusterId, label, clusteredAt, path);
    }

    public List<VideoRow> findByVisualClusterId(int clusterId) {
        return jdbc.query(
                "SELECT " + COLUMNS + " FROM treesize_video WHERE visual_cluster_id=? ORDER BY size DESC",
                MAPPER, clusterId);
    }

    // ==================================================================================
    // 通用 mapper（开放给嵌入仓库等需要再次 SELECT video 行的位置）
    // ==================================================================================

    public static VideoRow mapRow(ResultSet rs, int rowNum) throws SQLException {
        return new VideoRow(
                rs.getString("path"),
                rs.getString("name"),
                rs.getString("parent_path"),
                rs.getString("ext"),
                rs.getLong("size"),
                rs.getString("source_scan_id"),
                rs.getLong("first_synced_at"),
                rs.getLong("last_synced_at"),
                (Double) rs.getObject("duration_s"),
                rs.getString("duration_bucket"),
                (Integer) rs.getObject("width"),
                (Integer) rs.getObject("height"),
                rs.getString("video_codec"),
                rs.getString("audio_codec"),
                rs.getString("audio_lang_tag"),
                rs.getString("language"),
                (Double) rs.getObject("language_confidence"),
                (Long) rs.getObject("language_detected_at"),
                rs.getString("thumbnail_grid_path"),
                (Long) rs.getObject("thumbnail_grid_generated_at"),
                rs.getString("person_main_age_group"),
                (Integer) rs.getObject("person_main_age"),
                rs.getString("person_main_gender"),
                (Double) rs.getObject("person_age_confidence"),
                (Long) rs.getObject("person_age_detected_at"),
                rs.getString("person_age_reason"),
                rs.getString("series_signature"),
                (Integer) rs.getObject("series_episode"),
                (Integer) rs.getObject("visual_cluster_id"),
                rs.getString("visual_cluster_label"),
                (Long) rs.getObject("visual_clustered_at"));
    }
}
