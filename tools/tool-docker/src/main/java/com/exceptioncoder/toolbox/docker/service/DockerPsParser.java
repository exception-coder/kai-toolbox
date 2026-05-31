package com.exceptioncoder.toolbox.docker.service;

import com.exceptioncoder.toolbox.docker.api.dto.ContainerStatsView;
import com.exceptioncoder.toolbox.docker.api.dto.ContainerView;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 解析 `docker ps --format '{{json .}}'` 与 `docker stats --no-stream --format '{{json .}}'` 多行输出。 */
@Component
public class DockerPsParser {

    private static final Logger log = LoggerFactory.getLogger(DockerPsParser.class);
    private static final ObjectMapper M = new ObjectMapper();

    /** 容器关联：composeProject → appId */
    public List<ContainerView> parsePs(String jsonLines, Map<String, String> appIdByComposeProject) {
        List<ContainerView> out = new ArrayList<>();
        if (jsonLines == null || jsonLines.isBlank()) return out;
        for (String line : jsonLines.split("\n")) {
            if (line.isBlank()) continue;
            try {
                JsonNode n = M.readTree(line);
                String id = text(n, "ID", "Id");
                String name = firstName(text(n, "Names", "Name"));
                String image = text(n, "Image");
                String status = text(n, "Status");
                String state = stateFromStatus(text(n, "State"), status);
                long created = parseLongSafe(text(n, "CreatedAt", "Created"));
                String ports = text(n, "Ports");
                String labelsRaw = text(n, "Labels");
                Map<String, String> labels = parseLabels(labelsRaw);
                String composeProject = labels.get("com.docker.compose.project");
                String composeService = labels.get("com.docker.compose.service");
                String appId = composeProject == null ? null : appIdByComposeProject.get(composeProject);
                out.add(new ContainerView(
                        id, shortId(id), name, image, state, status, created,
                        ports, composeProject, composeService, appId));
            } catch (Exception e) {
                log.debug("跳过无法解析的 docker ps 行：{}, err={}", line, e.getMessage());
            }
        }
        return out;
    }

    /** 解析 docker stats --no-stream */
    public List<ContainerStatsView> parseStats(String jsonLines) {
        List<ContainerStatsView> out = new ArrayList<>();
        if (jsonLines == null || jsonLines.isBlank()) return out;
        for (String line : jsonLines.split("\n")) {
            if (line.isBlank()) continue;
            try {
                JsonNode n = M.readTree(line);
                String id = text(n, "ID", "Id");
                String name = text(n, "Name", "Names");
                double cpu = parsePercent(text(n, "CPUPerc"));
                long[] mem = parseSizePair(text(n, "MemUsage"));
                double memPct = parsePercent(text(n, "MemPerc"));
                long[] net = parseSizePair(text(n, "NetIO"));
                long[] blk = parseSizePair(text(n, "BlockIO"));
                out.add(new ContainerStatsView(
                        id, name,
                        cpu,
                        mem[0], mem[1],
                        memPct,
                        net[0], net[1],
                        blk[0], blk[1]
                ));
            } catch (Exception e) {
                log.debug("跳过无法解析的 docker stats 行：{}, err={}", line, e.getMessage());
            }
        }
        return out;
    }

    /* ---------- internals ---------- */

    private static String text(JsonNode n, String... candidates) {
        for (String c : candidates) {
            JsonNode v = n.get(c);
            if (v != null && !v.isNull()) return v.asText();
        }
        return "";
    }

    private static String firstName(String namesField) {
        if (namesField == null) return "";
        int comma = namesField.indexOf(',');
        String first = comma > 0 ? namesField.substring(0, comma) : namesField;
        // 旧版 docker 列表里可能带前缀斜杠 /name
        return first.startsWith("/") ? first.substring(1) : first;
    }

    private static String shortId(String id) {
        if (id == null) return "";
        return id.length() <= 12 ? id : id.substring(0, 12);
    }

    private static long parseLongSafe(String s) {
        if (s == null || s.isBlank()) return 0L;
        try { return Long.parseLong(s.trim()); } catch (NumberFormatException ignored) { return 0L; }
    }

    private static String stateFromStatus(String state, String status) {
        if (state != null && !state.isBlank()) return state.toLowerCase();
        if (status == null) return "unknown";
        String s = status.toLowerCase();
        if (s.startsWith("up")) return "running";
        if (s.startsWith("exited")) return "exited";
        if (s.startsWith("paused")) return "paused";
        if (s.startsWith("restarting")) return "restarting";
        if (s.startsWith("created")) return "created";
        return s;
    }

    /** 把 "k=v,k2=v2" 形式 labels 解析为 map；某些版本是 JSON 对象。 */
    private static Map<String, String> parseLabels(String raw) {
        Map<String, String> map = new java.util.HashMap<>();
        if (raw == null || raw.isBlank()) return map;
        String trimmed = raw.trim();
        if (trimmed.startsWith("{")) {
            try {
                JsonNode n = M.readTree(trimmed);
                n.fields().forEachRemaining(e -> map.put(e.getKey(), e.getValue().asText()));
                return map;
            } catch (Exception ignored) { /* fall through */ }
        }
        for (String kv : trimmed.split(",")) {
            int eq = kv.indexOf('=');
            if (eq > 0) {
                map.put(kv.substring(0, eq).trim(), kv.substring(eq + 1).trim());
            }
        }
        return map;
    }

    private static double parsePercent(String s) {
        if (s == null) return 0.0;
        String x = s.trim();
        if (x.endsWith("%")) x = x.substring(0, x.length() - 1);
        try { return Double.parseDouble(x); } catch (NumberFormatException e) { return 0.0; }
    }

    /** "12.3MiB / 8GiB" 或 "1.2kB / 3.4MB" → [usage, limit] bytes */
    private static long[] parseSizePair(String s) {
        if (s == null) return new long[]{0L, 0L};
        String[] parts = s.split("/");
        long a = parts.length > 0 ? parseSize(parts[0].trim()) : 0L;
        long b = parts.length > 1 ? parseSize(parts[1].trim()) : 0L;
        return new long[]{a, b};
    }

    private static final Pattern SIZE_RE = Pattern.compile("^([0-9.]+)\\s*([a-zA-Z]+)?$");

    private static long parseSize(String s) {
        if (s == null || s.isBlank()) return 0L;
        Matcher m = SIZE_RE.matcher(s.trim());
        if (!m.matches()) return 0L;
        double num;
        try { num = Double.parseDouble(m.group(1)); } catch (NumberFormatException e) { return 0L; }
        String unit = m.group(2) == null ? "" : m.group(2).toLowerCase();
        double mul = switch (unit) {
            case "b" -> 1d;
            case "kb" -> 1_000d;
            case "kib" -> 1024d;
            case "mb" -> 1_000_000d;
            case "mib" -> 1024d * 1024d;
            case "gb" -> 1_000_000_000d;
            case "gib" -> 1024d * 1024d * 1024d;
            case "tb" -> 1_000_000_000_000d;
            case "tib" -> 1024d * 1024d * 1024d * 1024d;
            default -> 1d;
        };
        return (long) (num * mul);
    }
}
