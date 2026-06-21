package com.exceptioncoder.toolbox.common.dynamicconfig.api.dto;

import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.Map;

/**
 * 提交覆盖。key 必须以配置块 prefix 开头，value 为字符串（后端按目标类型松绑定）。
 *
 * @param replacePrefixes 保存集合时先清理这些前缀下的旧覆盖，再写入新的 indexed key
 */
public record UpdateOverridesRequest(@NotNull Map<String, String> overrides, List<String> replacePrefixes) {

    public UpdateOverridesRequest {
        if (replacePrefixes == null) {
            replacePrefixes = List.of();
        }
    }
}
