package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultPrompt;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.llm.spi.BugExtractionRunner;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Set;

/**
 * BUG 抽取的唯一实现：线上登记与回归评测共用这一条代码路径。
 *
 * <p>此前抽取活在前端会话里（回答里夹带 {@code <<<BUG_REPORT>>>} 块、前端正则解析后登记），
 * 评测侧另建 headless 副本，两份口径各改各的——评测通过并不能说明线上没退化。
 * 收敛到本类后，改 prompt 只有一处，评测重放的就是线上真实行为。
 *
 * <p>带外调用（out-of-band）：不再让回答模型顺带吐结构化块，而是拿「问 + 答」单独跑一次判定。
 * 代价是每轮多一次推理，换来的是回答正文干净、判定口径可版本化、可离线重放。
 *
 * <p>本类不自己起线程：{@link AgentOneShotRunner} 契约要求在虚拟线程中调用，
 * 由调用方保证（评测跑批与线上抽取钩子都已在虚拟线程上）。
 */
@Service
public class BugExtractionService implements BugExtractionRunner {

    /** 提示词 key，与 consult_prompt.prompt_key 对应。 */
    public static final String PROMPT_KEY = "bug-extraction";

    private static final Logger log = LoggerFactory.getLogger(BugExtractionService.class);

    // 与 BugService 的白名单保持一致：那边是 REST 入口的兜底，这里是 LLM 输出的入口净化，两道都要有。
    private static final Set<String> TYPES = Set.of("FUNCTION_BUG", "DATA_ISSUE", "CONFIG", "PERMISSION", "OTHER");
    private static final Set<String> SEVERITIES = Set.of("LOW", "MEDIUM", "HIGH", "CRITICAL");

    private final ObjectProvider<AgentOneShotRunner> runnerProvider;
    private final ConsultPromptService promptService;
    private final ObjectMapper mapper = new ObjectMapper();

    public BugExtractionService(ObjectProvider<AgentOneShotRunner> runnerProvider,
                                ConsultPromptService promptService) {
        this.runnerProvider = runnerProvider;
        this.promptService = promptService;
    }

    @Override
    public Result extract(String question, String answer, String model, Integer promptVersion) {
        AgentOneShotRunner runner = runnerProvider.getIfAvailable();
        if (runner == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "抽取引擎不可用（tool-claude-chat 未加载）");
        }
        String q = question == null ? "" : question;
        String a = answer == null ? "" : answer;
        if (q.isBlank() && a.isBlank()) {
            throw new IllegalArgumentException("question 与 answer 不能同时为空");
        }
        ConsultPrompt prompt = promptService.resolve(PROMPT_KEY, promptVersion).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                        "抽取提示词未初始化: " + PROMPT_KEY));

        String userPrompt = """
                【用户提问】
                %s

                【AI 回答】
                %s
                """.formatted(q, a);

        long start = System.currentTimeMillis();
        String raw = runner.runOnce(prompt.getContent(), userPrompt, model, "codex");
        long latency = System.currentTimeMillis() - start;

        if (raw == null || raw.isBlank()) {
            log.warn("[fore-consult] BUG 抽取引擎返回空结果，promptVersion={}", prompt.getVersion());
            return new Result(null, raw, prompt.getVersion(), latency);
        }

        JsonNode parsed;
        try {
            parsed = mapper.readTree(stripFence(raw == null ? "" : raw.trim()));
        } catch (Exception e) {
            // 解析失败不抛：交给调用方判负比吞成异常更能定位问题——
            // 抛异常会让「模型输出跑偏」和「链路挂了」在统计上混为一谈。
            log.warn("[fore-consult] BUG 抽取输出非 JSON，promptVersion={}", prompt.getVersion());
            return new Result(null, raw, prompt.getVersion(), latency);
        }
        return new Result(normalize(parsed), raw, prompt.getVersion(), latency);
    }

    @Override
    public List<PromptVersion> listPromptVersions() {
        return promptService.listVersions(PROMPT_KEY).stream()
                .map(p -> new PromptVersion(p.getVersion(), p.isActive(), p.getNote()))
                .toList();
    }

    /** LLM 提议、代码定夺：枚举走白名单，判定非缺陷时其余字段一律不产出。 */
    private Extracted normalize(JsonNode parsed) {
        boolean isBug = parsed.path("isBug").asBoolean(false);
        if (!isBug) {
            // 非缺陷却仍带出字段属于误报，全部清空，让「不该抽的抽出来」在断言层暴露得出来
            return new Extracted(false, null, null, null, null, null, null, null, null, null, null);
        }
        return new Extracted(
                true,
                whitelist(text(parsed, "type"), TYPES, "OTHER"),
                whitelist(text(parsed, "severity"), SEVERITIES, "MEDIUM"),
                text(parsed, "system"),
                text(parsed, "module"),
                text(parsed, "title"),
                text(parsed, "reproduce"),
                text(parsed, "expected"),
                text(parsed, "actual"),
                text(parsed, "suspectArea"),
                confidence(parsed));
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.path(field);
        if (v.isMissingNode() || v.isNull()) {
            return null;
        }
        String s = v.asText("").trim();
        return s.isEmpty() ? null : s;
    }

    /** 置信度钳制到 0~100；非数字或缺失返回 null，不臆造一个默认分数。 */
    private static Integer confidence(JsonNode node) {
        JsonNode v = node.path("confidence");
        if (!v.isNumber()) {
            return null;
        }
        return Math.min(Math.max(v.asInt(), 0), 100);
    }

    private static String whitelist(String raw, Set<String> allowed, String fallback) {
        if (raw == null) {
            return fallback;
        }
        String up = raw.trim().toUpperCase();
        return allowed.contains(up) ? up : fallback;
    }

    /** 去掉可能的 ```json ... ``` 围栏，尽量截出 JSON 主体。提示词已要求不要围栏，这里仍然防一手。 */
    private static String stripFence(String s) {
        String t = s;
        if (t.startsWith("```")) {
            int nl = t.indexOf('\n');
            if (nl >= 0) t = t.substring(nl + 1);
            if (t.endsWith("```")) t = t.substring(0, t.length() - 3);
        }
        int lb = t.indexOf('{');
        int rb = t.lastIndexOf('}');
        return (lb >= 0 && rb > lb) ? t.substring(lb, rb + 1) : t;
    }
}
