package com.exceptioncoder.toolbox.flatten.repository;

import com.exceptioncoder.toolbox.flatten.domain.FlattenFile;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;

@Repository
public class FlattenFileRepository {

    private final JdbcTemplate jdbc;

    public FlattenFileRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<FlattenFile> ROW = (rs, i) -> FlattenFile.builder()
            .id(rs.getLong("id"))
            .scanId(rs.getString("scan_id"))
            .path(rs.getString("path"))
            .name(rs.getString("name"))
            .size(rs.getLong("size"))
            .hash(rs.getString("hash"))
            .modifiedAt(rs.getLong("modified_at"))
            .deleted(rs.getInt("deleted") == 1)
            .targetName(rs.getString("target_name"))
            .moved(rs.getInt("moved") == 1)
            .build();

    public void batchInsert(List<FlattenFile> batch) {
        if (batch.isEmpty()) return;
        jdbc.batchUpdate("""
                INSERT INTO flatten_file
                  (scan_id, path, name, size, hash, modified_at, deleted, target_name, moved)
                VALUES (?, ?, ?, ?, ?, ?, 0, NULL, 0)
                """, new BatchPreparedStatementSetter() {
            @Override
            public void setValues(PreparedStatement ps, int i) throws SQLException {
                FlattenFile f = batch.get(i);
                ps.setString(1, f.getScanId());
                ps.setString(2, f.getPath());
                ps.setString(3, f.getName());
                ps.setLong(4, f.getSize());
                ps.setString(5, f.getHash());
                ps.setLong(6, f.getModifiedAt());
            }
            @Override public int getBatchSize() { return batch.size(); }
        });
    }

    public void updateHash(String scanId, String path, String hash) {
        jdbc.update("UPDATE flatten_file SET hash = ? WHERE scan_id = ? AND path = ?",
                hash, scanId, path);
    }

    public List<FlattenFile> findByScan(String scanId) {
        return jdbc.query(
                "SELECT * FROM flatten_file WHERE scan_id = ? ORDER BY path ASC",
                ROW, scanId);
    }

    public List<FlattenFile> findActive(String scanId) {
        return jdbc.query(
                "SELECT * FROM flatten_file WHERE scan_id = ? AND deleted = 0 ORDER BY path ASC",
                ROW, scanId);
    }

    /** 同 scan 内 hash 非空且 hash 出现 ≥ 2 次的所有文件，按 hash 排序，便于上层分组。 */
    public List<FlattenFile> findDuplicates(String scanId) {
        return jdbc.query("""
                SELECT * FROM flatten_file
                 WHERE scan_id = ?
                   AND deleted = 0
                   AND hash IS NOT NULL
                   AND hash IN (
                       SELECT hash FROM flatten_file
                        WHERE scan_id = ? AND deleted = 0 AND hash IS NOT NULL
                        GROUP BY hash, size HAVING COUNT(*) >= 2
                   )
                 ORDER BY hash ASC, LENGTH(path) ASC, path ASC
                """, ROW, scanId, scanId);
    }

    public int markDeletedByPaths(String scanId, List<String> paths) {
        if (paths.isEmpty()) return 0;
        int total = 0;
        // SQLite 默认变量数限制（999），切片避免超限
        int chunk = 500;
        for (int i = 0; i < paths.size(); i += chunk) {
            List<String> sub = paths.subList(i, Math.min(paths.size(), i + chunk));
            String placeholders = String.join(",", java.util.Collections.nCopies(sub.size(), "?"));
            Object[] args = new Object[sub.size() + 1];
            args[0] = scanId;
            for (int j = 0; j < sub.size(); j++) args[j + 1] = sub.get(j);
            total += jdbc.update(
                    "UPDATE flatten_file SET deleted = 1 WHERE scan_id = ? AND path IN (" + placeholders + ")",
                    args);
        }
        return total;
    }

    public void updateTargetName(long fileId, String targetName) {
        jdbc.update("UPDATE flatten_file SET target_name = ? WHERE id = ?", targetName, fileId);
    }

    public void markMoved(long fileId) {
        jdbc.update("UPDATE flatten_file SET moved = 1 WHERE id = ?", fileId);
    }
}
