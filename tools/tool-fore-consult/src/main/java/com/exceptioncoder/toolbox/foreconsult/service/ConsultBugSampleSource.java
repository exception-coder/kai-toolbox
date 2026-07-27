package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.eval.EvalSampleSource;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultBug;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultBugRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 强标注样本源：consult_bug 中人工点过「确认 / 驳回」的记录。
 *
 * <p>CONFIRMED 是正样本（确实是缺陷），REJECTED 是负样本（AI 报了但人工驳回，即误报）。
 * 负样本比正样本更值钱——全是正样本的数据集，模型无脑一律答 isBug=true 就能满分，测不出误报。
 *
 * <p>NEW 等未裁决状态一概不收：没人裁决过就没有标准答案，收进来等于拿 AI 自己的判断当答案。
 */
@Component
public class ConsultBugSampleSource implements EvalSampleSource {

    private static final Logger log = LoggerFactory.getLogger(ConsultBugSampleSource.class);
    private static final List<String> ADJUDICATED = List.of("CONFIRMED", "REJECTED");
    private static final int MAX = 2000;

    private final ConsultBugRepository bugRepo;
    private final ObjectMapper mapper = new ObjectMapper();

    public ConsultBugSampleSource(ConsultBugRepository bugRepo) {
        this.bugRepo = bugRepo;
    }

    @Override
    public String id() {
        return "fore-consult-bugs";
    }

    @Override
    public String displayName() {
        return "业务系统咨询 · 已裁决缺陷（人工标注）";
    }

    @Override
    public String scenario() {
        return "EXTRACTION";
    }

    @Override
    public List<Sample> collect() {
        List<Sample> samples = new ArrayList<>();
        for (ConsultBug b : bugRepo.findRecentByStatus(ADJUDICATED, MAX)) {
            String question = b.getQuestion() == null ? "" : b.getQuestion();
            String answer = b.getAnswer() == null ? "" : b.getAnswer();
            // 两者皆空喂给 adapter 只会变 ERROR，白占一条用例还污染统计
            if (question.isBlank() && answer.isBlank()) {
                continue;
            }
            boolean confirmed = "CONFIRMED".equals(b.getStatus());
            samples.add(new Sample(
                    "consult_bug:" + b.getBugId(),
                    truncate("[" + b.getStatus() + "] " + safe(b.getTitle()), 200),
                    input(question, answer),
                    confirmed ? expectedBug(b) : expectedNotBug(),
                    confirmed ? assertBug(b) : assertNotBug(),
                    tags(b.getStatus(), "human-label")));
        }
        log.debug("[fore-consult] 已裁决缺陷样本 {} 条", samples.size());
        return samples;
    }

    private String input(String question, String answer) {
        ObjectNode n = mapper.createObjectNode();
        n.put("question", question);
        // 注意用 consult_bug.answer（前端已剥离机器可读块）而非 consult_turn.answer——
        // 后者仍嵌着 AI 自己输出的 BUG 块，拿它当输入等于把答案抄给被测模型，评测会虚高到没意义
        n.put("answer", answer);
        return n.toString();
    }

    /**
     * 只写 adapter 归一化后会产出的字段；多写的字段推导不出断言，只是噪声。
     *
     * <p>刻意不写 {@code system}：它来自会话选定的工作区项目名（如 yoooni），是环境上下文而非抽取产物——
     * BugService 登记时也是从会话回填、忽略请求里的值。模型只看得到问答正文，
     * 让它去猜这个名字必然判负，那是用例的错不是模型的错。
     */
    private String expectedBug(ConsultBug b) {
        ObjectNode n = mapper.createObjectNode();
        n.put("isBug", true);
        n.put("type", b.getType());
        n.put("severity", b.getSeverity());
        n.put("module", b.getModule());
        n.put("title", b.getTitle());
        return n.toString();
    }

    /**
     * 显式断言而非交给默认推导，因为这些字段的可判定性差别很大：
     * <ul>
     *   <li>isBug / type —— 有明确枚举，严格相等。</li>
     *   <li>severity —— 分级本身带主观性，HIGH 与 MEDIUM 之争不该等同于判错类型，保留相等但降权。</li>
     *   <li>module —— 人工填的常是「crm(客诉)/qc(品控)/warehouse(仓库)」这类多模块串，
     *       要求模型逐字复现不现实，只断言给出了模块。</li>
     *   <li>title —— 自由文本，换个措辞不算退化。</li>
     * </ul>
     */
    private String assertBug(ConsultBug b) {
        ArrayNode arr = mapper.createArrayNode();
        arr.add(spec("EQUALS_IGNORE_CASE", "isBug", mapper.getNodeFactory().booleanNode(true), 1.0));
        arr.add(spec("EQUALS_IGNORE_CASE", "type", textOrNull(b.getType()), 1.0));
        arr.add(spec("EQUALS_IGNORE_CASE", "severity", textOrNull(b.getSeverity()), 0.5));
        arr.add(spec("NON_NULL", "module", null, 0.5));
        arr.add(spec("NON_NULL", "title", null, 0.5));
        return arr.toString();
    }

    /** 负样本：判定必须为 false，且其余字段一个都不许吐——「不该抽的抽出来」正是要抓的误报。 */
    private String assertNotBug() {
        ArrayNode arr = mapper.createArrayNode();
        arr.add(spec("EQUALS_IGNORE_CASE", "isBug", mapper.getNodeFactory().booleanNode(false), 1.0));
        for (String f : new String[]{"type", "severity", "module", "title"}) {
            arr.add(spec("ABSENT", f, null, 1.0));
        }
        return arr.toString();
    }

    /** expected 必须写进断言本身：断言层是拿 spec.expected 去比对的，不会回头读 expected_json。 */
    private ObjectNode spec(String type, String path, JsonNode expected, double weight) {
        ObjectNode n = mapper.createObjectNode();
        n.put("type", type);
        n.put("path", path);
        if (expected != null) {
            n.set("expected", expected);
        }
        n.put("weight", weight);
        return n;
    }

    private JsonNode textOrNull(String s) {
        return s == null || s.isBlank() ? null : mapper.getNodeFactory().textNode(s);
    }

    /**
     * 负样本显式把其余字段写成 null：断言层据此推导 ABSENT，
     * 用来抓「判定非缺陷却仍吐出字段」这类误报。只断言 isBug=false 是抓不到的。
     */
    private String expectedNotBug() {
        ObjectNode n = mapper.createObjectNode();
        n.put("isBug", false);
        for (String f : new String[]{"type", "severity", "system", "module", "title"}) {
            n.putNull(f);
        }
        return n.toString();
    }

    private String tags(String... values) {
        return mapper.createArrayNode().addAll(
                java.util.Arrays.stream(values).map(mapper.getNodeFactory()::textNode).toList()).toString();
    }

    private static String safe(String s) {
        return s == null ? "" : s;
    }

    private static String truncate(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }
}
