package com.exceptioncoder.toolbox.prdclarify.domain;

/**
 * 一版不可变 PRD 产物的账本记录。
 *
 * @param id 账本记录 ID
 * @param sessionId PRD 会话 ID
 * @param type 产物类型
 * @param version 会话类型内的递增版本
 * @param state 文件核验状态
 * @param relativePath PRD 基础目录下的相对路径
 * @param sha256 READY 文件的 SHA-256
 * @param sizeBytes 文件字节数
 * @param sourceHash 生成输入指纹
 * @param promptVersion Prompt 版本
 * @param lastError 最近一次失败原因
 * @param createdAt 创建时间
 * @param updatedAt 更新时间
 */
public record PrdArtifact(
        String id,
        String sessionId,
        PrdArtifactType type,
        int version,
        PrdArtifactState state,
        String relativePath,
        String sha256,
        Long sizeBytes,
        String sourceHash,
        String promptVersion,
        String lastError,
        long createdAt,
        long updatedAt) {
}
