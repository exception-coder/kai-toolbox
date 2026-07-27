package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.eval.EvalSampleSource;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultBug;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultBugRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
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

    /** 只写 adapter 归一化后会产出的字段；多写的字段推导不出断言，只是噪声。 */
    private String expectedBug(ConsultBug b) {
        ObjectNode n = mapper.createObjectNode();
        n.put("isBug", true);
        n.put("type", b.getType());
        n.put("severity", b.getSeverity());
        n.put("system", b.getSystemName());
        n.put("module", b.getModule());
        // title 是自由文本，断言层会自动降级成 NON_NULL，不做相等判定，换个措辞不算退化
        n.put("title", b.getTitle());
        return n.toString();
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
