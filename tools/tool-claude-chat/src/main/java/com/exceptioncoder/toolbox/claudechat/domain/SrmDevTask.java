package com.exceptioncoder.toolbox.claudechat.domain;

/**
 * SRM 需求开发的一个「开发任务」：一次开发工作的登记单元，下挂 SQL 变更与配置变更两类登记。
 * status：open（待开发）/ developing（开发中）/ done（已完成）/ archived（已归档）。
 */
public record SrmDevTask(
        String id,
        String title,
        String moduleName,
        String requirement,
        String owner,
        String status,
        long createdAt,
        long updatedAt) {
}
