package com.exceptioncoder.toolbox.claudechat.service.usage;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** Claude：递归扫 ~/.claude/projects 下的 jsonl，取 assistant 行 message.usage。 */
@Component
class ClaudeUsageScanner extends AbstractUsageScanner {

    ClaudeUsageScanner(ObjectMapper mapper) {
        super(mapper);
    }

    @Override
    public String engine() {
        return "claude";
    }

    @Override
    public ScanResult scan(long sinceMs) {
        Path root = home(".claude", "projects");
        List<TurnRecord> out = new ArrayList<>();
        for (Path f : recentJsonl(root, sinceMs)) {
            String sid = sid(f);
            forEachLine(f, node -> {
                if (!"assistant".equals(node.path("type").asText(""))) return;
                JsonNode u = node.path("message").path("usage");
                if (!u.isObject()) return;
                Long ts = parseTs(node);
                if (ts == null || ts < sinceMs) return;
                long in = u.path("input_tokens").asLong(0);
                long outp = u.path("output_tokens").asLong(0);
                long cr = u.path("cache_read_input_tokens").asLong(0);
                long cc = u.path("cache_creation_input_tokens").asLong(0);
                if (in == 0 && outp == 0 && cr == 0 && cc == 0) return;
                out.add(new TurnRecord(ts, in, outp, cr, cc, sid, true));
            });
        }
        return new ScanResult(out, null);
    }
}
