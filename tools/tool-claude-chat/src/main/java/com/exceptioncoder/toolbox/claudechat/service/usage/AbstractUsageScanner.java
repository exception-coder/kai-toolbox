package com.exceptioncoder.toolbox.claudechat.service.usage;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.stream.Stream;

/** 本地 jsonl 用量扫描公共逻辑：mtime 过滤、逐行解析、时间戳解析。只读，失败静默跳过。 */
abstract class AbstractUsageScanner implements EngineUsageScanner {

    protected final ObjectMapper mapper;

    protected AbstractUsageScanner(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    protected Path home(String... seg) {
        Path p = Path.of(System.getProperty("user.home"));
        for (String s : seg) p = p.resolve(s);
        return p;
    }

    /** 递归取 root 下 mtime ≥ sinceMs 的 *.jsonl。目录不存在/异常 → 空。 */
    protected List<Path> recentJsonl(Path root, long sinceMs) {
        if (!Files.isDirectory(root)) return List.of();
        try (Stream<Path> s = Files.walk(root)) {
            List<Path> out = new ArrayList<>();
            s.filter(Files::isRegularFile)
                    .filter(p -> p.getFileName().toString().endsWith(".jsonl"))
                    .filter(p -> mtime(p) >= sinceMs)
                    .forEach(out::add);
            return out;
        } catch (IOException e) {
            return List.of();
        }
    }

    protected long mtime(Path p) {
        try {
            return Files.getLastModifiedTime(p).toMillis();
        } catch (IOException e) {
            return 0L;
        }
    }

    /** 逐行解析为 JsonNode 喂给 fn；非法行跳过；读文件失败跳过整文件。 */
    protected void forEachLine(Path p, Consumer<JsonNode> fn) {
        try (BufferedReader r = Files.newBufferedReader(p, StandardCharsets.UTF_8)) {
            String line;
            while ((line = r.readLine()) != null) {
                if (line.isBlank()) continue;
                JsonNode n;
                try {
                    n = mapper.readTree(line);
                } catch (Exception ignore) {
                    continue;
                }
                fn.accept(n);
            }
        } catch (IOException ignore) {
            // 跳过该文件
        }
    }

    /** 行级 timestamp（ISO-8601）→ epoch ms；缺失/非法 → null。 */
    protected Long parseTs(JsonNode node) {
        JsonNode t = node.path("timestamp");
        if (!t.isTextual()) return null;
        try {
            return Instant.parse(t.asText()).toEpochMilli();
        } catch (Exception e) {
            return null;
        }
    }

    /** 文件名去扩展名作 sessionId。 */
    protected String sid(Path p) {
        String n = p.getFileName().toString();
        int i = n.lastIndexOf('.');
        return i > 0 ? n.substring(0, i) : n;
    }
}
