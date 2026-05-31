package com.exceptioncoder.toolbox.downloader.domain;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * SQLite DAO，复用 toolbox-common 注册的全局 JdbcTemplate。
 * 表结构见 resources/db/downloader-schema.sql，由 SchemaInitializer 启动时加载。
 */
@Repository
public class DownloadTaskRepository {

    private final JdbcTemplate jdbc;

    public DownloadTaskRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ---------- task ----------

    public long insertTask(DownloadTask task) {
        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO tool_downloader_task
                      (url, save_path, filename, total_size, accept_ranges, state,
                       route_type, route_proxy,
                       probe_direct_ttfb_ms, probe_direct_bps,
                       probe_proxy_ttfb_ms,  probe_proxy_bps,
                       last_error, http_engine, created_at, updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """, Statement.RETURN_GENERATED_KEYS);
            int i = 1;
            ps.setString(i++, task.getUrl());
            ps.setString(i++, task.getSavePath());
            ps.setString(i++, task.getFilename());
            ps.setLong(i++, task.getTotalSize());
            ps.setInt(i++, task.isAcceptRanges() ? 1 : 0);
            ps.setString(i++, task.getState().name());
            ps.setString(i++, task.getRouteType() == null ? null : task.getRouteType().name());
            ps.setString(i++, task.getRouteProxy());
            setNullableLong(ps, i++, task.getProbeDirectTtfbMs());
            setNullableLong(ps, i++, task.getProbeDirectBps());
            setNullableLong(ps, i++, task.getProbeProxyTtfbMs());
            setNullableLong(ps, i++, task.getProbeProxyBps());
            ps.setString(i++, task.getLastError());
            ps.setString(i++, task.getHttpEngine() == null
                    ? com.exceptioncoder.toolbox.downloader.domain.HttpEngineType.JDK.name()
                    : task.getHttpEngine().name());
            ps.setString(i++, task.getCreatedAt().toString());
            ps.setString(i, task.getUpdatedAt().toString());
            return ps;
        }, kh);
        Number key = kh.getKey();
        Objects.requireNonNull(key, "generated key missing");
        long id = key.longValue();
        task.setId(id);
        return id;
    }

    public Optional<DownloadTask> findById(long id) {
        return jdbc.query("SELECT * FROM tool_downloader_task WHERE id = ?", taskRowMapper(), id)
                .stream().findFirst();
    }

    public List<DownloadTask> listAll(Set<TaskState> filter, int limit) {
        if (filter == null || filter.isEmpty()) {
            return jdbc.query("SELECT * FROM tool_downloader_task ORDER BY id DESC LIMIT ?",
                    taskRowMapper(), limit);
        }
        String inClause = filter.stream().map(s -> "?").collect(Collectors.joining(","));
        Object[] args = new Object[filter.size() + 1];
        int i = 0;
        for (TaskState s : filter) args[i++] = s.name();
        args[i] = limit;
        return jdbc.query(
                "SELECT * FROM tool_downloader_task WHERE state IN (" + inClause + ") ORDER BY id DESC LIMIT ?",
                taskRowMapper(), args);
    }

    public void updateTaskState(long id, TaskState state, String error) {
        jdbc.update("""
                UPDATE tool_downloader_task SET state = ?, last_error = ?, updated_at = ?
                WHERE id = ?
                """, state.name(), error, Instant.now().toString(), id);
    }

    public void updateRouteDecision(long id, RouteDecision d) {
        jdbc.update("""
                UPDATE tool_downloader_task SET
                  route_type = ?, route_proxy = ?,
                  probe_direct_ttfb_ms = ?, probe_direct_bps = ?,
                  probe_proxy_ttfb_ms  = ?, probe_proxy_bps  = ?,
                  updated_at = ?
                WHERE id = ?
                """,
                d.route() == null ? null : d.route().name(),
                d.proxyOrigin(),
                d.directTtfbMs(), d.directThroughputBps(),
                d.proxyTtfbMs(), d.proxyThroughputBps(),
                Instant.now().toString(),
                id);
    }

    public void updateTaskAfterProbe(long id, long totalSize, boolean acceptRanges, String filename) {
        jdbc.update("""
                UPDATE tool_downloader_task SET total_size = ?, accept_ranges = ?, filename = ?, updated_at = ?
                WHERE id = ?
                """, totalSize, acceptRanges ? 1 : 0, filename, Instant.now().toString(), id);
    }

    public void deleteTask(long id) {
        jdbc.update("DELETE FROM tool_downloader_task WHERE id = ?", id);
        // segments 通过 ON DELETE CASCADE 自动级联
    }

    // ---------- segment ----------

    public void insertSegments(Collection<DownloadSegment> segs) {
        jdbc.batchUpdate("""
                INSERT INTO tool_downloader_segment
                  (task_id, seq_no, offset_bytes, length_bytes, bytes_downloaded, state, attempts, last_error)
                VALUES (?,?,?,?,?,?,?,?)
                """, segs, segs.size(), (ps, s) -> {
            int i = 1;
            ps.setLong(i++, s.getTaskId());
            ps.setInt(i++, s.getSeqNo());
            ps.setLong(i++, s.getOffsetBytes());
            ps.setLong(i++, s.getLengthBytes());
            ps.setLong(i++, s.getBytesDownloaded());
            ps.setString(i++, s.getState().name());
            ps.setInt(i++, s.getAttempts());
            ps.setString(i, s.getLastError());
        });
    }

    public List<DownloadSegment> listSegments(long taskId) {
        return jdbc.query(
                "SELECT * FROM tool_downloader_segment WHERE task_id = ? ORDER BY seq_no",
                segmentRowMapper(), taskId);
    }

    public void updateSegment(DownloadSegment s) {
        jdbc.update("""
                UPDATE tool_downloader_segment SET
                  bytes_downloaded = ?, state = ?, attempts = ?, last_error = ?
                WHERE task_id = ? AND seq_no = ?
                """,
                s.getBytesDownloaded(), s.getState().name(), s.getAttempts(), s.getLastError(),
                s.getTaskId(), s.getSeqNo());
    }

    public long sumDownloadedBytes(long taskId) {
        Long v = jdbc.queryForObject(
                "SELECT COALESCE(SUM(bytes_downloaded), 0) FROM tool_downloader_segment WHERE task_id = ?",
                Long.class, taskId);
        return v == null ? 0L : v;
    }

    // ---------- helpers ----------

    private static void setNullableLong(PreparedStatement ps, int idx, Long v) throws java.sql.SQLException {
        if (v == null) ps.setNull(idx, java.sql.Types.INTEGER);
        else ps.setLong(idx, v);
    }

    private static RowMapper<DownloadTask> taskRowMapper() {
        return (rs, n) -> {
            String routeType = rs.getString("route_type");
            return DownloadTask.builder()
                    .id(rs.getLong("id"))
                    .url(rs.getString("url"))
                    .savePath(rs.getString("save_path"))
                    .filename(rs.getString("filename"))
                    .totalSize(rs.getLong("total_size"))
                    .acceptRanges(rs.getInt("accept_ranges") == 1)
                    .state(TaskState.valueOf(rs.getString("state")))
                    .routeType(routeType == null ? null : RouteType.valueOf(routeType))
                    .routeProxy(rs.getString("route_proxy"))
                    .probeDirectTtfbMs(getNullableLong(rs, "probe_direct_ttfb_ms"))
                    .probeDirectBps(getNullableLong(rs, "probe_direct_bps"))
                    .probeProxyTtfbMs(getNullableLong(rs, "probe_proxy_ttfb_ms"))
                    .probeProxyBps(getNullableLong(rs, "probe_proxy_bps"))
                    .lastError(rs.getString("last_error"))
                    .httpEngine(HttpEngineType.parseOrDefault(rs.getString("http_engine")))
                    .createdAt(Instant.parse(rs.getString("created_at")))
                    .updatedAt(Instant.parse(rs.getString("updated_at")))
                    .build();
        };
    }

    private static RowMapper<DownloadSegment> segmentRowMapper() {
        return (rs, n) -> DownloadSegment.builder()
                .taskId(rs.getLong("task_id"))
                .seqNo(rs.getInt("seq_no"))
                .offsetBytes(rs.getLong("offset_bytes"))
                .lengthBytes(rs.getLong("length_bytes"))
                .bytesDownloaded(rs.getLong("bytes_downloaded"))
                .state(SegmentState.valueOf(rs.getString("state")))
                .attempts(rs.getInt("attempts"))
                .lastError(rs.getString("last_error"))
                .build();
    }

    private static Long getNullableLong(java.sql.ResultSet rs, String col) throws java.sql.SQLException {
        long v = rs.getLong(col);
        return rs.wasNull() ? null : v;
    }
}
