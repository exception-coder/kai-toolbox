package com.exceptioncoder.toolbox.prdclarify.api.dto;

/** 启动 PRD/TDD 后台更新；变更原因由候选 AI 分析自动提供。 */
public record BackgroundDocUpdateRequest(String engine, String extraInstructions) {
}
