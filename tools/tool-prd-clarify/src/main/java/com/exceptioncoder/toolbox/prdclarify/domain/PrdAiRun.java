package com.exceptioncoder.toolbox.prdclarify.domain;

/**
 * 一次 PRD AI 调用的不可变审计快照。
 *
 * @param id 运行身份
 * @param sessionId PRD 会话身份
 * @param purpose Prompt 用途
 * @param promptVersion Prompt 版本
 * @param promptSha256 Prompt 内容哈希
 * @param inputFingerprint 最终用户输入指纹
 * @param engine 执行引擎
 * @param model 模型
 * @param candidateId 关联的文档变更候选
 * @param artifactId 关联的产物账本记录
 * @param status 运行状态
 * @param outputSha256 模型输出哈希
 * @param lastError 失败摘要
 * @param startedAt 开始时间
 * @param finishedAt 结束时间
 * @param createdAt 创建时间
 * @param updatedAt 更新时间
 */
public record PrdAiRun(
        String id,
        String sessionId,
        PrdPromptPurpose purpose,
        String promptVersion,
        String promptSha256,
        String inputFingerprint,
        String engine,
        String model,
        String candidateId,
        String artifactId,
        PrdAiRunStatus status,
        String outputSha256,
        String lastError,
        long startedAt,
        Long finishedAt,
        long createdAt,
        long updatedAt
) {
}
