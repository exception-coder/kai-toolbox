package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.HistorySessionView;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

/**
 * 磁盘历史会话扫描：复刻插件「历史会话」选择器。
 *
 * Claude Code 把每个会话的 transcript 落在 ~/.claude/projects/&lt;编码cwd&gt;/&lt;sessionId&gt;.jsonl。
 * cwd 编码规则：非字母数字字符全替换为 '-'（D:\Users\zhang\IdeaProjects → D--Users-zhang-IdeaProjects）。
 *
 * Windows 下 D: 与 d: 会编码成不同目录名，导致 Claude Code 自带 /resume 漏列；
 * 本服务对项目目录名做大小写不敏感匹配并合并所有变体（含 _backup_…_cwdfix）。
 */
@Slf4j
@Service
public class SessionHistoryService {

    /** 标题扫描的最大行数，超过仍未命中首条 user 文本就放弃 */
    private static final int TITLE_SCAN_LINES = 500;
    private static final int TITLE_MAX_CHARS = 60;

    private final ObjectMapper mapper;

    public SessionHistoryService(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    /** 留空 cwd 时跨所有项目目录列出的最近会话上限（控制解析量） */
    private static final int ALL_LIMIT = 60;
    /** 指定 cwd 时单项目目录的会话上限 */
    private static final int DIR_LIMIT = 200;

    /**
     * 列出历史会话。
     * cwd 留空 → 跨 ~/.claude/projects 所有项目目录列最近会话（每条带各自真实 cwd）；
     * cwd 指定 → 仅该目录（大小写不敏感合并变体）。
     */
    public List<HistorySessionView> list(String cwd) {
        Path root = Path.of(System.getProperty("user.home"), ".claude", "projects");
        if (!Files.isDirectory(root)) {
            return List.of();
        }
        boolean all = (cwd == null || cwd.isBlank());
        String target = all ? null : encode(cwd.trim());
        int limit = all ? ALL_LIMIT : DIR_LIMIT;

        // 1) 选目录：全部 or 匹配目标
        List<Path> dirs = new ArrayList<>();
        try (Stream<Path> s = Files.list(root)) {
            s.filter(Files::isDirectory)
             .filter(d -> all || matchesProject(d.getFileName().toString(), target))
             .forEach(dirs::add);
        } catch (IOException e) {
            log.warn("[claude-chat] 扫描历史会话失败：{}", e.getMessage());
            return List.of();
        }

        // 2) 汇总所有 *.jsonl + mtime（不解析，仅取文件时间，廉价）
        List<FileMeta> files = new ArrayList<>();
        for (Path dir : dirs) {
            try (Stream<Path> s = Files.list(dir)) {
                s.filter(p -> p.getFileName().toString().endsWith(".jsonl"))
                 .forEach(p -> {
                     try {
                         files.add(new FileMeta(p, Files.getLastModifiedTime(p).toMillis()));
                     } catch (IOException ignore) {
                     }
                 });
            } catch (IOException ignore) {
            }
        }

        // 3) 按 mtime 倒序，只解析前 limit 个，控制开销
        files.sort(Comparator.comparingLong(FileMeta::mtime).reversed());

        // 4) 解析标题/cwd，按 sdkSessionId 去重（首次=最新，保留）
        Map<String, HistorySessionView> bySid = new LinkedHashMap<>();
        for (FileMeta fm : files) {
            if (bySid.size() >= limit) break;
            String sid = stripExt(fm.path().getFileName().toString());
            if (bySid.containsKey(sid)) continue;
            try {
                Parsed p = parse(fm.path());
                bySid.put(sid, new HistorySessionView(sid, p.cwd(), p.title(), fm.mtime(), p.messageCount()));
            } catch (IOException e) {
                log.debug("[claude-chat] 读取 {} 失败：{}", fm.path(), e.getMessage());
            }
        }
        return new ArrayList<>(bySid.values());
    }

    private record FileMeta(Path path, long mtime) {}

    /** 非字母数字字符全替换为 '-'，与 Claude Code 的项目目录命名一致。 */
    public String encode(String cwd) {
        return cwd.replaceAll("[^a-zA-Z0-9]", "-");
    }

    /** 大小写不敏感匹配，并接受 _backup_<target>_cwdfix 这类备份变体。 */
    private boolean matchesProject(String dirName, String target) {
        String n = dirName;
        if (n.startsWith("_backup_")) n = n.substring("_backup_".length());
        if (n.endsWith("_cwdfix")) n = n.substring(0, n.length() - "_cwdfix".length());
        return n.equalsIgnoreCase(target);
    }

    private record Parsed(String title, String cwd, int messageCount) {}

    /** 单次顺序读：命中首条 user 文本作标题后停止 JSON 解析，剩余行只计数。 */
    private Parsed parse(Path jsonl) throws IOException {
        String title = null;
        String cwd = null;
        int lines = 0;
        try (BufferedReader r = Files.newBufferedReader(jsonl, StandardCharsets.UTF_8)) {
            String line;
            while ((line = r.readLine()) != null) {
                lines++;
                if (title != null) continue; // 标题已得，后续只计数
                if (lines > TITLE_SCAN_LINES) continue;
                if (!line.contains("\"user\"")) continue;
                try {
                    JsonNode node = mapper.readTree(line);
                    if (cwd == null && node.hasNonNull("cwd")) {
                        cwd = node.get("cwd").asText();
                    }
                    if (!"user".equals(node.path("type").asText())) continue;
                    String text = extractText(node.path("message").path("content"));
                    if (text != null && !text.isBlank()) {
                        title = truncate(text.strip());
                    }
                } catch (Exception ignore) {
                    // 非法行跳过
                }
            }
        }
        return new Parsed(title == null ? "（无标题）" : title, cwd, lines);
    }

    private String extractText(JsonNode content) {
        if (content.isTextual()) {
            return content.asText();
        }
        if (content.isArray()) {
            for (JsonNode block : content) {
                if ("text".equals(block.path("type").asText())) {
                    return block.path("text").asText();
                }
            }
        }
        return null;
    }

    private static String truncate(String s) {
        return s.length() > TITLE_MAX_CHARS ? s.substring(0, TITLE_MAX_CHARS) + "…" : s;
    }

    private static String stripExt(String name) {
        int i = name.lastIndexOf('.');
        return i > 0 ? name.substring(0, i) : name;
    }
}
