package com.exceptioncoder.toolbox.treesize.domain;

/**
 * treesize_video 表行的不可变映射。字段按 schema 分 7 组：basic / media / language /
 * thumbnail_grid / person_age / series / visual_cluster。同步路径只填 basic（其它列在
 * INSERT 时由 SQLite 自动 NULL）；各子模块通过 VideoTableRepository.updateXxx() 方法
 * 后续写入对应列。
 *
 * <p>用 {@link #forSync} 工厂构造同步插入用的行；用 {@link #row} mapper 从 ResultSet
 * 还原整行（各子模块的 findNeedingXxx 都需要拿到 thumbnail_grid_path 等列做依赖判断）。
 */
public record VideoRow(
        // ===== 标识 + basic =====
        String path,
        String name,
        String parentPath,
        String ext,
        long size,
        String sourceScanId,
        long firstSyncedAt,
        long lastSyncedAt,
        // ===== media =====
        Double durationS,
        String durationBucket,
        Integer width,
        Integer height,
        String videoCodec,
        String audioCodec,
        String audioLangTag,
        // ===== language =====
        String language,
        Double languageConfidence,
        Long languageDetectedAt,
        // ===== thumbnail_grid =====
        String thumbnailGridPath,
        Long thumbnailGridGeneratedAt,
        // ===== person_age =====
        String personMainAgeGroup,
        Integer personMainAge,
        String personMainGender,
        Double personAgeConfidence,
        Long personAgeDetectedAt,
        String personAgeReason,
        // ===== series =====
        String seriesSignature,
        Integer seriesEpisode,
        // ===== visual_cluster =====
        Integer visualClusterId,
        String visualClusterLabel,
        Long visualClusteredAt
) {

    /**
     * 同步场景使用：basic 字段全填，其它列全 NULL。各子模块后续通过 UPDATE 写入。
     * {@code firstSyncedAt} 与 {@code lastSyncedAt} 在首次插入时一致；本期不更新 last（只增不改）。
     */
    public static VideoRow forSync(String path, String name, String parentPath, String ext,
                                    long size, String sourceScanId, long now) {
        return new VideoRow(path, name, parentPath, ext, size, sourceScanId, now, now,
                // media
                null, null, null, null, null, null, null,
                // language
                null, null, null,
                // thumbnail_grid
                null, null,
                // person_age
                null, null, null, null, null, null,
                // series
                null, null,
                // visual_cluster
                null, null, null);
    }
}
