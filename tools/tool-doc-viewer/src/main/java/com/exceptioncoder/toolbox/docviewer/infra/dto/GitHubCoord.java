package com.exceptioncoder.toolbox.docviewer.infra.dto;

/**
 * GitHub 仓库定位坐标。
 *
 * @param subPath 仓库内子目录，无则为空串（不带前后斜杠）
 * @param focusFile 仅在 URL 是 /blob/{ref}/{file} 形态时填充，承载用户希望默认聚焦的文件 path
 */
public record GitHubCoord(
        String owner,
        String repo,
        String ref,
        String subPath,
        String focusFile
) {
}
