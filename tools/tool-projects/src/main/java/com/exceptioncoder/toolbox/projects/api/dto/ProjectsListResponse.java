package com.exceptioncoder.toolbox.projects.api.dto;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * {@code GET /api/projects} 顶层响应。
 *
 * @param root        当前生效的扫描根（来自 {@code toolbox.projects.root}），原样回显方便前端展示
 * @param rootExists  根目录是否存在；为 {@code false} 时 {@link #items} 为空
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
