package com.exceptioncoder.toolbox.common.dynamicconfig.api.dto;

/** 配置块摘要。id = prefix；group 为所属分组（空串表示不分组）。 */
public record ConfigBlockSummary(String id, String name, String group) {
}
