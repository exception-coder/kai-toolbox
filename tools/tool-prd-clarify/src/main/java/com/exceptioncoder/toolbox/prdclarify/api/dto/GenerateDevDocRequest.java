package com.exceptioncoder.toolbox.prdclarify.api.dto;

import java.util.List;

/**
 * 生成/重新生成/更新开发文档的请求体。
 *
 * @param extraInstructions 用户在生成前弹框里补充的自定义提示词/更新说明（可选，null/空表示不追加）。
 *                          技术澄清问答通过 qaHistory 结构化传入，两者在服务端分别持久化。
 * @param updateExisting    true = 基于当前已有开发文档做增量更新（保留原结构，标注 ✅/🔄/🆕 状态）；
 *                          false/null = 从 PRD 从零生成/覆盖（原有行为，默认）。
 * @param qaHistory         本次 TDD 生成/更新前的技术澄清问答；结构化持久化后，「生成记录」
 *                          可按版本展示澄清过程，并与 PRD 业务澄清记录分开。
 * @param clarificationCompleted 是否已经走完本次 TDD 技术澄清（即使 AI 判断无需提问也为 true）
 */
public record GenerateDevDocRequest(String extraInstructions, Boolean updateExisting, List<QaPairRequest> qaHistory,
                                    Boolean clarificationCompleted, String engine) {
}
