package com.exceptioncoder.toolbox.flatten.repository;

import com.exceptioncoder.toolbox.flatten.domain.FlattenScan;
import com.exceptioncoder.toolbox.flatten.domain.FlattenStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class FlattenScanRepository {

    private final JdbcTemplate jdbc;

    public FlattenScanRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<FlattenScan> ROW = (rs, i) -> FlattenScan.builder()
            .id(rs.getString("id"))
            .sourcePath(rs.getString("source_path"))
            .targetPath(rs.getString("target_path"))
            .status(FlattenStatus.valueOf(rs.getString("status")))
            .startedAt(rs.getLong("started_at"))
            .finishedAt(rs.getObject("finished_at") == null ? null : rs.getLong("finished_at"))
            .totalFiles(rs.getLong("total_files"))
            .totalSize(rs.getLong("total_size"))
            .duplicateGroups(rs.getLong("duplicate_groups"))
            .duplicateFiles(rs.getLong("duplicate_files"))
            .duplicateSize(rs.getLong("duplicate_size"))
            .filesToMove(rs.getLong("files_to_move"))
            .movedFiles(rs.getLong("moved_files"))
            .errorMsg(rs.getString("error_msg"))
            .build();

    public void insert(FlattenScan s) {
        jdbc.update("""
                INSERT INTO flatten_scan
                  (id, source_path, target_path, status, started_at, finished_at,
                   total_files, total_size, duplicate_groups, duplicate_files, duplicate_size,
                   files_to_move, moved_files, error_msg)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                s.getId(), s.getSourcePath(), s.getTargetPath(), s.getStatus().name(),
                s.getStartedAt(), s.getFinishedAt(),
                s.getTotalFiles(), s.getTotalSize(),
                s.getDuplicateGroups(), s.getDuplicateFiles(), s.getDuplicateSize(),
                s.getFilesToMove(), s.getMovedFiles(),
                s.getErrorMsg());
    }

    public void updateStatus(String id, FlattenStatus status, Long finishedAt, String errorMsg) {
        jdbc.update("UPDATE flatten_scan SET status = ?, finished_at = ?, error_msg = ? WHERE id = ?",
                status.name(), finishedAt, errorMsg, id);
    }

    public void updateScanResult(String id,
                                 long totalFiles, long totalSize,
                                 long duplicateGroups, long duplicateFiles, long duplicateSize,
                                 long filesToMove) {
        jdbc.update("""
                UPDATE flatten_scan
                   SET total_files = ?, total_size = ?,
                       duplicate_groups = ?, duplicate_files = ?, duplicate_size = ?,
                       files_to_move = ?
                 WHERE id = ?
                """,
                totalFiles, totalSize, duplicateGroups, duplicateFiles, duplicateSize, filesToMove, id);
    }

    public void updateAfterDedupe(String id,
                                  long totalFiles, long totalSize,
                                  long filesToMove) {
        jdbc.update("""
                UPDATE flatten_scan
                   SET total_files = ?, total_size = ?,
                       duplicate_groups = 0, duplicate_files = 0, duplicate_size = 0,
                       files_to_move = ?
                 WHERE id = ?
                """,
                totalFiles, totalSize, filesToMove, id);
    }

    public void updateMovedFiles(String id, long movedFiles) {
        jdbc.update("UPDATE flatten_scan SET moved_files = ? WHERE id = ?", movedFiles, id);
    }

    public Optional<FlattenScan> findById(String id) {
        return jdbc.query("SELECT * FROM flatten_scan WHERE id = ?", ROW, id)
                .stream().findFirst();
    }

    public List<FlattenScan> findAll() {
        return jdbc.query("SELECT * FROM flatten_scan ORDER BY started_at DESC LIMIT 100", ROW);
    }

    public void deleteById(String id) {
        jdbc.update("DELETE FROM flatten_file WHERE scan_id = ?", id);
        jdbc.update("DELETE FROM flatten_scan WHERE id = ?", id);
    }
}
