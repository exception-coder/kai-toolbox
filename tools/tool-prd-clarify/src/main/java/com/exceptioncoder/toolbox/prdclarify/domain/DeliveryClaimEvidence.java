package com.exceptioncoder.toolbox.prdclarify.domain;

/**
 * 一条源码证据的服务端核验快照。
 *
 * @param id 证据记录 ID
 * @param claimId 所属 claim 数据库 ID
 * @param relativePath 项目根下相对路径
 * @param lineStart 起始行，1-based
 * @param lineEnd 结束行，1-based
 * @param symbol 可选类或方法符号
 * @param fileSha256 服务端计算的整文件 SHA-256
 * @param status 核验状态
 * @param lastError 失败原因摘要
 * @param createdAt 创建时间
 */
public record DeliveryClaimEvidence(
        String id,
        String claimId,
        String relativePath,
        int lineStart,
        int lineEnd,
        String symbol,
        String fileSha256,
        DeliveryEvidenceStatus status,
        String lastError,
        long createdAt) {
}
