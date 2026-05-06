package com.exceptioncoder.toolbox.treesize.repository;

import com.exceptioncoder.toolbox.treesize.domain.ScanRecord;
import com.exceptioncoder.toolbox.treesize.domain.ScanSourceType;
import com.exceptioncoder.toolbox.treesize.domain.ScanStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class ScanRepository {

    private final JdbcTemplate jdbc;

    public ScanRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<ScanRecord> ROW = (rs, i) -> ScanRecord.builder()
            .id(rs.getString("id"))
            .rootPath(rs.getString("root_path"))
            .status(ScanStatus.valueOf(rs.getString("status")))
            .startedAt(rs.getLong("started_at"))
            .finishedAt(rs.getObject("finished_at") == null ? null : rs.getLong("finished_at"))
            .totalFiles(rs.getLong("total_files"))
            .totalDirs(rs.getLong("total_dirs"))
            .totalSize(rs.getLong("total_size"))
            .errorMsg(rs.getString("error_msg"))
            .sourceType(parseSourceType(rs.getString("source_type")))
            .sshHostId(rs.getString("ssh_host_id"))
            .sourceDisplayName(rs.getString("display_name"))
            .build();

    public void insert(ScanRecord r) {
        jdbc.update("""
                INSERT INTO treesize_scan
                  (id, root_path, status, started_at, finished_at, total_files, total_dirs, total_size, error_msg)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                r.getId(), r.getRootPath(), r.getStatus().name(),
                r.getStartedAt(), r.getFinishedAt(),
                r.getTotalFiles(), r.getTotalDirs(), r.getTotalSize(),
                r.getErrorMsg());
        jdbc.update("""
                INSERT INTO treesize_scan_source (scan_id, source_type, ssh_host_id, display_name)
                VALUES (?, ?, ?, ?)
                """,
                r.getId(),
                (r.getSourceType() == null ? ScanSourceType.LOCAL_WINDOWS : r.getSourceType()).name(),
                r.getSshHostId(),
                r.getSourceDisplayName());
    }

    public void updateStatus(String id, ScanStatus status, Long finishedAt, String errorMsg) {
        jdbc.update("UPDATE treesize_scan SET status = ?, finished_at = ?, error_msg = ? WHERE id = ?",
                status.name(), finishedAt, errorMsg, id);
    }

    public void updateTotals(String id, long files, long dirs, long size) {
        jdbc.update("UPDATE treesize_scan SET total_files = ?, total_dirs = ?, total_size = ? WHERE id = ?",
                files, dirs, size, id);
    }

    public Optional<ScanRecord> findById(String id) {
        return jdbc.query("""
                SELECT s.*, src.source_type, src.ssh_host_id, src.display_name
                  FROM treesize_scan s
                  LEFT JOIN treesize_scan_source src ON src.scan_id = s.id
                 WHERE s.id = ?
                """, ROW, id)
                .stream().findFirst();
    }

    public List<ScanRecord> findAll() {
        return jdbc.query("""
                SELECT s.*, src.source_type, src.ssh_host_id, src.display_name
                  FROM treesize_scan s
                  LEFT JOIN treesize_scan_source src ON src.scan_id = s.id
                 ORDER BY s.started_at DESC
                 LIMIT 100
                """, ROW);
    }

    public void deleteById(String id) {
        jdbc.update("DELETE FROM treesize_node_meta WHERE scan_id = ?", id);
        jdbc.update("DELETE FROM treesize_node WHERE scan_id = ?", id);
        jdbc.update("DELETE FROM treesize_scan_source WHERE scan_id = ?", id);
        jdbc.update("DELETE FROM treesize_scan WHERE id = ?", id);
    }

    private static ScanSourceType parseSourceType(String sourceType) {
        if (sourceType == null || sourceType.isBlank()) {
            return ScanSourceType.LOCAL_WINDOWS;
        }
        return ScanSourceType.valueOf(sourceType);
    }
}
