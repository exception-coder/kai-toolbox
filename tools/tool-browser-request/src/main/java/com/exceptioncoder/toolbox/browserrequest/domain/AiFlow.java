package com.exceptioncoder.toolbox.browserrequest.domain;

import java.util.List;

/**
 * 已确认落库的 AI 用例：自然语言指令 + LLM 生成并经人工确认的动作脚本。
 * steps 在 DB 中以 JSON 文本存储于 steps_json 列。
 */
public record AiFlow(
        String id,
        String sessionId,
        String name,
        String instruction,
        List<FlowAction> steps,
        long createdAt,
        long updatedAt
) {}
