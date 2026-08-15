package com.exceptioncoder.toolbox.prdclarify.domain;

/**
 * 一次由白名单命令驱动的交付验证运行。
 *
 * @param id 运行 ID
 * @param sessionId PRD 会话 ID
 * @param commandId 服务端白名单命令 ID
 * @param gitHead 启动时项目 Git HEAD
 * @param status 原始运行状态
 * @param exitCode 进程退出码
 * @param testCount 可识别的测试数量
 * @param outputSummary 有界脱敏输出摘要
 * @param lastError 失败原因摘要
 * @param startedAt 启动时间
 * @param finishedAt 完成时间
 * @param createdAt 创建时间
 * @param updatedAt 更新时间
 */
public record DeliveryVerificationRun(
        String id,
        String sessionId,
        String commandId,
        String gitHead,
        DeliveryVerificationStatus status,
        Integer exitCode,
        Integer testCount,
        String outputSummary,
        String lastError,
        long startedAt,
        Long finishedAt,
        long createdAt,
        long updatedAt) {
}
