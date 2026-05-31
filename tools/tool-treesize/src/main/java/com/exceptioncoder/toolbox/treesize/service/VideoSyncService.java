package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.treesize.api.dto.VideoSyncResult;
import com.exceptioncoder.toolbox.treesize.config.VideoExtensionsProperties;
import com.exceptioncoder.toolbox.treesize.domain.VideoRow;
import com.exceptioncoder.toolbox.treesize.repository.VideoTableRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * 视频库同步：从 treesize_node 拉所有 size>=30KB 的视频文件，INSERT OR IGNORE 到 treesize_video。
 *
 * <p>同步语义为<b>只增不改</b>：path 已存在的行任何列都不动，保护各子模块（语言识别 / 九宫格 /
 * 人物年龄 / 嵌入聚类）已写入的衍生数据。
 *
 * <p>过滤规则与 NodeRepository.findVideos 同源：
 * <ul>
 *   <li>{@code is_dir = 0}（仅文件）</li>
 *   <li>{@code lower(ext) IN (VideoExtensionsProperties)}（视频扩展名白名单）</li>
 *   <li>{@code size >= 30 * 1024}（过滤损坏/缩略图/空壳噪音；与前端 video-library 显示过滤阈值对齐）</li>
 *   <li>关联 scan 的 {@code status = 'COMPLETED'}（排除半成品扫盘）</li>
 * </ul>
 *
 * <p>性能：万级视频量级 batch insert 秒级；接口同步阻塞返回，不上 SSE。
 */
@Service
public class VideoSyncService {

    private static final Logger log = LoggerFactory.getLogger(VideoSyncService.class);
    private static final long MIN_SIZE_BYTES = 30L * 1024;

    private final JdbcTemplate jdbc;
    private final VideoTableRepository videoRepo;
    private final VideoExtensionsProperties videoExt;

    public VideoSyncService(JdbcTemplate jdbc,
                             VideoTableRepository videoRepo,
                             VideoExtensionsProperties videoExt) {
        this.jdbc = jdbc;
        this.videoRepo = videoRepo;
        this.videoExt = videoExt;
    }

    public VideoSyncResult sync() {
        long t0 = System.currentTimeMillis();
        List<String> exts = videoExt.getExtensions().stream()
                .map(s -> s.toLowerCase(Locale.ROOT))
                .toList();
        if (exts.isEmpty()) {
            log.warn("video sync skipped: toolbox.video.extensions is empty");
            return new VideoSyncResult(0, 0, 0, 0, System.currentTimeMillis() - t0);
        }

        // 信息性查询：小于 30KB 被过滤掉的数量，让用户感知噪音规模
        long skippedTooSmall = countVideosBelowSize(exts);

        // 主查询：所有候选视频 → 转换为 VideoRow 同步插入
        List<VideoRow> candidates = selectVideosFromNode(exts);
        long now = System.currentTimeMillis();
        List<VideoRow> withTimestamp = new ArrayList<>(candidates.size());
        for (VideoRow r : candidates) {
            withTimestamp.add(VideoRow.forSync(
                    r.path(), r.name(), r.parentPath(), r.ext(),
                    r.size(), r.sourceScanId(), now));
        }

        long inserted = videoRepo.batchInsertIgnore(withTimestamp);
        long skippedExisting = withTimestamp.size() - inserted;
        long elapsed = System.currentTimeMillis() - t0;

        log.info("video sync done: scanned={} inserted={} skippedExisting={} skippedTooSmall={} elapsed={}ms",
                withTimestamp.size(), inserted, skippedExisting, skippedTooSmall, elapsed);

        return new VideoSyncResult(withTimestamp.size(), inserted, skippedExisting,
                skippedTooSmall, elapsed);
    }

    /**
     * 单独 COUNT 拿到"小于 30KB 被过滤的视频数"，与主查询条件除 size 阈值外完全一致。
     * 即使 N 很大也 < 1s（COUNT 走 idx_node_video_ext_size 索引）。
     */
    private long countVideosBelowSize(List<String> exts) {
        StringBuilder sql = new StringBuilder("""
                SELECT COUNT(*) FROM treesize_node n
                  JOIN treesize_scan s ON n.scan_id = s.id
                 WHERE n.is_dir = 0
                   AND s.status = 'COMPLETED'
                   AND n.size < ?""");
        List<Object> args = new ArrayList<>();
        args.add(MIN_SIZE_BYTES);
        appendExtIn(sql, args, exts);
        Long n = jdbc.queryForObject(sql.toString(), Long.class, args.toArray());
        return n == null ? 0L : n;
    }

    /**
     * SELECT 候选视频。返回的 {@link VideoRow} 只填了 basic 字段（其它字段 NULL，
     * 等同步落库后由各子模块异步填充）。
     *
     * <p>注意：treesize_node 的 ext 列可能尚未 backfill 完成（TreeSizeMigration 后台任务）；
     * 此时 ext IN (...) 会漏掉部分行，可接受 —— 用户感知是"同步少了几个，再点一次就齐"。
     * 不像视频库列表查询那样要走 legacy LIKE 兜底路径（同步本身就是用户主动触发的批操作，
     * 偶尔少几行下次同步会补上）。
     */
    private List<VideoRow> selectVideosFromNode(List<String> exts) {
        StringBuilder sql = new StringBuilder("""
                SELECT n.path, n.name, n.parent_path, n.ext, n.size, n.scan_id
                  FROM treesize_node n
                  JOIN treesize_scan s ON n.scan_id = s.id
                 WHERE n.is_dir = 0
                   AND s.status = 'COMPLETED'
                   AND n.size >= ?""");
        List<Object> args = new ArrayList<>();
        args.add(MIN_SIZE_BYTES);
        appendExtIn(sql, args, exts);
        sql.append(" ORDER BY n.path");   // 排序仅为了 INSERT OR IGNORE 命中顺序稳定，便于 debug

        return jdbc.query(sql.toString(),
                (rs, i) -> VideoRow.forSync(
                        rs.getString("path"),
                        rs.getString("name"),
                        rs.getString("parent_path"),
                        rs.getString("ext"),
                        rs.getLong("size"),
                        rs.getString("scan_id"),
                        0L /* now 由调用方统一替换 */),
                args.toArray());
    }

    /** 把 ext 白名单展开成 {@code AND lower(n.ext) IN (?, ?, ...)}。 */
    private static void appendExtIn(StringBuilder sql, List<Object> args, List<String> exts) {
        sql.append(" AND lower(n.ext) IN (");
        for (int i = 0; i < exts.size(); i++) {
            if (i > 0) sql.append(", ");
            sql.append("?");
            args.add(exts.get(i));
        }
        sql.append(")");
    }
}
