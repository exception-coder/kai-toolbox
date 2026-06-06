package com.exceptioncoder.toolbox.common.dynamicconfig.api.dto;

import jakarta.validation.constraints.NotNull;

import java.util.Map;

/** 提交覆盖。key 必须以配置块 prefix 开头，value 为字符串（后端按目标类型松绑定）。 */
public record UpdateOverridesRequest(@NotNull Map<String, String> overrides) {
}
