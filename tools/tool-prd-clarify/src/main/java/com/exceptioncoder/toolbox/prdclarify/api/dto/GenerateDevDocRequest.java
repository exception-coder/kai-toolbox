package com.exceptioncoder.toolbox.prdclarify.api.dto;

import java.util.List;

/**
 * 生成/重新生成/更新开发文档的请求体。
 *
 * @param extraInstructions 用户在生成前弹框里补充的自定义提示词/更新说明（可选，null/空表示不追加）。
 *                          历史技术问答通过 qaHistory 兼容传入，两者在服务端分别持久化。
 * @param updateExisting    true = 基于当前已有开发文档做增量更新（保留原结构，标注 ✅/🔄/🆕 状态）；
 *                          false/null = 从 PRD 从零生成/覆盖（原有行为，默认）。
 * @param qaHistory         历史 TDD 技术问答；新流程直接生成执行计划时传空列表。
 * @param clarificationCompleted 兼容门禁标志；新流程在提交生成时直接传 true，不代表执行过问答。
 */
public record GenerateDevDocRequest(String extraInstructions, Boolean updateExisting, List<QaPairRequest> qaHistory,
                                    Boolean clarificationCompleted, String engine, Boolean background) {
}
