package com.exceptioncoder.toolbox.treesize.api.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 包管理器缓存配置迁移请求。
 *
 * @param targetPath 当前管理器的精确目标缓存目录
 */
public record PackageCacheConfigureRequest(@NotBlank String targetPath) {
}
