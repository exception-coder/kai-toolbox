package com.exceptioncoder.toolbox.llm.monitor;

import com.exceptioncoder.toolbox.llm.model.ModelSpec;
import org.springframework.stereotype.Component;

/**
 * 成本核算：token × 单价，纯算术（确定性，零 LLM）。
 * 单价取自 {@link ModelSpec}（元 / 百万 token）；未配置单价则成本为 0。
 */
@Component
public class LlmCostCalculator {

    private static final double PER_MILLION = 1_000_000.0;

    public double cost(ModelSpec spec, Integer inputTokens, Integer outputTokens) {
        if (spec == null) {
            return 0.0;
        }
        double in = (inputTokens == null ? 0 : inputTokens) / PER_MILLION * spec.getInputPricePerMTok();
        double out = (outputTokens == null ? 0 : outputTokens) / PER_MILLION * spec.getOutputPricePerMTok();
        return in + out;
    }
}
