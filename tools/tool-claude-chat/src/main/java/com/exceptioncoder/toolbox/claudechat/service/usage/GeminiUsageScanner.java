package com.exceptioncoder.toolbox.claudechat.service.usage;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Gemini：~/.gemini/tmp/*&#47;chats/*.jsonl 本地无 token 字段，仅按会话/消息计数。
 * 每条 chats 文件 = 一个会话，行数 = 消息数；时间用文件 mtime 归窗（行级无可靠时间戳）。
 */
@Component
class GeminiUsageScanner extends AbstractUsageScanner {

    GeminiUsageScanner(ObjectMapper mapper) {
        super(mapper);
    }

    @Override
    public String engine() {
        return "gemini";
    }

    @Override
    public ScanResult scan(long sinceMs) {
        Path root = home(".gemini", "tmp");
        List<TurnRecord> out = new ArrayList<>();
        for (Path f : recentJsonl(root, sinceMs)) {
            // 仅取 chats 目录下的会话文件，排除其它 jsonl
            if (!f.toString().replace('\\', '/').contains("/chats/")) continue;
            long ts = mtime(f);
            if (ts < sinceMs) continue;
            String sid = sid(f);
            int[] cnt = {0};
            forEachLine(f, node -> cnt[0]++);
            for (int i = 0; i < cnt[0]; i++) {
                out.add(new TurnRecord(ts, 0, 0, 0, 0, sid, false));
            }
        }
        return new ScanResult(out, null);
    }
}
