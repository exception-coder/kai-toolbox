package com.exceptioncoder.toolbox.aisecretary.ai;

import java.util.List;

/** ProfileExtractor 的结构化输出：一批候选记忆。LangChain4j 自动注入 JSON 约束并解析。 */
public record MemoryProposal(List<MemoryCandidate> items) {

    /** 单条候选记忆。category 用中文 label（偏好/禁区/核心人物）；非法类目由代码裁决时丢弃。 */
    public record MemoryCandidate(
            String category,
            String key,
            String value,
            String detail,
            Double confidence) {
    }
}
