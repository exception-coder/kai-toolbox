package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.treesize.domain.CleanupCandidate;
import com.exceptioncoder.toolbox.treesize.domain.CleanupCategory;
import com.exceptioncoder.toolbox.treesize.domain.CleanupSafety;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
public class CleanupAdvisor {

    private static final long GB = 1024L * 1024 * 1024;
    private static final long LARGE_FILE_THRESHOLD = GB;
    private static final long OLD_FILE_AGE_MS = Duration.ofDays(90).toMillis();
    private static final int LIMIT_PER_CATEGORY = 80;

    private final JdbcTemplate jdbc;

    public CleanupAdvisor(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<CleanupCandidate> advise(String scanId) {
        List<CleanupCandidate> out = new ArrayList<>();
        out.addAll(cacheCandidates(scanId));
        out.addAll(dockerCandidates(scanId));
        out.addAll(largeOldCandidates(scanId));
        out.addAll(duplicateCandidates(scanId));
        out.addAll(dangerousCandidates(scanId));
        return out.stream()
                .sorted(Comparator
                        .comparing((CleanupCandidate c) -> safetyRank(c.safety()))
                        .thenComparing(CleanupCandidate::size, Comparator.reverseOrder()))
                .toList();
    }

    private List<CleanupCandidate> largeOldCandidates(String scanId) {
        long olderThan = System.currentTimeMillis() - OLD_FILE_AGE_MS;
        return jdbc.query("""
                SELECT n.*, m.modified_at
                  FROM treesize_node n
                  LEFT JOIN treesize_node_meta m ON m.scan_id = n.scan_id AND m.path = n.path
                 WHERE n.scan_id = ?
                   AND n.is_dir = 0
                   AND n.size >= ?
                   AND (m.modified_at IS NULL OR m.modified_at <= ?)
                 ORDER BY n.size DESC
                 LIMIT ?
                """,
                (rs, i) -> candidate(rs, CleanupCategory.LARGE_OLD, CleanupSafety.REVIEW,
                        "超过 1 GiB 且 90 天未修改或缺少修改时间，适合人工确认是否还需要。",
                        "建议先确认文件来源，再删除或迁移归档。"),
                scanId, LARGE_FILE_THRESHOLD, olderThan, LIMIT_PER_CATEGORY);
    }

    private List<CleanupCandidate> duplicateCandidates(String scanId) {
        return jdbc.query("""
                SELECT n.*, m.modified_at
                  FROM treesize_node n
                  LEFT JOIN treesize_node_meta m ON m.scan_id = n.scan_id AND m.path = n.path
                  JOIN (
                    SELECT LOWER(name) AS lower_name, size
                      FROM treesize_node
                     WHERE scan_id = ?
                       AND is_dir = 0
                       AND size > 0
                     GROUP BY LOWER(name), size
                    HAVING COUNT(*) > 1
                  ) d ON d.lower_name = LOWER(n.name) AND d.size = n.size
                 WHERE n.scan_id = ?
                   AND n.is_dir = 0
                 ORDER BY n.size DESC, n.name ASC
                 LIMIT ?
                """,
                (rs, i) -> candidate(rs, CleanupCategory.DUPLICATE, CleanupSafety.REVIEW,
                        "文件名和大小重复，可能是重复文件；精确删除前建议接入 jdupes/rmlint 做内容校验。",
                        "建议保留一份，其余在人工确认内容一致后删除。"),
                scanId, scanId, LIMIT_PER_CATEGORY);
    }

    private List<CleanupCandidate> cacheCandidates(String scanId) {
        return jdbc.query("""
                SELECT n.*, m.modified_at
                  FROM treesize_node n
                  LEFT JOIN treesize_node_meta m ON m.scan_id = n.scan_id AND m.path = n.path
                 WHERE n.scan_id = ?
                   AND n.is_dir = 1
                   AND (
                        LOWER(n.name) IN ('node_modules', 'target', 'build', 'dist', '.gradle', '.cache', 'tmp', 'temp')
                        OR LOWER(n.path) LIKE '%.m2/repository%'
                        OR LOWER(n.path) LIKE '%/logs/%'
                        OR LOWER(n.name) LIKE '%.log'
                        OR LOWER(n.name) LIKE '%.tmp'
                   )
                 ORDER BY n.size DESC
                 LIMIT ?
                """,
                (rs, i) -> candidate(rs, CleanupCategory.CACHE, CleanupSafety.SAFE,
                        "缓存、构建产物、依赖缓存或临时目录，通常可重建。",
                        "建议优先清理；如是正在运行服务的日志目录，先确认服务轮转策略。"),
                scanId, LIMIT_PER_CATEGORY);
    }

    private List<CleanupCandidate> dockerCandidates(String scanId) {
        return jdbc.query("""
                SELECT n.*, m.modified_at
                  FROM treesize_node n
                  LEFT JOIN treesize_node_meta m ON m.scan_id = n.scan_id AND m.path = n.path
                 WHERE n.scan_id = ?
                   AND n.is_dir = 1
                   AND (
                        LOWER(n.path) LIKE '%/var/lib/docker/%'
                        OR LOWER(n.path) LIKE '%/.docker/%'
                        OR LOWER(n.name) IN ('overlay2', 'volumes', 'containers', 'buildkit')
                   )
                 ORDER BY n.size DESC
                 LIMIT ?
                """,
                (rs, i) -> candidate(rs, CleanupCategory.DOCKER, CleanupSafety.REVIEW,
                        "Docker 镜像、容器、volume 或 build cache 占用，直接删目录风险高。",
                        "建议通过 docker system df/prune 或精确删除无用 volume 清理。"),
                scanId, LIMIT_PER_CATEGORY);
    }

    private List<CleanupCandidate> dangerousCandidates(String scanId) {
        return jdbc.query("""
                SELECT n.*, m.modified_at
                  FROM treesize_node n
                  LEFT JOIN treesize_node_meta m ON m.scan_id = n.scan_id AND m.path = n.path
                 WHERE n.scan_id = ?
                   AND (
                        LOWER(n.path) LIKE '%/mysql/%'
                        OR LOWER(n.path) LIKE '%/postgres%'
                        OR LOWER(n.path) LIKE '%/mongodb%'
                        OR LOWER(n.path) LIKE '%/upload%'
                        OR LOWER(n.path) LIKE '%/uploads%'
                        OR LOWER(n.path) LIKE '%/data/%'
                        OR LOWER(n.name) LIKE '%.db'
                        OR LOWER(n.name) LIKE '%.sqlite'
                        OR LOWER(n.name) LIKE '%.sqlite3'
                   )
                 ORDER BY n.size DESC
                 LIMIT ?
                """,
                (rs, i) -> candidate(rs, CleanupCategory.DANGEROUS, CleanupSafety.DANGEROUS,
                        "看起来像数据库、上传文件或业务数据，只作为风险提示。",
                        "不建议在本工具内直接删除；应先确认备份、业务归属和停机窗口。"),
                scanId, LIMIT_PER_CATEGORY);
    }

    private static CleanupCandidate candidate(ResultSet rs,
                                              CleanupCategory category,
                                              CleanupSafety safety,
                                              String reason,
                                              String deleteHint) throws SQLException {
        return CleanupCandidate.builder()
                .category(category)
                .safety(safety)
                .path(rs.getString("path"))
                .name(rs.getString("name"))
                .dir(rs.getInt("is_dir") == 1)
                .size(rs.getLong("size"))
                .fileCount(rs.getLong("file_count"))
                .dirCount(rs.getLong("dir_count"))
                .modifiedAt(nullableLong(rs, "modified_at"))
                .reason(reason)
                .deleteHint(deleteHint)
                .build();
    }

    private static Long nullableLong(ResultSet rs, String column) throws SQLException {
        long value = rs.getLong(column);
        return rs.wasNull() ? null : value;
    }

    private static int safetyRank(CleanupSafety safety) {
        return switch (safety) {
            case SAFE -> 0;
            case REVIEW -> 1;
            case DANGEROUS -> 2;
        };
    }
}
