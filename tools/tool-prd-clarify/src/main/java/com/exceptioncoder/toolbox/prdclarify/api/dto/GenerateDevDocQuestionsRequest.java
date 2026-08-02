package com.exceptioncoder.toolbox.prdclarify.api.dto;

/**
 * 批量生成 TDD 技术澄清问题。
 *
 * @param updateNotes 用户对本次生成或更新补充的技术约束
 * @param mode        initial = 首次/重新生成；update = 增量更新已有 TDD
 * @param engine      claude | codex
 */
public record GenerateDevDocQuestionsRequest(
        String updateNotes,
        String mode,
        String engine,
        Boolean background
) {}
