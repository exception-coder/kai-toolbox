package com.exceptioncoder.toolbox.claudechat.domain.delegation;

import java.time.Instant;

/**
 * 已执行公共命令的幂等回执。
 *
 * @param id 回执 ID
 * @param grantId 授权 ID
 * @param commandId Client 生成的幂等键
 * @param commandType 公共命令类型
 * @param sessionVersion 执行后的公开会话版本
 * @param resultJson 可重复返回的有界结果
 * @param createdAt 创建时间
 * @param updatedAt 更新时间
 */
public record SessionCommandReceipt(
        String id,
        String grantId,
        String commandId,
        SessionParticipantCommand commandType,
        long sessionVersion,
        String resultJson,
        Instant createdAt,
        Instant updatedAt) {
}
