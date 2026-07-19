package com.exceptioncoder.toolbox.prdclarify.api.dto;

/**
 * 生成/重新生成/更新开发文档的请求体。
 *
 * @param extraInstructions 用户在生成前弹框里补充的自定义提示词/更新说明（可选，null/空表示不追加）。
 * @param updateExisting    true = 基于当前已有开发文档做增量更新（保留原结构，标注 ✅/🔄/🆕 状态）；
 *                          false/null = 从 PRD 从零生成/覆盖（原有行为，默认）。
 */
public record GenerateDevDocRequest(String extraInstructions, Boolean updateExisting) {
}
