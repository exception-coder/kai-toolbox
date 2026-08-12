package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;

import java.util.ArrayList;
import java.util.List;

/**
 * 处理 PRD 澄清答案的归位与 JSON 合并，并隔离非可信模型输出的裁决规则。
 *
 * <p>会话查询、状态校验和持久化仍由 {@link PrdClarifyService} 编排。</p>
 */
@Slf4j
public class PrdAnswerProcessingService {

    private static final String DISTRIBUTE_ANSWER_SYSTEM = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            你的唯一工作是把用户写成一整段的回答，按题号拆分归位到对应的澄清问题上。

            【严格输出要求】
            直接输出 JSON 对象，不加任何说明、前言、结语或 Markdown 围栏（禁止 ```json，直接以 { 开头）。
            格式：{"answers": [{"index": 题号(从1开始的整数), "answer": "该题的答案原文"}], "leftover": "没能归到任何一题的内容"}

            归位规则（严格执行）：
            - 只做归类和摘录，禁止编造、补全、推断、润色。answer 必须来自用户原文（可做最小限度的
              裁剪和语序整理，使其能独立成句），不得加入原文没有的信息
            - 用户原文没有涉及的问题，直接不要出现在 answers 数组里（留空让用户自己补），
              严禁用"未提及""待确认"或你推断的合理答案去填
            - 一段话同时回答了多题时，拆开分别归位；多段话都在回答同一题时，合并成一条
            - 用户原文里显式写了题号/序号时，优先按他标的题号归位，不要自行改判
            - 与所有问题都无关、或属于额外补充说明的内容，原样放进 leftover（不要丢掉）；
              全部内容都已归位时 leftover 给空串
            """;

    private final AgentOneShotRunner agentRunner;
    private final ObjectMapper mapper;

    public PrdAnswerProcessingService(AgentOneShotRunner agentRunner, ObjectMapper mapper) {
        this.agentRunner = agentRunner;
        this.mapper = mapper;
    }

    /**
     * 把用户的一整段回答归位到当前澄清问题，返回与问题等长的答案数组。
     *
     * @param session   当前 PRD 会话
     * @param rawAnswer 用户回答原文
     * @param engine    已归一化的 Agent 引擎
     * @return 经服务端严格裁决后的归位结果
     */
    public DistributionResult distribute(PrdSession session, String rawAnswer, String engine) {
        List<String> questionTexts = parseQuestionTexts(session.getQuestions());
        if (questionTexts.isEmpty()) {
            throw new IllegalStateException("当前会话还没有澄清问题，无法分配回答");
        }

        StringBuilder userPrompt = new StringBuilder("【澄清问题清单】\n");
        for (int i = 0; i < questionTexts.size(); i++) {
            userPrompt.append(i + 1).append(". ").append(questionTexts.get(i)).append('\n');
        }
        userPrompt.append("\n【用户一次性写下的回答原文】\n").append(rawAnswer);

        String raw = agentRunner.runOnce(
                DISTRIBUTE_ANSWER_SYSTEM, userPrompt.toString(), session.getModel(), engine);
        JsonNode root;
        try {
            root = mapper.readTree(stripFence(raw == null ? "" : raw.trim()));
        } catch (Exception e) {
            log.warn("[prd-clarify] 一次性回答分配结果解析失败 sessionId={}: {}",
                    session.getId(), e.getMessage());
            throw new IllegalStateException("AI 整理结果解析失败，请改用逐题填写", e);
        }

        String[] slots = new String[questionTexts.size()];
        for (JsonNode item : root.path("answers")) {
            int number = item.path("index").asInt(0);
            if (number < 1 || number > slots.length) {
                log.debug("[prd-clarify] 丢弃越界题号 {}（共 {} 题）", number, slots.length);
                continue;
            }
            String answer = item.path("answer").asText("").trim();
            if (answer.isEmpty() || slots[number - 1] != null) {
                continue;
            }
            slots[number - 1] = answer;
        }

        List<String> answers = new ArrayList<>(slots.length);
        List<Integer> unmatchedNumbers = new ArrayList<>();
        int matchedCount = 0;
        for (int i = 0; i < slots.length; i++) {
            if (slots[i] == null) {
                answers.add("");
                unmatchedNumbers.add(i + 1);
            } else {
                answers.add(slots[i]);
                matchedCount++;
            }
        }
        log.info("[prd-clarify] 一次性回答分配 sessionId={} 命中 {}/{} 题",
                session.getId(), matchedCount, slots.length);
        return new DistributionResult(
                List.copyOf(answers), matchedCount, List.copyOf(unmatchedNumbers),
                root.path("leftover").asText("").trim());
    }

    /** 将用户答案按现有问题顺序合并回 questions JSON。 */
    public String mergeAnswers(String questionsJson, List<String> answers) {
        if (questionsJson == null || questionsJson.isBlank()) {
            return "[]";
        }
        try {
            JsonNode source = mapper.readTree(questionsJson);
            if (!source.isArray()) {
                return questionsJson;
            }
            ArrayNode result = mapper.createArrayNode();
            int index = 0;
            for (JsonNode node : source) {
                ObjectNode item = mapper.createObjectNode();
                item.put("id", node.path("id").asInt(index + 1));
                item.put("question", node.path("question").asText(""));
                item.put("answer", index < answers.size() ? answers.get(index) : "");
                result.add(item);
                index++;
            }
            return mapper.writeValueAsString(result);
        } catch (Exception e) {
            log.warn("[prd-clarify] 答案合并失败: {}", e.getMessage());
            return questionsJson;
        }
    }

    private List<String> parseQuestionTexts(String questionsJson) {
        if (questionsJson == null || questionsJson.isBlank()) {
            return List.of();
        }
        try {
            List<String> texts = new ArrayList<>();
            for (JsonNode node : mapper.readTree(questionsJson)) {
                texts.add(node.path("question").asText(""));
            }
            return texts;
        } catch (Exception e) {
            log.warn("[prd-clarify] questions JSON 解析失败: {}", e.getMessage());
            return List.of();
        }
    }

    private static String stripFence(String value) {
        if (value.startsWith("```")) {
            int start = value.indexOf('\n');
            int end = value.lastIndexOf("```");
            if (start > 0 && end > start) {
                return value.substring(start + 1, end).trim();
            }
        }
        return value;
    }

    /** 归位服务内部结果，由门面映射为既有 API 返回类型。 */
    public record DistributionResult(List<String> answers, int matchedCount,
                                     List<Integer> unmatchedNumbers, String leftover) {
    }
}
