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
    private final VideoLibraryCountCache countCache;

    public NodeRepository(JdbcTemplate jdbc, VideoLibraryCountCache countCache) {
        this.jdbc = jdbc;
        this.countCache = countCache;
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
                  (scan_id, parent_path, path, name, is_dir, size, file_count, dir_count, depth, ext)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                // ext is meaningful only for files — directories get NULL so they're naturally
                // skipped by the video-library index lookup. extOf() lowercases and trims the
                // leading dot, matching the value the migration backfill writes.
                ps.setString(10, n.isDir() ? null : TreeSizeMigration.extOf(n.getName()));
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

    /**
     * Drop the row for {@code path} along with every descendant row beneath it.
     * Used after a directory is relocated and replaced by a symlink — the new symlink target
     * is outside the original scan, so the rows would otherwise remain stale until next rescan.
     * Both Windows ({@code \}) and POSIX ({@code /}) prefix shapes are matched so a Windows
     * scan still works if any nodes were stored with forward slashes.
     */
    public int deleteSubtreeByPath(String scanId, String path) {
        String winPrefix = path.endsWith("\\") ? path + "%" : path + "\\%";
        String unixPrefix = path.endsWith("/") ? path + "%" : path + "/%";
        jdbc.update(
                "DELETE FROM treesize_node_meta WHERE scan_id = ? AND (path = ? OR path LIKE ? OR path LIKE ?)",
                scanId, path, winPrefix, unixPrefix);
        return jdbc.update(
                "DELETE FROM treesize_node WHERE scan_id = ? AND (path = ? OR path LIKE ? OR path LIKE ?)",
                scanId, path, winPrefix, unixPrefix);
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
     * Aggregate video files across all completed scans, paginated.
     *
     * <p>Extension match is now an {@code n.ext IN (?, ?, …)} list against the {@code ext}
     * column populated at insert time + {@link TreeSizeMigration#backfillExt}. Combined with the
     * {@code (is_dir, ext, name COLLATE NOCASE)} / {@code (is_dir, ext, size)} indexes this
     * turns the previous full-table {@code LOWER(name) LIKE '%.mp4' OR …} scan into a bounded
     * index range scan — orders of magnitude faster on a million-row database.
     *
     * <p>Count is split out into a separate {@code SELECT COUNT(*)} cached for 30 s in
     * {@link VideoLibraryCountCache}. Removing {@code COUNT(*) OVER ()} stops SQLite from
     * window-aggregating every matching row before it can return the first one.
     *
     * <p>{@code sortBy} and {@code order} are validated against a fixed whitelist so they're
     * safe to inline.
     */
    public VideoSearchResult findVideos(List<String> extensions, String sortBy, String order,
                                         long sizeMinInclusive, long sizeMaxExclusive,
                                         String nameQuery, boolean favoritesOnly,
                                         int offset, int limit) {
        if (extensions.isEmpty()) return new VideoSearchResult(List.of(), 0);

        List<String> normalisedExts = extensions.stream().map(e -> e.toLowerCase()).toList();
        String cacheKey = buildCountKey(normalisedExts, sizeMinInclusive, sizeMaxExclusive, nameQuery, favoritesOnly);
        long total = countCache.getOrCompute(cacheKey,
                () -> countVideos(normalisedExts, sizeMinInclusive, sizeMaxExclusive, nameQuery, favoritesOnly));

        if (total == 0 || offset >= total) {
            return new VideoSearchResult(List.of(), total);
        }

        StringBuilder sql = new StringBuilder("""
                SELECT n.scan_id, s.root_path, n.path, n.name, n.size,
                       (f.path IS NOT NULL) AS favorited
                  FROM treesize_node n
                  JOIN treesize_scan s ON n.scan_id = s.id
                  LEFT JOIN treesize_video_favorite f ON f.path = n.path
                 WHERE n.is_dir = 0
                   AND s.status = 'COMPLETED'
                   AND n.ext IN (""");
        List<Object> args = new ArrayList<>(normalisedExts.size() + 6);
        for (int i = 0; i < normalisedExts.size(); i++) {
            if (i > 0) sql.append(", ");
            sql.append("?");
            args.add(normalisedExts.get(i));
        }
        sql.append(")");
        appendExcludedPathFilters(sql, args);
        appendSizeRangeFilter(sql, args, sizeMinInclusive, sizeMaxExclusive);
        appendNameQueryFilter(sql, args, nameQuery);
        appendFavoritesOnlyFilter(sql, favoritesOnly);
        sql.append(" ORDER BY ");
        // COLLATE NOCASE replaces LOWER(name) so the index ordering is usable; "size" sort
        // pivots to the (is_dir, ext, size) index.
        sql.append("size".equals(sortBy) ? "n.size" : "n.name COLLATE NOCASE");
        sql.append("desc".equalsIgnoreCase(order) ? " DESC" : " ASC");
        sql.append(", n.path ASC");  // tiebreaker so paging is deterministic
        sql.append(" LIMIT ? OFFSET ?");
        args.add(limit);
        args.add(offset);

        List<VideoFile> items = jdbc.query(sql.toString(),
                (rs, i) -> new VideoFile(
                        rs.getString("scan_id"),
                        rs.getString("root_path"),
                        rs.getString("path"),
                        rs.getString("name"),
                        rs.getLong("size"),
                        rs.getInt("favorited") == 1),
                args.toArray());

        return new VideoSearchResult(items, total);
    }

    private long countVideos(List<String> normalisedExts, long sizeMinInclusive, long sizeMaxExclusive,
                             String nameQuery, boolean favoritesOnly) {
        StringBuilder sql = new StringBuilder("""
                SELECT COUNT(*) FROM treesize_node n
                  JOIN treesize_scan s ON n.scan_id = s.id
                  LEFT JOIN treesize_video_favorite f ON f.path = n.path
                 WHERE n.is_dir = 0
                   AND s.status = 'COMPLETED'
                   AND n.ext IN (""");
        List<Object> args = new ArrayList<>(normalisedExts.size() + 4);
        for (int i = 0; i < normalisedExts.size(); i++) {
            if (i > 0) sql.append(", ");
            sql.append("?");
            args.add(normalisedExts.get(i));
        }
        sql.append(")");
        appendExcludedPathFilters(sql, args);
        appendSizeRangeFilter(sql, args, sizeMinInclusive, sizeMaxExclusive);
        appendNameQueryFilter(sql, args, nameQuery);
        appendFavoritesOnlyFilter(sql, favoritesOnly);
        Long n = jdbc.queryForObject(sql.toString(), Long.class, args.toArray());
        return n == null ? 0L : n;
    }

    /** sortBy is intentionally excluded — order doesn't affect the count. */
    private static String buildCountKey(List<String> normalisedExts, long sizeMin, long sizeMax,
                                         String nameQuery, boolean favoritesOnly) {
        String q = nameQuery == null ? "" : nameQuery.trim();
        return String.join(",", normalisedExts) + "|" + sizeMin + "|" + sizeMax + "|" + q + "|" + favoritesOnly;
    }

    /**
     * Drop every cached video-library count. Call after any DB write that could change the
     * count: scan completion, file delete, favorite toggle. Cheap (clears a small map).
     */
    public void invalidateVideoLibraryCache() {
        countCache.invalidateAll();
    }

    /**
     * Appends a {@code n.size >= ? AND n.size < ?} clause when the range is narrower than the
     * full domain. The "all" bucket maps to {@code [0, Long.MAX_VALUE)} and is skipped here so
     * the SQL stays cheap when no filter is selected.
     */
    private static void appendSizeRangeFilter(StringBuilder sql, List<Object> args,
                                              long sizeMinInclusive, long sizeMaxExclusive) {
        if (sizeMinInclusive > 0) {
            sql.append(" AND n.size >= ?");
            args.add(sizeMinInclusive);
        }
        if (sizeMaxExclusive < Long.MAX_VALUE) {
            sql.append(" AND n.size < ?");
            args.add(sizeMaxExclusive);
        }
    }

    /**
     * Case-insensitive substring filter on the file name. Blank query is a no-op so callers
     * don't need to special-case "no search". Wildcards in the user-provided query are escaped
     * to literal characters via {@code ESCAPE '\\'} so a path containing {@code %} or {@code _}
     * doesn't accidentally broaden the match.
     */
    private static void appendNameQueryFilter(StringBuilder sql, List<Object> args, String nameQuery) {
        if (nameQuery == null) return;
        String trimmed = nameQuery.trim();
        if (trimmed.isEmpty()) return;
        String escaped = trimmed
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
        sql.append(" AND LOWER(n.name) LIKE LOWER(?) ESCAPE '\\'");
        args.add("%" + escaped + "%");
    }

    private static void appendFavoritesOnlyFilter(StringBuilder sql, boolean favoritesOnly) {
        if (favoritesOnly) sql.append(" AND f.path IS NOT NULL");
    }

    /** Idempotent insert; existing rows keep their original {@code created_at}. */
    public void addVideoFavorite(String path, long createdAt) {
        jdbc.update("INSERT OR IGNORE INTO treesize_video_favorite(path, created_at) VALUES (?, ?)",
                path, createdAt);
        countCache.invalidateAll();
    }

    /** Returns the rows-affected count, so callers can distinguish "wasn't favorited". */
    public int removeVideoFavorite(String path) {
        int n = jdbc.update("DELETE FROM treesize_video_favorite WHERE path = ?", path);
        if (n > 0) countCache.invalidateAll();
        return n;
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
                   AND n.ext IN (""");
        List<Object> args = new ArrayList<>(extensions.size() + 1);
        args.add(maxSize);
        for (int i = 0; i < extensions.size(); i++) {
            if (i > 0) sql.append(", ");
            sql.append("?");
            args.add(extensions.get(i).toLowerCase());
        }
        sql.append(")");
        appendExcludedPathFilters(sql, args);

        return jdbc.query(sql.toString(),
                (rs, i) -> new VideoFile(
                        rs.getString("scan_id"),
                        rs.getString("root_path"),
                        rs.getString("path"),
                        rs.getString("name"),
                        rs.getLong("size"),
                        false),
                args.toArray());
    }
}
