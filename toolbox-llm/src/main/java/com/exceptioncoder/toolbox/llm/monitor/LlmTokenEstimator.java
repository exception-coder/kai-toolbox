package com.exceptioncoder.toolbox.llm.monitor;

import org.springframework.stereotype.Component;

/**
 * Token 兜底估算器：部分本地模型（Ollama）不回传 TokenUsage 时，用确定性字符启发式估算。
 *
 * <p>遵循「确定性优先」——估算是纯算术，不调用任何模型。混合中英按 ~4 字符/token 近似。
 * 估算结果会被标记 {@code tokensEstimated=true}，仪表盘据此区分展示。
 */
@Component
public class LlmTokenEstimator {

    private static final int CHARS_PER_TOKEN = 4;

    /** 由字符数估算 token 数（向上取整，至少为内容非空时的 1）。 */
    public int estimate(int chars) {
        if (chars <= 0) {
            return 0;
        }
        return (chars + CHARS_PER_TOKEN - 1) / CHARS_PER_TOKEN;
    }
}
