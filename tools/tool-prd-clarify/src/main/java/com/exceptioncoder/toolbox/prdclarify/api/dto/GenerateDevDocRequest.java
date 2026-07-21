package com.exceptioncoder.toolbox.prdclarify.api.dto;

import java.util.List;

/**
 * 生成/重新生成/更新开发文档的请求体。
 *
 * @param extraInstructions 用户在生成前弹框里补充的自定义提示词/更新说明（可选，null/空表示不追加）。
 *                          update 模式下这里只是初步说明文本，不含澄清问答——问答通过 qaHistory
 *                          结构化传入，两者在服务端分别持久化，不再由前端拼成一段文本再传回来。
 * @param updateExisting    true = 基于当前已有开发文档做增量更新（保留原结构，标注 ✅/🔄/🆕 状态）；
 *                          false/null = 从 PRD 从零生成/覆盖（原有行为，默认）。
 * @param qaHistory         update 模式下 DevDocUpdateDialog 多轮澄清产出的问答记录（可选，
 *                          generate/regenerate 模式恒为空）；结构化持久化后，「生成记录」才能
 *                          按版本分别展示每次更新的澄清过程，而不是和 PRD 首次澄清记录混在一起看。
 */
public record GenerateDevDocRequest(String extraInstructions, Boolean updateExisting, List<QaPairRequest> qaHistory) {
}
