package com.exceptioncoder.toolbox.treesize.repository;

import com.exceptioncoder.toolbox.treesize.domain.FileNode;
import com.exceptioncoder.toolbox.treesize.domain.VideoFile;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

@Repository
public class NodeRepository {

    private final JdbcTemplate jdbc;

    public NodeRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<FileNode> ROW = (rs, i) -> FileNode.builder()
            .scanId(rs.getString("scan_id"))
            .parentPath(rs.getString("parent_path"))
            .path(rs.getString("path"))
            .name(rs.getString("name"))
            .dir(rs.getInt("is_dir") == 1)
            .size(rs.getLong("size"))
            .fileCount(rs.getLong("file_count"))
            .dirCount(rs.getLong("dir_count"))
            .depth(rs.getInt("depth"))
            .modifiedAt(readNullableLong(rs, "modified_at"))
            .build();

    public void batchInsert(List<FileNode> batch) {
        if (batch.isEmpty()) return;
        jdbc.batchUpdate("""
                INSERT INTO treesize_node
                  (scan_id, parent_path, path, name, is_dir, size, file_count, dir_count, depth)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, new BatchPreparedStatementSetter() {
            @Override
            public void setValues(PreparedStatement ps, int i) throws SQLException {
                FileNode n = batch.get(i);
                ps.setString(1, n.getScanId());
                ps.setString(2, n.getParentPath());
                ps.setString(3, n.getPath());
                ps.setString(4, n.getName());
                ps.setInt(5, n.isDir() ? 1 : 0);
                ps.setLong(6, n.getSize());
                ps.setLong(7, n.getFileCount());
                ps.setLong(8, n.getDirCount());
                ps.setInt(9, n.getDepth());
            }
            @Override
            public int getBatchSize() { return batch.size(); }
        });
        jdbc.batchUpdate("""
                INSERT OR REPLACE INTO treesize_node_meta
                  (scan_id, path, modified_at)
                VALUES (?, ?, ?)
                """, new BatchPreparedStatementSetter() {
            @Override
            public void setValues(PreparedStatement ps, int i) throws SQLException {
                FileNode n = batch.get(i);
                ps.setString(1, n.getScanId());
                ps.setString(2, n.getPath());
                if (n.getModifiedAt() == null) {
                    ps.setNull(3, java.sql.Types.INTEGER);
                } else {
                    ps.setLong(3, n.getModifiedAt());
                }
            }
            @Override
            public int getBatchSize() { return batch.size(); }
        });
    }

    /**
     * 查询指定父目录的直接子项，按 size desc 排序。
     * 当 parentPath 为 null 时查询顶层节点（root 自身）。
     */
    public List<FileNode> findChildren(String scanId, String parentPath) {
        if (parentPath == null) {
            return jdbc.query(
                    """
                    SELECT n.*, m.modified_at
                      FROM treesize_node n
                      LEFT JOIN treesize_node_meta m ON m.scan_id = n.scan_id AND m.path = n.path
                     WHERE n.scan_id = ? AND n.parent_path IS NULL
                     ORDER BY n.size DESC
                    """,
                    ROW, scanId);
        }
        return jdbc.query(
                """
                SELECT n.*, m.modified_at
                  FROM treesize_node n
                  LEFT JOIN treesize_node_meta m ON m.scan_id = n.scan_id AND m.path = n.path
                 WHERE n.scan_id = ? AND n.parent_path = ?
                 ORDER BY n.size DESC
                """,
                ROW, scanId, parentPath);
    }

    public List<FileNode> findRoot(String scanId) {
        return jdbc.query(
                """
                SELECT n.*, m.modified_at
                  FROM treesize_node n
                  LEFT JOIN treesize_node_meta m ON m.scan_id = n.scan_id AND m.path = n.path
                 WHERE n.scan_id = ? AND n.parent_path IS NULL
                 ORDER BY n.size DESC
                """,
                ROW, scanId);
    }

    public int deleteByScanAndPath(String scanId, String path) {
        jdbc.update(
                "DELETE FROM treesize_node_meta WHERE scan_id = ? AND path = ?",
                scanId, path);
        return jdbc.update(
                "DELETE FROM treesize_node WHERE scan_id = ? AND path = ?",
                scanId, path);
    }

    /** Paged result with the total count baked in via {@code COUNT(*) OVER ()} so a single query covers both. */
    public record VideoSearchResult(List<VideoFile> items, long total) {}

    /**
     * OS-managed directories whose contents are not real user content. We mask them out of the
     * video library and junk-clean queries — TreeSize itself still surfaces them in the disk-usage
     * view, since "your recycle bin is 50 GB" is legitimate information.
     */
    private static final List<String> EXCLUDED_PATH_PATTERNS = List.of(
            "%$RECYCLE.BIN%",                // Windows Vista+ recycle bin (per drive)
            "%System Volume Information%",   // Windows volume metadata
            "%RECYCLER%",                    // pre-Vista recycle bin
            "%.Trashes%",                    // macOS external/network drive trash
            "%.Trash-%"                      // Linux GNOME trash (.Trash-1000 etc.)
    );

    /**
     * Aggregate video files across all completed scans, paginated. Extension match is a
     * parameterised disjunction of {@code LOWER(name) LIKE ?} clauses ({@code "%.mp4"},
     * {@code "%.mkv"}, …), which keeps the SQL injection-free even though the OR list is
     * dynamic. {@code sortBy} and {@code order} are validated against a fixed whitelist so
     * they can be inlined safely. {@code COUNT(*) OVER ()} returns the unfiltered total in
     * every row, which we read once.
     */
    public VideoSearchResult findVideos(List<String> extensions, String sortBy, String order,
                                         int offset, int limit) {
        if (extensions.isEmpty()) return new VideoSearchResult(List.of(), 0);

        StringBuilder sql = new StringBuilder("""
                SELECT n.scan_id, s.root_path, n.path, n.name, n.size,
                       COUNT(*) OVER () AS total_count
                  FROM treesize_node n
                  JOIN treesize_scan s ON n.scan_id = s.id
                 WHERE n.is_dir = 0
                   AND s.status = 'COMPLETED'
                   AND (""");
        List<Object> args = new ArrayList<>(extensions.size() + 2);
        for (int i = 0; i < extensions.size(); i++) {
            if (i > 0) sql.append(" OR ");
            sql.append("LOWER(n.name) LIKE ?");
            args.add("%." + extensions.get(i).toLowerCase());
        }
        sql.append(")");
        appendExcludedPathFilters(sql, args);
        sql.append(" ORDER BY ");
        sql.append("size".equals(sortBy) ? "n.size" : "LOWER(n.name)");
        sql.append("desc".equalsIgnoreCase(order) ? " DESC" : " ASC");
        sql.append(", n.path ASC");  // tiebreaker so paging is deterministic
        sql.append(" LIMIT ? OFFSET ?");
        args.add(limit);
        args.add(offset);

        long[] total = {0};
        List<VideoFile> items = jdbc.query(sql.toString(),
                (rs, i) -> {
                    if (i == 0) total[0] = rs.getLong("total_count");
                    return new VideoFile(
                            rs.getString("scan_id"),
                            rs.getString("root_path"),
                            rs.getString("path"),
                            rs.getString("name"),
                            rs.getLong("size"));
                },
                args.toArray());

        // When the page is empty (offset past the end) the row mapper never runs, so we need
        // a separate count. Skip it on the common path.
        if (items.isEmpty() && offset > 0) {
            total[0] = countVideos(extensions);
        }
        return new VideoSearchResult(items, total[0]);
    }

    private long countVideos(List<String> extensions) {
        StringBuilder sql = new StringBuilder("""
                SELECT COUNT(*) FROM treesize_node n
                  JOIN treesize_scan s ON n.scan_id = s.id
                 WHERE n.is_dir = 0
                   AND s.status = 'COMPLETED'
                   AND (""");
        List<Object> args = new ArrayList<>(extensions.size());
        for (int i = 0; i < extensions.size(); i++) {
            if (i > 0) sql.append(" OR ");
            sql.append("LOWER(n.name) LIKE ?");
            args.add("%." + extensions.get(i).toLowerCase());
        }
        sql.append(")");
        appendExcludedPathFilters(sql, args);
        Long n = jdbc.queryForObject(sql.toString(), Long.class, args.toArray());
        return n == null ? 0L : n;
    }

    private static void appendExcludedPathFilters(StringBuilder sql, List<Object> args) {
        for (String pattern : EXCLUDED_PATH_PATTERNS) {
            sql.append(" AND n.path NOT LIKE ?");
            args.add(pattern);
        }
    }

    private static Long readNullableLong(java.sql.ResultSet rs, String column) throws SQLException {
        long value = rs.getLong(column);
        return rs.wasNull() ? null : value;
    }

    /**
     * Suspect-junk files: name starts with {@code ._} (macOS AppleDouble metadata files
     * that get sprinkled across external drives) AND has a video extension AND scan-time
     * size below the safety threshold. The on-disk size is re-checked at delete time so
     * a real file that has since grown past the threshold is not destroyed.
     */
    public List<VideoFile> findJunkVideos(List<String> extensions, long maxSize) {
        if (extensions.isEmpty()) return List.of();

        StringBuilder sql = new StringBuilder("""
                SELECT n.scan_id, s.root_path, n.path, n.name, n.size
                  FROM treesize_node n
                  JOIN treesize_scan s ON n.scan_id = s.id
                 WHERE n.is_dir = 0
                   AND s.status = 'COMPLETED'
                   AND n.name LIKE '._%'
                   AND n.size < ?
                   AND (""");
        List<Object> args = new ArrayList<>(extensions.size() + 1);
        args.add(maxSize);
        for (int i = 0; i < extensions.size(); i++) {
            if (i > 0) sql.append(" OR ");
            sql.append("LOWER(n.name) LIKE ?");
            args.add("%." + extensions.get(i).toLowerCase());
        }
        sql.append(")");
        appendExcludedPathFilters(sql, args);

        return jdbc.query(sql.toString(),
                (rs, i) -> new VideoFile(
                        rs.getString("scan_id"),
                        rs.getString("root_path"),
                        rs.getString("path"),
                        rs.getString("name"),
                        rs.getLong("size")),
                args.toArray());
    }
}
