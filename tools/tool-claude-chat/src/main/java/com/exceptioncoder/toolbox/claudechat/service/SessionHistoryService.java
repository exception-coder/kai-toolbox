package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.exceptioncoder.toolbox.claudechat.api.dto.HistorySessionView;
import com.exceptioncoder.toolbox.claudechat.api.dto.SessionUsageView;
import com.exceptioncoder.toolbox.claudechat.repository.SessionAliasRepository;
import com.exceptioncoder.toolbox.claudechat.api.dto.MessagePage;
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
    private final SessionAliasRepository aliasRepo;

    public SessionHistoryService(ObjectMapper mapper, SessionAliasRepository aliasRepo) {
        this.mapper = mapper;
        this.aliasRepo = aliasRepo;
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
             .filter(d -> !"_trash".equals(d.getFileName().toString()))
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

        // 4) 解析标题/cwd，按 sdkSessionId 去重（首次=最新，保留）；有别名优先作标题
        Map<String, String> aliases = aliasRepo.findAll();
        Map<String, HistorySessionView> bySid = new LinkedHashMap<>();
        for (FileMeta fm : files) {
            if (bySid.size() >= limit) break;
            String sid = stripExt(fm.path().getFileName().toString());
            if (bySid.containsKey(sid)) continue;
            try {
                Parsed p = parse(fm.path());
                String title = aliases.getOrDefault(sid, p.title());
                bySid.put(sid, new HistorySessionView(sid, p.cwd(), title, fm.mtime(), p.messageCount()));
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

    // ===== 历史消息分页读取 =====

    /**
     * 读取某会话 transcript 的消息，按行游标向前分页。
     * before 为空取最近 limit 条；before=k 取 [max(0,k-limit), k)。
     * nextBefore = 本批最早条目的全局索引（>0 还有更早，0 到顶）。
     */
    public MessagePage readMessages(String cwd, String sdkSessionId, Integer before, int limit) {
        // 先按 Claude transcript（~/.claude/projects）定位；找不到再回退 Codex rollout（~/.codex/sessions）。
        // 两端 sessionId 命名空间不重叠（Codex 为 rollout 文件名尾部的 UUID），故无需引擎入参即可消歧。
        List<ChatMessageView> all;
        Path jsonl = findTranscript(cwd, sdkSessionId);
        try {
            if (jsonl != null) {
                all = parseAll(jsonl);
            } else {
                Path rollout = findCodexRollout(sdkSessionId);
                if (rollout == null) {
                    return new MessagePage(List.of(), null);
                }
                all = parseCodexRollout(rollout);
            }
        } catch (IOException e) {
            log.debug("[claude-chat] 解析历史消息失败 {}：{}", sdkSessionId, e.getMessage());
            return new MessagePage(List.of(), null);
        }
        int n = all.size();
        int end = (before == null) ? n : Math.max(0, Math.min(before, n));
        int start = Math.max(0, end - Math.max(1, limit));
        return new MessagePage(new ArrayList<>(all.subList(start, end)), start);
    }

    /** 定位 &lt;sid&gt;.jsonl：cwd 指定→匹配项目目录；cwd 空→跨所有目录按文件名找。 */
    private Path findTranscript(String cwd, String sid) {
        Path root = Path.of(System.getProperty("user.home"), ".claude", "projects");
        if (!Files.isDirectory(root) || sid == null || sid.isBlank()) {
            return null;
        }
        String target = (cwd == null || cwd.isBlank()) ? null : encode(cwd.trim());
        try (Stream<Path> dirs = Files.list(root)) {
            return dirs.filter(Files::isDirectory)
                    .filter(d -> !"_trash".equals(d.getFileName().toString()))
                    .filter(d -> target == null || matchesProject(d.getFileName().toString(), target))
                    .map(d -> d.resolve(sid + ".jsonl"))
                    .filter(Files::isRegularFile)
                    .findFirst()
                    .orElse(null);
        } catch (IOException e) {
            log.debug("[claude-chat] 定位 transcript 失败：{}", e.getMessage());
            return null;
        }
    }

    // ===== Codex rollout 历史读取 =====

    /**
     * 定位 Codex rollout：~/.codex/sessions/&lt;年&gt;/&lt;月&gt;/&lt;日&gt;/rollout-&lt;ISO&gt;-&lt;threadId&gt;.jsonl。
     * 文件名尾部的 UUID 即 Codex thread/session id（= 我们存的 sdkSessionId）。
     */
    private Path findCodexRollout(String sdkSessionId) {
        if (sdkSessionId == null || sdkSessionId.isBlank()) {
            return null;
        }
        Path root = Path.of(System.getProperty("user.home"), ".codex", "sessions");
        if (!Files.isDirectory(root)) {
            return null;
        }
        String suffix = "-" + sdkSessionId.trim() + ".jsonl";
        try (Stream<Path> s = Files.walk(root)) {
            return s.filter(Files::isRegularFile)
                    .filter(p -> {
                        String name = p.getFileName().toString();
                        return name.startsWith("rollout-") && name.endsWith(suffix);
                    })
                    .findFirst()
                    .orElse(null);
        } catch (IOException e) {
            log.debug("[claude-chat] 定位 Codex rollout 失败：{}", e.getMessage());
            return null;
        }
    }

    /**
     * 解析 Codex rollout 为有序消息项。事件协议与 Claude transcript 不同：
     *  - event_msg/user_message  → 真实用户文本（response_item 的 user message 含注入的 AGENTS.md，不取）；
     *  - event_msg/agent_message → 助手最终文本；
     *  - response_item/function_call(+function_call_output 按 call_id) → 工具调用与回填；
     *  - event_msg/token_count   → 本轮 token（last_token_usage 增量），按用户消息边界聚合成 result 项。
     */
    private List<ChatMessageView> parseCodexRollout(Path jsonl) throws IOException {
        List<ChatMessageView> out = new ArrayList<>();
        Map<String, Integer> callIdx = new LinkedHashMap<>(); // call_id -> out 下标
        TurnAcc acc = new TurnAcc();
        try (BufferedReader r = Files.newBufferedReader(jsonl, StandardCharsets.UTF_8)) {
            String line;
            while ((line = r.readLine()) != null) {
                if (line.isBlank()) continue;
                JsonNode node;
                try {
                    node = mapper.readTree(line);
                } catch (Exception ignore) {
                    continue; // 非法行跳过
                }
                JsonNode payload = node.path("payload");
                String pType = payload.path("type").asText("");
                Long ts = parseTs(node);
                switch (pType) {
                    case "user_message" -> {
                        String t = payload.path("message").asText("");
                        if (!t.isBlank()) {
                            // 真实用户消息 = 新一轮：先把上一轮 token 落成 result 项
                            flushTurn(out, acc);
                            acc.reset(ts);
                            out.add(ChatMessageView.user("h" + out.size(), t, ts));
                        }
                    }
                    case "agent_message" -> {
                        String t = payload.path("message").asText("");
                        if (!t.isBlank()) out.add(ChatMessageView.assistant("h" + out.size(), t, ts));
                    }
                    case "function_call" -> {
                        String name = payload.path("name").asText("");
                        String callId = payload.path("call_id").asText("");
                        Object input = parseCodexArgs(payload.path("arguments"));
                        if (!callId.isBlank()) callIdx.put(callId, out.size());
                        out.add(ChatMessageView.tool("h" + out.size(), name, input, null, null, ts));
                    }
                    case "function_call_output" -> {
                        String callId = payload.path("call_id").asText("");
                        String outText = stringifyCodexOutput(payload.path("output"));
                        Integer idx = callId.isBlank() ? null : callIdx.get(callId);
                        if (idx != null) {
                            ChatMessageView prev = out.get(idx);
                            out.set(idx, ChatMessageView.tool(prev.id(), prev.toolName(), prev.input(), outText, null, prev.ts()));
                        } else {
                            out.add(ChatMessageView.tool("h" + out.size(), "", null, outText, null, ts));
                        }
                    }
                    case "token_count" -> acc.accumulateCodex(payload.path("info").path("last_token_usage"), ts);
                    default -> { /* reasoning / web_search / session_meta / turn_context 等跳过 */ }
                }
            }
        }
        flushTurn(out, acc); // 末轮
        return out;
    }

    /** Codex function_call.arguments 是 JSON 字符串：解析成对象供前端结构化展示；解析失败回退原串。 */
    private Object parseCodexArgs(JsonNode arguments) {
        if (arguments == null || arguments.isNull()) return null;
        if (arguments.isTextual()) {
            String s = arguments.asText();
            try {
                return mapper.convertValue(mapper.readTree(s), Object.class);
            } catch (Exception e) {
                return s;
            }
        }
        return mapper.convertValue(arguments, Object.class);
    }

    /** function_call_output.output 可能是字符串或对象，统一压成文本。 */
    private String stringifyCodexOutput(JsonNode output) {
        if (output == null || output.isNull()) return "";
        if (output.isTextual()) return output.asText();
        return output.toString();
    }

    /** 删除历史会话：把 transcript 移到 ~/.claude/projects/_trash/&lt;来源目录&gt;/，可手动恢复；同时清别名。 */
    public void moveToTrash(String cwd, String sdkSessionId) {
        Path src = findTranscript(cwd, sdkSessionId);
        if (src != null) {
            try {
                String dirName = src.getParent().getFileName().toString();
                Path trashDir = Path.of(System.getProperty("user.home"), ".claude", "projects", "_trash", dirName);
                Files.createDirectories(trashDir);
                Path dst = trashDir.resolve(sdkSessionId + ".jsonl");
                if (Files.exists(dst)) {
                    dst = trashDir.resolve(sdkSessionId + "-" + System.currentTimeMillis() + ".jsonl");
                }
                Files.move(src, dst);
                log.info("[claude-chat] 历史会话移入回收：{} -> {}", src, dst);
            } catch (IOException e) {
                log.warn("[claude-chat] 移入回收失败 {}：{}", sdkSessionId, e.getMessage());
            }
        }
        aliasRepo.delete(sdkSessionId);
    }

    /**
     * 顺序解析整份 transcript 为有序消息项；tool_result 按 tool_use_id 回填到 tool 项。
     * 同时按「真实用户消息=一轮」聚合该轮 assistant 的 message.usage（token），并用首/末时间戳推导耗时，
     * 在轮边界落成合成 result 项——让历史也能显示每轮 token 消耗 + 耗时（刷新后仍在，数据源自 transcript）。
     */
    private List<ChatMessageView> parseAll(Path jsonl) throws IOException {
        List<ChatMessageView> out = new ArrayList<>();
        Map<String, Integer> toolIdx = new LinkedHashMap<>(); // tool_use_id -> out 下标
        TurnAcc acc = new TurnAcc();
        try (BufferedReader r = Files.newBufferedReader(jsonl, StandardCharsets.UTF_8)) {
            String line;
            while ((line = r.readLine()) != null) {
                if (line.isBlank()) continue;
                JsonNode node;
                try {
                    node = mapper.readTree(line);
                } catch (Exception ignore) {
                    continue; // 非法行跳过
                }
                String type = node.path("type").asText("");
                JsonNode content = node.path("message").path("content");
                Long ts = parseTs(node);
                switch (type) {
                    case "user" -> {
                        // 真实用户消息（含 text）= 新一轮开始：先把上一轮用量落成 result 项
                        if (isUserText(content)) {
                            flushTurn(out, acc);
                            acc.reset(ts);
                        }
                        appendUser(out, toolIdx, content, ts);
                    }
                    case "assistant" -> {
                        acc.accumulate(node.path("message").path("usage"), ts);
                        appendAssistant(out, toolIdx, content, ts);
                    }
                    case "result" -> out.add(ChatMessageView.result(
                            "h" + out.size(), node.path("subtype").asText("end_turn"), ts, null, null));
                    default -> { /* system/meta 等跳过 */ }
                }
            }
        }
        flushTurn(out, acc); // 末轮
        return out;
    }

    /**
     * 按会话 id 统计整会话累计用量：读 transcript，把所有 assistant 的 message.usage 求和，
     * 按真实用户消息边界数有输出的轮次。不依赖前端分页/加载量，给整会话准确总和。
     */
    /** 跨多段 transcript 求和：多 agent 会话每个引擎一段，逐段累加得整会话总和。 */
    public SessionUsageView usageTotal(String cwd, List<String> sdkSessionIds) {
        long input = 0, output = 0, cacheRead = 0, cacheCreate = 0;
        int turns = 0;
        for (String sid : sdkSessionIds) {
            if (sid == null || sid.isBlank()) continue;
            SessionUsageView one = usageTotal(cwd, sid);
            input += one.inputTokens();
            output += one.outputTokens();
            cacheRead += one.cacheReadTokens();
            cacheCreate += one.cacheCreateTokens();
            turns += one.turns();
        }
        return new SessionUsageView(input, output, cacheRead, cacheCreate,
                input + output + cacheRead + cacheCreate, turns);
    }

    public SessionUsageView usageTotal(String cwd, String sdkSessionId) {
        Path jsonl = findTranscript(cwd, sdkSessionId);
        if (jsonl == null || !Files.isReadable(jsonl)) {
            // Claude transcript 不存在：回退 Codex rollout（口径不同，单独统计）
            Path rollout = findCodexRollout(sdkSessionId);
            return rollout != null ? codexUsageTotal(rollout) : SessionUsageView.empty();
        }
        long input = 0, output = 0, cacheRead = 0, cacheCreate = 0;
        int turns = 0;
        boolean started = false, turnHasOutput = false;
        try (BufferedReader r = Files.newBufferedReader(jsonl, StandardCharsets.UTF_8)) {
            String line;
            while ((line = r.readLine()) != null) {
                if (line.isBlank()) continue;
                JsonNode node;
                try {
                    node = mapper.readTree(line);
                } catch (Exception ignore) {
                    continue;
                }
                String type = node.path("type").asText("");
                if ("user".equals(type) && isUserText(node.path("message").path("content"))) {
                    if (started && turnHasOutput) turns++;
                    started = true;
                    turnHasOutput = false;
                } else if ("assistant".equals(type)) {
                    JsonNode u = node.path("message").path("usage");
                    if (u.isObject()) {
                        input += u.path("input_tokens").asLong(0);
                        output += u.path("output_tokens").asLong(0);
                        cacheRead += u.path("cache_read_input_tokens").asLong(0);
                        cacheCreate += u.path("cache_creation_input_tokens").asLong(0);
                        turnHasOutput = true;
                    }
                }
            }
        } catch (IOException e) {
            log.debug("[claude-chat] 统计会话用量失败 {}: {}", sdkSessionId, e.getMessage());
            return SessionUsageView.empty();
        }
        if (started && turnHasOutput) turns++; // 末轮
        long total = input + output + cacheRead + cacheCreate;
        return new SessionUsageView(input, output, cacheRead, cacheCreate, total, turns);
    }

    /**
     * Codex rollout 整会话用量：token_count.info.total_token_usage 为会话累计快照，取最后一条即总和；
     * turns 数真实用户消息（event_msg/user_message）条数。
     */
    private SessionUsageView codexUsageTotal(Path rollout) {
        long input = 0, output = 0, cacheRead = 0;
        int turns = 0;
        try (BufferedReader r = Files.newBufferedReader(rollout, StandardCharsets.UTF_8)) {
            String line;
            while ((line = r.readLine()) != null) {
                if (line.isBlank()) continue;
                JsonNode node;
                try {
                    node = mapper.readTree(line);
                } catch (Exception ignore) {
                    continue;
                }
                JsonNode payload = node.path("payload");
                String pType = payload.path("type").asText("");
                if ("user_message".equals(pType)) {
                    if (!payload.path("message").asText("").isBlank()) turns++;
                } else if ("token_count".equals(pType)) {
                    JsonNode u = payload.path("info").path("total_token_usage");
                    if (u.isObject()) {
                        long inAll = u.path("input_tokens").asLong(0);
                        long cached = u.path("cached_input_tokens").asLong(0);
                        input = Math.max(0, inAll - cached);
                        cacheRead = cached;
                        output = u.path("output_tokens").asLong(0) + u.path("reasoning_output_tokens").asLong(0);
                    }
                }
            }
        } catch (IOException e) {
            log.debug("[claude-chat] 统计 Codex 会话用量失败 {}: {}", rollout, e.getMessage());
            return SessionUsageView.empty();
        }
        long total = input + output + cacheRead;
        return new SessionUsageView(input, output, cacheRead, 0, total, turns);
    }

    /** content 是否含真实用户文本（区别于 tool_result——后者是 user 类型但属同轮，不另起一轮）。 */
    private boolean isUserText(JsonNode content) {
        if (content.isTextual()) return !content.asText().isBlank();
        if (content.isArray()) {
            for (JsonNode b : content) {
                if ("text".equals(b.path("type").asText(""))) return true;
            }
        }
        return false;
    }

    /** 把累计的一轮用量落成合成 result 项（token 聚合 + 时间戳推导耗时）；无 assistant 输出则跳过。 */
    private void flushTurn(List<ChatMessageView> out, TurnAcc acc) {
        if (!acc.hasOutput) return;
        Map<String, Object> usage = new LinkedHashMap<>();
        usage.put("input_tokens", acc.input);
        usage.put("output_tokens", acc.output);
        usage.put("cache_read_input_tokens", acc.cacheRead);
        usage.put("cache_creation_input_tokens", acc.cacheCreate);
        Long latency = (acc.startTs != null && acc.lastTs != null && acc.lastTs >= acc.startTs)
                ? acc.lastTs - acc.startTs : null;
        out.add(ChatMessageView.result("h" + out.size(), "end_turn", acc.lastTs, usage, latency));
        acc.hasOutput = false; // 防重复落
    }

    /** 单轮 token/时间累加器。 */
    private static final class TurnAcc {
        Long startTs;
        Long lastTs;
        long input;
        long output;
        long cacheRead;
        long cacheCreate;
        boolean hasOutput;

        void reset(Long start) {
            startTs = start;
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
            if (ts != null) lastTs = ts;
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
            if (ts != null) lastTs = ts;
            hasOutput = true;
        }
    }

    private void appendUser(List<ChatMessageView> out, Map<String, Integer> toolIdx, JsonNode content, Long ts) {
        if (content.isTextual()) {
            String t = content.asText();
            if (!t.isBlank()) out.add(ChatMessageView.user("h" + out.size(), t, ts));
            return;
        }
        if (!content.isArray()) return;
        for (JsonNode b : content) {
            String bt = b.path("type").asText("");
            if ("text".equals(bt)) {
                String t = b.path("text").asText("");
                if (!t.isBlank()) out.add(ChatMessageView.user("h" + out.size(), t, ts));
            } else if ("tool_result".equals(bt)) {
                String useId = b.path("tool_use_id").asText("");
                String outText = stringifyToolContent(b.path("content"));
                boolean err = b.path("is_error").asBoolean(false);
                Integer idx = toolIdx.get(useId);
                if (idx != null) {
                    ChatMessageView prev = out.get(idx);
                    out.set(idx, ChatMessageView.tool(prev.id(), prev.toolName(), prev.input(), outText, err, prev.ts()));
                } else {
                    out.add(ChatMessageView.tool("h" + out.size(), "", null, outText, err, ts));
                }
            }
        }
    }

    private void appendAssistant(List<ChatMessageView> out, Map<String, Integer> toolIdx, JsonNode content, Long ts) {
        if (content.isTextual()) {
            String t = content.asText();
            if (!t.isBlank()) out.add(ChatMessageView.assistant("h" + out.size(), t, ts));
            return;
        }
        if (!content.isArray()) return;
        for (JsonNode b : content) {
            String bt = b.path("type").asText("");
            if ("text".equals(bt)) {
                String t = b.path("text").asText("");
                if (!t.isBlank()) out.add(ChatMessageView.assistant("h" + out.size(), t, ts));
            } else if ("tool_use".equals(bt)) {
                String useId = b.path("id").asText("");
                Object input = b.has("input") ? mapper.convertValue(b.get("input"), Object.class) : null;
                toolIdx.put(useId, out.size());
                out.add(ChatMessageView.tool("h" + out.size(), b.path("name").asText(""), input, null, null, ts));
            }
        }
    }

    /** 解析行级 timestamp（ISO-8601）为 epoch ms；缺失/非法返回 null。 */
    private Long parseTs(JsonNode node) {
        JsonNode t = node.path("timestamp");
        if (!t.isTextual()) return null;
        try {
            return java.time.Instant.parse(t.asText()).toEpochMilli();
        } catch (Exception e) {
            return null;
        }
    }

    /** tool_result 的 content（string 或 block 数组）压成纯文本。 */
    private String stringifyToolContent(JsonNode content) {
        if (content == null || content.isNull()) return "";
        if (content.isTextual()) return content.asText();
        if (content.isArray()) {
            StringBuilder sb = new StringBuilder();
            for (JsonNode b : content) {
                if (sb.length() > 0) sb.append('\n');
                sb.append(b.isTextual() ? b.asText() : b.path("text").asText(""));
            }
            return sb.toString();
        }
        return content.toString();
    }
}
