package com.exceptioncoder.toolbox.aisecretary.ai;

import java.util.List;

/**
 * LLM 结构化抽取的单条记录（AI 出参，尚未归一化/落库）。
 * confidence 用包装类型 Double，模型偶尔漏给时按 null 处理而非解析失败。
 */
public record CapturedItem(
        String category,
        String title,
        String dueTime,
        Double amount,
        List<String> tags,
        Double confidence) {
}
