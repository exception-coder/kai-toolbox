package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.eval.EvalSampleSource;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultTurn;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTurnRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * 弱标注负样本源：AI 看过但没报缺陷的咨询轮次。
 *
 * <p>为什么需要：consult_bug 里只有「AI 报了缺陷」的轮次，正样本天然占多数，
 * 而绝大多数真实咨询根本不是缺陷。缺了这批 true negative，数据集就测不出误报率。
 *
 * <p>标注强度低于 {@link ConsultBugSampleSource}，故意拆成两个来源而不是混在一起：
 * 这里的「非缺陷」依据是「AI 当时没报」，本质仍是模型自己的判断，属于自证。
 * 它能衡量的是**口径漂移**（以前不报的现在报了 = 误报变多），衡量不了绝对正确性。
 * 纳入前建议抽查几条，确认没有「其实是缺陷但 AI 漏报」的混进来。
 *
 * <p>只收回答里不含机器可读块的轮次：含块的轮次一是已由 consult_bug 覆盖，
 * 二是其 consult_turn.answer 未被剥离，带着块喂给被测模型等于泄题。
 */
@Component
public class ConsultTurnSampleSource implements EvalSampleSource {

    /** 前端老路径里 AI 判定缺陷时输出的机器可读块起始标记。 */
    private static final String BUG_MARKER = "<<<BUG_REPORT>>>";
    private static final int MAX = 2000;
    /** 太短的回答多半是打断/报错残留，不足以支撑判定。 */
    private static final int MIN_ANSWER_LEN = 20;
    /** 与 adapter 归一化后的输出字段对齐；不含 system——那是会话环境上下文，非抽取产物。 */
    private static final String[] FIELDS = {"type", "severity", "module", "title"};

    private final ConsultTurnRepository turnRepo;
    private final ObjectMapper mapper = new ObjectMapper();

    public ConsultTurnSampleSource(ConsultTurnRepository turnRepo) {
        this.turnRepo = turnRepo;
    }

    @Override
    public String id() {
        return "fore-consult-turns";
    }

    @Override
    public String displayName() {
        return "业务系统咨询 · 未报缺陷的轮次（弱标注负样本）";
    }

    @Override
    public String scenario() {
        return "EXTRACTION";
    }

    @Override
    public List<Sample> collect() {
        List<Sample> samples = new ArrayList<>();
        for (ConsultTurn t : turnRepo.findAllAnswered(MAX)) {
            String answer = t.getAnswer() == null ? "" : t.getAnswer();
            if (answer.contains(BUG_MARKER) || answer.strip().length() < MIN_ANSWER_LEN) {
                continue;
            }
            String question = t.getQuestion() == null ? "" : t.getQuestion();
            if (question.isBlank()) {
                continue;
            }
            // sourceRef 用 (session, turnIndex)：consult_turn 每次同步都整表重写、turn_id 是新 UUID，
            // 拿 turn_id 做溯源键会导致每同步一次就重复回捞一条
            samples.add(new Sample(
                    "consult_turn:" + t.getSessionId() + "#" + t.getTurnIndex(),
                    truncate("[未报缺陷] " + question.strip().replaceAll("\\s+", " "), 200),
                    input(question, answer),
                    expectedNotBug(),
                    assertNotBug(),
                    tags("harvested", "NOT_REPORTED", "weak-label")));
        }
        return samples;
    }

    private String input(String question, String answer) {
        ObjectNode n = mapper.createObjectNode();
        n.put("question", question);
        n.put("answer", answer);
        return n.toString();
    }

    private String expectedNotBug() {
        ObjectNode n = mapper.createObjectNode();
        n.put("isBug", false);
        for (String f : FIELDS) {
            n.putNull(f);
        }
        return n.toString();
    }

    /** 判定必须为 false，且一个字段都不许吐——「不该抽的抽出来」正是负样本要抓的误报。 */
    private String assertNotBug() {
        ArrayNode arr = mapper.createArrayNode();
        ObjectNode isBug = mapper.createObjectNode();
        isBug.put("type", "EQUALS_IGNORE_CASE");
        isBug.put("path", "isBug");
        isBug.set("expected", mapper.getNodeFactory().booleanNode(false));
        isBug.put("weight", 1.0);
        arr.add(isBug);
        for (String f : FIELDS) {
            ObjectNode n = mapper.createObjectNode();
            n.put("type", "ABSENT");
            n.put("path", f);
            n.put("weight", 1.0);
            arr.add(n);
        }
        return arr.toString();
    }

    private String tags(String... values) {
        return mapper.createArrayNode().addAll(
                Arrays.stream(values).map(mapper.getNodeFactory()::textNode).toList()).toString();
    }

    private static String truncate(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }
}
