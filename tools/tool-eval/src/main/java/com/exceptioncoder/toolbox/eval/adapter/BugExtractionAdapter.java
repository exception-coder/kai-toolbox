package com.exceptioncoder.toolbox.eval.adapter;

import com.exceptioncoder.toolbox.eval.spi.EvalAdapter;
import com.exceptioncoder.toolbox.llm.spi.BugExtractionRunner;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 场景 ②（EXTRACTION）适配器：把 fore-consult 的「咨询问答 → 结构化 BUG 记录」链路接进评测。
 * <p>
 * 本类曾经是该链路的 headless 副本，自带一份 prompt 与归一化逻辑。副本的问题是会漂移——
 * 线上口径改了而副本没跟上时，评测依旧全绿，退化照样漏，评测反而变成安慰剂。
 * 现已收敛：调用被测系统自己的 {@link BugExtractionRunner} 实现，提示词也取它托管的版本，
 * 评测跑的就是线上那条路径。
 * <p>
 * 因此本类只剩两件事：把用例入参喂进去，把结果整形成断言层要的 JsonNode。
 * 一旦这里再出现任何判定逻辑或 prompt 文本，就说明副本又长回来了。
 */
@Slf4j
@Component
public class BugExtractionAdapter implements EvalAdapter {

    public static final String ID = "bug-extraction";
    /** 仅用于写进 eval_run.prompt_key 做展示与溯源；提示词内容存在 fore-consult 侧。 */
    public static final String PROMPT_KEY = "bug-extraction";
    public static final String SCENARIO = "EXTRACTION";

    private final ObjectProvider<BugExtractionRunner> runnerProvider;
    private final ObjectMapper mapper;

    public BugExtractionAdapter(ObjectProvider<BugExtractionRunner> runnerProvider, ObjectMapper mapper) {
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
    public Integer pinExternalPromptVersion(Integer requested) {
        List<BugExtractionRunner.PromptVersion> versions = requireRunner().listPromptVersions();
        if (versions.isEmpty()) {
            throw new IllegalStateException("fore-consult 侧尚无 " + PROMPT_KEY + " 提示词版本");
        }
        if (requested != null) {
            boolean exists = versions.stream().anyMatch(v -> v.version() == requested);
            if (!exists) {
                throw new IllegalArgumentException("提示词版本不存在: " + PROMPT_KEY + " v" + requested);
            }
            return requested;
        }
        return versions.stream().filter(BugExtractionRunner.PromptVersion::active).findFirst()
                .map(BugExtractionRunner.PromptVersion::version)
                .orElseThrow(() -> new IllegalStateException("fore-consult 侧无生效的 " + PROMPT_KEY + " 提示词"));
    }

    @Override
    public Output run(Input input) {
        BugExtractionRunner runner = requireRunner();
        String question = input.payload().path("question").asText("");
        String answer = input.payload().path("answer").asText("");
        if (question.isBlank() && answer.isBlank()) {
            throw new IllegalArgumentException("input_json 需要至少提供 question 或 answer");
        }

        BugExtractionRunner.Result result =
                runner.extract(question, answer, input.model(), input.promptVersion());

        if (result.extracted() == null) {
            // 解析失败不抛异常：交断言层判负能看清是哪条用例的输出跑偏，
            // 吞成 ERROR 会和「引擎挂了」混在一起，统计上分不出质量问题还是链路问题。
            log.warn("bug-extraction 输出无法解析, caseId={}", input.caseId());
            return new Output(null, result.raw(), result.latencyMs());
        }
        return new Output(toJson(result.extracted()), result.raw(), result.latencyMs());
    }

    private BugExtractionRunner requireRunner() {
        BugExtractionRunner runner = runnerProvider.getIfAvailable();
        if (runner == null) {
            throw new IllegalStateException("BugExtractionRunner 不可用（tool-fore-consult 未装载），无法执行抽取");
        }
        return runner;
    }

    /**
     * 判定非 BUG 时只输出 isBug，其余字段一律缺席。
     * 这不是省事：断言层据此推导 ABSENT，「不该抽的却抽出来了」正是靠字段在不在判出来的，
     * 补一堆 null 上去会让这类误报判不出来。
     */
    private ObjectNode toJson(BugExtractionRunner.Extracted e) {
        ObjectNode out = mapper.createObjectNode();
        out.put("isBug", e.isBug());
        if (!e.isBug()) {
            return out;
        }
        putIfPresent(out, "type", e.type());
        putIfPresent(out, "severity", e.severity());
        putIfPresent(out, "system", e.system());
        putIfPresent(out, "module", e.module());
        putIfPresent(out, "title", e.title());
        putIfPresent(out, "reproduce", e.reproduce());
        putIfPresent(out, "expected", e.expected());
        putIfPresent(out, "actual", e.actual());
        putIfPresent(out, "suspectArea", e.suspectArea());
        if (e.confidence() != null) {
            out.put("confidence", e.confidence());
        }
        return out;
    }

    private static void putIfPresent(ObjectNode out, String field, String value) {
        if (value != null) {
            out.put(field, value);
        }
    }
}
