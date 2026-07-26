package com.exceptioncoder.toolbox.eval.adapter;

import com.exceptioncoder.toolbox.eval.spi.EvalAdapter;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.Set;

/**
 * 场景 ②（EXTRACTION）适配器：把「咨询问答 → 结构化 BUG 记录」这条链路搬到后端，使其可重放。
 * <p>
 * 背景：fore-consult 后端不含回答引擎，抽取判断与提示词原本只存在于前端会话里，改一次 prompt
 * 就无法复现旧口径。本 adapter 是该链路的 headless 副本，也是后续 fore-consult 前端应当收敛到的单一事实源。
 * <p>
 * 确定性优先的落点在 {@link #normalize}：LLM 的输出一律当作不可信入参，枚举字段由代码用白名单裁决，
 * 越界值归一到兜底枚举而非原样透传——否则评测测的是「LLM 会不会瞎编枚举」，而不是它判得准不准。
 */
@Slf4j
@Component
public class BugExtractionAdapter implements EvalAdapter {

    public static final String ID = "bug-extraction";
    public static final String PROMPT_KEY = "bug-extraction";
    public static final String SCENARIO = "EXTRACTION";

    /** 与 fore-consult BugService 的白名单保持一致，改动需两处同步。 */
    private static final Set<String> TYPES = Set.of("FUNCTION_BUG", "DATA_ISSUE", "CONFIG", "PERMISSION", "OTHER");
    private static final Set<String> SEVERITIES = Set.of("LOW", "MEDIUM", "HIGH", "CRITICAL");

    private final ObjectProvider<AgentOneShotRunner> runnerProvider;
    private final ObjectMapper mapper;

    public BugExtractionAdapter(ObjectProvider<AgentOneShotRunner> runnerProvider, ObjectMapper mapper) {
        this.runnerProvider = runnerProvider;
        this.mapper = mapper;
    }

    @Override
    public String id() {
        return ID;
    }

    @Override
    public String scenario() {
        return SCENARIO;
    }

    @Override
    public String promptKey() {
        return PROMPT_KEY;
    }

    @Override
    public Output run(Input input) throws Exception {
        AgentOneShotRunner runner = runnerProvider.getIfAvailable();
        if (runner == null) {
            throw new IllegalStateException("AgentOneShotRunner 不可用（tool-claude-chat 未装载），无法执行抽取");
        }
        JsonNode payload = input.payload();
        String question = payload.path("question").asText("");
        String answer = payload.path("answer").asText("");
        if (question.isBlank() && answer.isBlank()) {
            throw new IllegalArgumentException("input_json 需要至少提供 question 或 answer");
        }

        String userPrompt = """
                【用户提问】
                %s

                【AI 回答】
                %s
                """.formatted(question, answer);

        long start = System.currentTimeMillis();
        String raw = runner.runOnce(input.prompt(), userPrompt, input.model());
        long latency = System.currentTimeMillis() - start;

        JsonNode parsed;
        try {
            parsed = mapper.readTree(stripFence(raw));
        } catch (Exception e) {
            // 解析失败不抛：raw 交给断言层判负，比吞成 ERROR 更能定位问题
            log.warn("bug-extraction 输出非 JSON, caseId={}", input.caseId());
            return new Output(null, raw, latency);
        }
        return new Output(normalize(parsed), raw, latency);
    }

    /**
     * LLM 提议、代码裁决：枚举白名单化、布尔强制化、字符串去空白。
     * 越界枚举归一到兜底值，而非原样透传。
     */
    private JsonNode normalize(JsonNode parsed) {
        ObjectNode out = mapper.createObjectNode();
        boolean isBug = parsed.path("isBug").asBoolean(false);
        out.put("isBug", isBug);
        if (!isBug) {
            // 判定非 BUG 时其余字段一律不产出，避免「不该抽的抽出来」被漏测
            return out;
        }
        out.put("type", whitelist(parsed.path("type").asText(null), TYPES, "OTHER"));
        out.put("severity", whitelist(parsed.path("severity").asText(null), SEVERITIES, "MEDIUM"));
        out.put("system", trimOrNull(parsed.path("system").asText(null)));
        out.put("module", trimOrNull(parsed.path("module").asText(null)));
        out.put("title", trimOrNull(parsed.path("title").asText(null)));
        return out;
    }

    private String whitelist(String raw, Set<String> allowed, String fallback) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        String upper = raw.trim().toUpperCase(Locale.ROOT);
        return allowed.contains(upper) ? upper : fallback;
    }

    private String trimOrNull(String raw) {
        if (raw == null) {
            return null;
        }
        String t = raw.trim();
        return t.isEmpty() ? null : t;
    }

    /** 去掉模型偶发套上的 Markdown 代码围栏。 */
    private String stripFence(String raw) {
        if (raw == null) {
            return "";
        }
        String s = raw.trim();
        if (s.startsWith("```")) {
            int firstBreak = s.indexOf('\n');
            if (firstBreak > 0) {
                s = s.substring(firstBreak + 1);
            }
            int lastFence = s.lastIndexOf("```");
            if (lastFence >= 0) {
                s = s.substring(0, lastFence);
            }
        }
        return s.trim();
    }
}
