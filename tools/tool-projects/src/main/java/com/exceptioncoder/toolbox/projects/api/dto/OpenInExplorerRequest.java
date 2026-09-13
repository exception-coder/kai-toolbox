package com.exceptioncoder.toolbox.projects.api.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * {@code POST /api/projects/open} 请求体。
 *
 * @param path 待在系统文件管理器中打开的绝对路径；必须落在统一项目目录范围内
 */
public record OpenInExplorerRequest(
        @NotBlank String path
) {
}
