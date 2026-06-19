package com.exceptioncoder.toolbox.claudechat.service.usage;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Codex：扫 ~/.codex/sessions/**&#47;rollout-*.jsonl 的 token_count 事件。
 * payload.info.last_token_usage 为本轮增量（input_tokens 含 cached_input_tokens）；
 * payload.rate_limits 为官方额度快照（取 timestamp 最新一条）。
 */
@Component
class CodexUsageScanner extends AbstractUsageScanner {

    CodexUsageScanner(ObjectMapper mapper) {
        super(mapper);
    }

    @Override
    public String engine() {
        return "codex";
    }

    @Override
    public ScanResult scan(long sinceMs) {
        Path root = home(".codex", "sessions");
        List<TurnRecord> out = new ArrayList<>();
        QuotaSnapshot[] quota = {null};
        long[] quotaTs = {Long.MIN_VALUE};

        for (Path f : recentJsonl(root, sinceMs)) {
            String sid = sid(f);
            forEachLine(f, node -> {
                JsonNode payload = node.path("payload");
                if (!"token_count".equals(payload.path("type").asText(""))) return;
                Long ts = parseTs(node);
                if (ts == null) return;

                JsonNode last = payload.path("info").path("last_token_usage");
                if (last.isObject() && ts >= sinceMs) {
                    long inAll = last.path("input_tokens").asLong(0);
                    long cached = last.path("cached_input_tokens").asLong(0);
                    long outp = last.path("output_tokens").asLong(0) + last.path("reasoning_output_tokens").asLong(0);
                    long input = Math.max(0, inAll - cached); // 非缓存输入
                    if (input != 0 || outp != 0 || cached != 0) {
                        out.add(new TurnRecord(ts, input, outp, cached, 0, sid, true));
                    }
                }

                // 官方额度快照：取时间最新的一条 rate_limits
                JsonNode rl = payload.path("rate_limits");
                if (rl.isObject() && ts > quotaTs[0]) {
                    JsonNode pri = rl.path("primary");
                    JsonNode sec = rl.path("secondary");
                    quota[0] = new QuotaSnapshot(
                            num(pri, "used_percent"), intOf(pri, "window_minutes"), longOf(pri, "resets_at"),
                            num(sec, "used_percent"), intOf(sec, "window_minutes"), longOf(sec, "resets_at"),
                            rl.path("plan_type").isTextual() ? rl.path("plan_type").asText() : null, ts);
                    quotaTs[0] = ts;
                }
            });
        }
        return new ScanResult(out, quota[0]);
    }

    private static Double num(JsonNode n, String k) {
        return n.path(k).isNumber() ? n.path(k).asDouble() : null;
    }

    private static Integer intOf(JsonNode n, String k) {
        return n.path(k).isNumber() ? n.path(k).asInt() : null;
    }

    private static Long longOf(JsonNode n, String k) {
        return n.path(k).isNumber() ? n.path(k).asLong() : null;
    }
}
