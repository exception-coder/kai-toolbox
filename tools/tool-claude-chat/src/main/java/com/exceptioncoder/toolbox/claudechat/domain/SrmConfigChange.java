package com.exceptioncoder.toolbox.claudechat.domain;

/**
 * 开发任务下的一条配置变更登记（配置项 + 作用域 + 旧值/新值 + 备注）。纯台账：
 * {@code applied} 只是人工勾选的「已应用」标记，后端不真正下发/改配置中心。
 */
public record SrmConfigChange(
        String id,
        String taskId,
        String configKey,
        String scope,
        String oldValue,
        String newValue,
        String remark,
        boolean applied,
        int sortOrder,
        long createdAt,
        long updatedAt) {
}
