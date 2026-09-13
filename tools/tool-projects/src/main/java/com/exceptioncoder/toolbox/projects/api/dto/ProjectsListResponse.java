package com.exceptioncoder.toolbox.projects.api.dto;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * {@code GET /api/projects} 顶层响应。
 *
 * @param root        首个项目扫描根，保留单根客户端兼容；items 汇总所有项目根
 * @param rootExists  是否至少有一个扫描根存在；为 {@code false} 时 {@link #items} 为空
 * @param scannedAt   本次扫描完成时间；命中缓存时为缓存生成时间
 * @param items       项目列表，按 {@link ProjectInfo#lastModified()} 倒序
 */
public record ProjectsListResponse(
        String root,
        boolean rootExists,
        OffsetDateTime scannedAt,
        List<ProjectInfo> items
) {
}
