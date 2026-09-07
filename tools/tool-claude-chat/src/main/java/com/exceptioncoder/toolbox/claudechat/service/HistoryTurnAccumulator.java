package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.LinkedHashMap;
import java.util.Map;

/** Claude 与 Codex 共用的单轮 token 和时间累加器。 */
final class HistoryTurnAccumulator {
    Long startTs;
    Long firstOutputTs;
    Long lastTs;
    long input;
    long output;
    long cacheRead;
    long cacheCreate;
    boolean hasOutput;

    void reset(Long start) {
        startTs = start;
        firstOutputTs = null;
        lastTs = null;
        input = output = cacheRead = cacheCreate = 0;
        hasOutput = false;
    }

    void accumulate(JsonNode usage, Long ts) {
        if (usage != null && usage.isObject()) {
            input += usage.path("input_tokens").asLong(0);
            output += usage.path("output_tokens").asLong(0);
            cacheRead += usage.path("cache_read_input_tokens").asLong(0);
            cacheCreate += usage.path("cache_creation_input_tokens").asLong(0);
        }
        observeOutput(ts);
        hasOutput = true;
    }

    /** Codex token 字段口径：input_tokens 含缓存，需扣减得非缓存输入；output 含推理 token。 */
    void accumulateCodex(JsonNode usage, Long ts) {
        if (usage != null && usage.isObject()) {
            long inAll = usage.path("input_tokens").asLong(0);
            long cached = usage.path("cached_input_tokens").asLong(0);
            input += Math.max(0, inAll - cached);
            cacheRead += cached;
            output += usage.path("output_tokens").asLong(0) + usage.path("reasoning_output_tokens").asLong(0);
        }
        observeOutput(ts);
        hasOutput = true;
    }

    void observeOutput(Long ts) {
        if (ts == null) {
            return;
        }
        if (firstOutputTs == null) {
            firstOutputTs = ts;
        }
        lastTs = ts;
    }

    /** 未结束轮次只生成快照，下一条用户消息到来时才落定。 */
    ChatMessageView result(String id) {
        if (!hasOutput) {
            return null;
        }
        Map<String, Object> usage = new LinkedHashMap<>();
        usage.put("input_tokens", input);
        usage.put("output_tokens", output);
        usage.put("cache_read_input_tokens", cacheRead);
        usage.put("cache_creation_input_tokens", cacheCreate);
        Long latency = startTs != null && lastTs != null && lastTs >= startTs ? lastTs - startTs : null;
        Long ttft = startTs != null && firstOutputTs != null && firstOutputTs >= startTs
                ? firstOutputTs - startTs : null;
        return ChatMessageView.result(id, "end_turn", lastTs, usage, latency, ttft);
    }
}
