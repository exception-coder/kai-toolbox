package com.exceptioncoder.toolbox.common.dynamicconfig.api.dto;

import java.util.List;

/** 某配置块的有效值视图。 */
public record ConfigBlockView(String id, String name, List<Entry> entries) {

    /**
     * @param key        扁平化配置 key
     * @param value      当前有效值（字符串形式）
     * @param overridden true=来自 SQLite 覆盖，false=yml 默认
     */
    public record Entry(String key, String value, boolean overridden) {
    }
}
