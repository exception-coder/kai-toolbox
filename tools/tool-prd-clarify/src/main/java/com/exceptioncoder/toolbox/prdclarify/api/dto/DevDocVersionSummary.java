package com.exceptioncoder.toolbox.prdclarify.api.dto;

/**
 * 开发文档某个版本的摘要信息，供「生成记录」抽屉展示版本列表。
 *
 * <p>版本列表以磁盘上实际存在的备份文件（{id}-dev-v{n}.md）+ 当前文件（{id}-dev.md）为准，
 * 不依赖 {@code dev_doc_history} JSON 记录——早于「生成记录」功能上线的旧会话，磁盘上
 * 已经有历次覆盖前自动备份出的版本文件，但没有对应的 JSON 记录，这些版本依然应该能查看内容，
 * 只是没有 mode/补充说明可展示。</p>
 *
 * @param version           版本号
 * @param isCurrent         是否为当前显示的版本（对应 {id}-dev.md 本身）
 * @param mode              generate | regenerate | update，null 表示该版本没有对应的
 *                          {@code dev_doc_history} 记录（早于该功能上线，仍可查看内容）
 * @param extraInstructions 当时使用的补充说明/更新说明；mode 为 null 时该字段也为 null
 * @param generatedAt       生成时间戳（毫秒）；无记录时为 null
 */
public record DevDocVersionSummary(
        int version,
        boolean isCurrent,
        String mode,
        String extraInstructions,
        Long generatedAt
) {}
