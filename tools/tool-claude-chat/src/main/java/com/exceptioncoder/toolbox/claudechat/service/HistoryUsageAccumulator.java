package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.exceptioncoder.toolbox.claudechat.api.dto.SessionUsageView;

import java.util.Map;

/** 汇总历史消息元数据，不需要保存或重新解析消息正文。 */
final class HistoryUsageAccumulator {
    private long input;
    private long output;
    private long cacheRead;
    private long cacheCreate;
    private long turnDuration;
    private long toolDuration;
    private long ttftTotal;
    private int turns;
    private int steps;
    private int ttftSamples;

    void add(ChatMessageView message) {
        if ("assistant".equals(message.kind()) && message.text() != null && !message.text().isBlank()) {
            addStep();
        } else if ("tool".equals(message.kind())) {
            addStep();
            adjustToolDuration(message.elapsedMs(), null);
        } else if ("result".equals(message.kind()) && message.usage() != null) {
            addResult(message);
        }
    }

    void addStep() {
        steps++;
    }

    void adjustToolDuration(Long elapsed, Long previous) {
        toolDuration += (elapsed == null ? 0 : elapsed) - (previous == null ? 0 : previous);
    }

    private void addResult(ChatMessageView message) {
        input += tokens(message.usage(), "input_tokens");
        output += tokens(message.usage(), "output_tokens");
        cacheRead += tokens(message.usage(), "cache_read_input_tokens");
        cacheCreate += tokens(message.usage(), "cache_creation_input_tokens");
        turns++;
        turnDuration += message.latencyMs() == null ? 0 : message.latencyMs();
        if (message.ttftMs() != null) {
            ttftTotal += message.ttftMs();
            ttftSamples++;
        }
    }

    private static long tokens(Map<String, Object> usage, String key) {
        Object value = usage.get(key);
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text) {
            try {
                return Long.parseLong(text);
            } catch (NumberFormatException invalid) {
                return 0;
            }
        }
        return 0;
    }

    SessionUsageView snapshot(ChatMessageView pendingTurn) {
        HistoryUsageAccumulator total = new HistoryUsageAccumulator();
        total.input = input;
        total.output = output;
        total.cacheRead = cacheRead;
        total.cacheCreate = cacheCreate;
        total.turnDuration = turnDuration;
        total.toolDuration = toolDuration;
        total.ttftTotal = ttftTotal;
        total.turns = turns;
        total.steps = steps;
        total.ttftSamples = ttftSamples;
        if (pendingTurn != null) {
            total.add(pendingTurn);
        }
        return total.view();
    }

    private SessionUsageView view() {
        long modelDuration = Math.max(0, turnDuration - toolDuration);
        Long averageTtft = ttftSamples > 0 ? ttftTotal / ttftSamples : null;
        Double outputRate = modelDuration > 0 ? output * 1000.0 / modelDuration : null;
        return new SessionUsageView(input, output, cacheRead, cacheCreate, input + output + cacheRead + cacheCreate,
                turns, steps, modelDuration, toolDuration, averageTtft, ttftSamples, outputRate);
    }
}
