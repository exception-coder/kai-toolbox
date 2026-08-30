package com.exceptioncoder.toolbox.eval.service;

import com.exceptioncoder.toolbox.eval.adapter.BugExtractionAdapter;
import com.exceptioncoder.toolbox.eval.adapter.BusinessConsultAdapter;
import com.exceptioncoder.toolbox.eval.api.dto.StartRunRequest;
import com.exceptioncoder.toolbox.eval.assertion.AssertionEngine;
import com.exceptioncoder.toolbox.eval.assertion.AssertionSpec;
import com.exceptioncoder.toolbox.eval.domain.EvalCase;
import com.exceptioncoder.toolbox.eval.domain.EvalPrompt;
import com.exceptioncoder.toolbox.eval.domain.EvalResult;
import com.exceptioncoder.toolbox.eval.domain.EvalRun;
import com.exceptioncoder.toolbox.eval.repository.EvalCaseRepository;
import com.exceptioncoder.toolbox.eval.repository.EvalResultRepository;
import com.exceptioncoder.toolbox.eval.repository.EvalRunRepository;
import com.exceptioncoder.toolbox.eval.spi.EvalAdapter;
import com.exceptioncoder.toolbox.llm.observability.AgentRunMetadata;
import com.exceptioncoder.toolbox.llm.observability.AgentSpan;
import com.exceptioncoder.toolbox.llm.observability.AgentTelemetry;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.opentelemetry.context.Scope;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

/**
 * L0 执行与报告。职责：解析口径（adapter + model + prompt 版本）→ 逐用例跑 → 断言 → 落库 → 出对比。
 * <p>
 * 首版串行执行：本地单用户场景下并发收益有限，而串行能让 LLM 侧限流行为可预测、失败定位简单。
 * 需要并发时在此处引入信号量即可，不影响存储与报告层。
 */
@Slf4j
@Service
public class EvalRunService {

    /** 自由文本字段：不做相等判定，降级为非空校验，避免换个措辞就误判退化。 */
    private static final Set<String> FUZZY_FIELDS = Set.of("title", "description", "summary");

    private final EvalCaseRepository caseRepo;
    private final EvalRunRepository runRepo;
    private final EvalResultRepository resultRepo;
    private final EvalPromptService promptService;
    private final AssertionEngine assertionEngine;
    private final AgentTelemetry telemetry;
    private final LangfuseScoreExportService scoreExportService;
    private final ObjectMapper mapper;
    private final Map<String, EvalAdapter> adapters;

    public EvalRunService(EvalCaseRepository caseRepo,
                          EvalRunRepository runRepo,
                          EvalResultRepository resultRepo,
                          EvalPromptService promptService,
                          AssertionEngine assertionEngine,
                          AgentTelemetry telemetry,
                          LangfuseScoreExportService scoreExportService,
                          ObjectMapper mapper,
                          List<EvalAdapter> adapterBeans) {
        this.caseRepo = caseRepo;
        this.runRepo = runRepo;
        this.resultRepo = resultRepo;
        this.promptService = promptService;
        this.assertionEngine = assertionEngine;
        this.telemetry = telemetry;
        this.scoreExportService = scoreExportService;
        this.mapper = mapper;
        this.adapters = adapterBeans.stream()
                .collect(Collectors.toMap(EvalAdapter::id, Function.identity(), (a, b) -> a, LinkedHashMap::new));
    }

    public List<Map<String, String>> listAdapters() {
        return adapters.values().stream()
                .map(a -> Map.of("id", a.id(), "scenario", a.scenario(),
                        "promptKey", a.promptKey() == null ? "" : a.promptKey()))
                .toList();
    }

    /** 建 run 并在虚拟线程上异步执行；立即返回 run 供前端轮询。 */
    public EvalRun start(StartRunRequest req) {
        EvalAdapter adapter = adapters.get(req.adapter());
        if (adapter == null) {
            throw new ResponseStatusException(BAD_REQUEST, "未知 adapter: " + req.adapter()
                    + "，可用: " + adapters.keySet());
        }
        List<EvalCase> cases = caseRepo.findByDataset(req.dataset(), true);
        if (cases.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "数据集无启用用例: " + req.dataset());
        }
        // 提示词托管在被测系统侧的 adapter 走这条：由它固定版本，评测只负责记录，不再自存一份口径。
        Integer externalPromptVersion = adapter.pinExternalPromptVersion(req.promptVersion());
        Optional<EvalPrompt> prompt = Optional.empty();
        if (externalPromptVersion == null) {
            prompt = promptService.resolve(adapter.promptKey(), req.promptVersion());
            if (adapter.promptKey() != null && prompt.isEmpty()) {
                throw new ResponseStatusException(BAD_REQUEST, "提示词未配置: " + adapter.promptKey());
            }
        }

        EvalRun run = EvalRun.builder()
                .id(UUID.randomUUID().toString())
                .scenario(adapter.scenario())
                .dataset(req.dataset())
                .adapter(adapter.id())
                .model(req.model())
                .promptKey(adapter.promptKey())
                .promptVersion(externalPromptVersion != null
                        ? externalPromptVersion
                        : prompt.map(EvalPrompt::getVersion).orElse(null))
                .status("RUNNING")
                .total(cases.size())
                .note(req.note())
                .startedAt(System.currentTimeMillis())
                .build();
        runRepo.insert(run);

        String promptContent = prompt.map(EvalPrompt::getContent).orElse(null);
        Thread.ofVirtual().name("eval-run-" + run.getId()).start(() -> execute(run, adapter, cases, promptContent));
        return run;
    }

    private void execute(EvalRun run, EvalAdapter adapter, List<EvalCase> cases, String promptContent) {
        int passed = 0, failed = 0, errored = 0;
        try {
            for (EvalCase c : cases) {
                EvalResult result = runObserved(run, adapter, c, promptContent);
                resultRepo.insert(result);
                scoreExportService.schedule(result);
                switch (result.getVerdict()) {
                    case "PASS" -> passed++;
                    case "FAIL" -> failed++;
                    default -> errored++;
                }
                runRepo.updateProgress(run.getId(), passed, failed, errored);
            }
            runRepo.finish(run.getId(), "SUCCESS", null, System.currentTimeMillis());
        } catch (Exception e) {
            log.error("评测运行异常 runId={}", run.getId(), e);
            runRepo.finish(run.getId(), "FAILED", e.getMessage(), System.currentTimeMillis());
        }
    }

    private EvalResult runObserved(EvalRun run, EvalAdapter adapter, EvalCase evalCase, String promptContent) {
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("eval.run.id", run.getId());
        attributes.put("eval.case.id", evalCase.getId());
        attributes.put("eval.dataset", run.getDataset());
        attributes.put("eval.adapter", adapter.id());
        attributes.put("eval.scenario", adapter.scenario());
        attributes.put("eval.case.title", evalCase.getTitle());
        attributes.put("gen_ai.agent.name", adapter.id());
        attributes.put("agent.display_name", agentDisplayName(adapter.id()));
        if (run.getPromptVersion() != null) {
            attributes.put("eval.prompt.version", run.getPromptVersion());
        }
        AgentRunMetadata metadata = new AgentRunMetadata(
                "tool-eval", run.getId(), null, adapter.id(), run.getModel(), attributes);
        AgentSpan span = telemetry.start("agent." + adapter.id() + ".eval", metadata);
        EvalResult result;
        try (Scope ignored = span.makeCurrent()) {
            result = runOne(run, adapter, evalCase, promptContent);
        }
        result.setTraceId(span.traceId());
        result.setScoreExportStatus(scoreExportService.initialStatus(result.getTraceId()));
        span.attribute("eval.verdict", result.getVerdict());
        span.attribute("eval.score", result.getScore());
        if ("ERROR".equals(result.getVerdict())) {
            span.fail(result.getError(), null);
        } else {
            span.success(result.getVerdict());
        }
        return result;
    }

    private String agentDisplayName(String adapterId) {
        return BusinessConsultAdapter.ID.equals(adapterId) ? "业务咨询 Agent" : adapterId;
    }

    private EvalResult runOne(EvalRun run, EvalAdapter adapter, EvalCase c, String promptContent) {
        long now = System.currentTimeMillis();
        EvalResult.EvalResultBuilder builder = EvalResult.builder()
                .id(UUID.randomUUID().toString())
                .runId(run.getId())
                .caseId(c.getId())
                .caseTitle(c.getTitle())
                .createdAt(now);
        try {
            JsonNode payload = mapper.readTree(c.getInputJson());
            EvalAdapter.Output out = adapter.run(
                    new EvalAdapter.Input(c.getId(), payload, run.getModel(), promptContent,
                            run.getPromptVersion()));

            List<AssertionSpec> specs = resolveSpecs(c, adapter);
            AssertionEngine.Verdict verdict = assertionEngine.evaluate(out.result(), specs);

            return builder
                    .verdict(verdict.passed() ? "PASS" : "FAIL")
                    .score(verdict.score())
                    .outputJson(out.result() == null ? null : out.result().toString())
                    .rawOutput(out.raw())
                    .assertionsJson(writeJson(verdict.outcomes()))
                    .latencyMs(out.latencyMs())
                    .build();
        } catch (Exception e) {
            log.warn("用例执行失败 caseId={} runId={}", c.getId(), run.getId(), e);
            return builder
                    .verdict("ERROR")
                    .score(0)
                    .error(e.getClass().getSimpleName() + ": " + e.getMessage())
                    .latencyMs(System.currentTimeMillis() - now)
                    .build();
        }
    }

    /** 显式断言优先；缺省时由期望值推导，自由文本字段自动降级。 */
    private List<AssertionSpec> resolveSpecs(EvalCase c, EvalAdapter adapter) throws Exception {
        if (c.getAssertJson() != null && !c.getAssertJson().isBlank()) {
            JsonNode node = mapper.readTree(c.getAssertJson());
            if (node.isArray() && !node.isEmpty()) {
                List<AssertionSpec> specs = new ArrayList<>();
                for (JsonNode item : node) {
                    specs.add(mapper.convertValue(item, AssertionSpec.class));
                }
                return specs;
            }
        }
        JsonNode expected = mapper.readTree(c.getExpectedJson());
        List<AssertionSpec> adapterSpecs = adapter.deriveAssertions(expected);
        return adapterSpecs.isEmpty()
                ? assertionEngine.deriveFromExpected(expected, FUZZY_FIELDS)
                : adapterSpecs;
    }

    private String writeJson(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception e) {
            return null;
        }
    }

    public EvalRun getRun(String id) {
        return runRepo.findById(id).orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "运行不存在: " + id));
    }

    public List<EvalRun> listRuns(String dataset, int limit) {
        return runRepo.search(dataset, limit);
    }

    public List<EvalResult> listResults(String runId) {
        return resultRepo.findByRun(runId);
    }

    public int retryScoreExports(String runId) {
        getRun(runId);
        return scoreExportService.retryFailedByRun(runId);
    }

    public void deleteRun(String id) {
        runRepo.delete(id);
    }

    /**
     * 两次 run 的退化对比。报告的价值全在 REGRESSED 清单——总分从 92 掉到 91 没有意义，
     * 「这 3 条由过转挂」才是能行动的信息。
     */
    public DiffReport diff(String baseRunId, String targetRunId) {
        EvalRun base = getRun(baseRunId);
        EvalRun target = getRun(targetRunId);
        List<EvalResultRepository.DiffRow> rows = resultRepo.diff(baseRunId, targetRunId);

        List<DiffItem> regressed = new ArrayList<>();
        List<DiffItem> fixed = new ArrayList<>();
        List<DiffItem> stillFailing = new ArrayList<>();
        int unchangedPass = 0;

        for (EvalResultRepository.DiffRow row : rows) {
            boolean basePass = "PASS".equals(row.baseVerdict());
            boolean targetPass = "PASS".equals(row.targetVerdict());
            DiffItem item = new DiffItem(row.caseId(), row.caseTitle(), row.baseVerdict(), row.targetVerdict(),
                    row.baseScore(), row.targetScore(), row.targetError(), row.targetAssertions());
            if (row.baseVerdict() == null || row.targetVerdict() == null) {
                continue; // 单侧独有：不可比，不计入任何结论
            }
            if (basePass && !targetPass) {
                regressed.add(item);
            } else if (!basePass && targetPass) {
                fixed.add(item);
            } else if (!basePass) {
                stillFailing.add(item);
            } else {
                unchangedPass++;
            }
        }
        return new DiffReport(base, target, regressed, fixed, stillFailing, unchangedPass);
    }

    /**
     * 场景 ② 专用汇总：isBug 判定的混淆矩阵。
     * 通过率会被「大量非 BUG 用例」稀释，误报率才是这条链路真正的风险面。
     */
    public Map<String, Object> extractionSummary(String runId) {
        EvalRun run = getRun(runId);
        if (!BugExtractionAdapter.SCENARIO.equals(run.getScenario())) {
            throw new ResponseStatusException(BAD_REQUEST, "该 run 不是 EXTRACTION 形态: " + run.getScenario());
        }
        Map<String, EvalCase> caseById = caseRepo.findByDataset(run.getDataset(), false).stream()
                .collect(Collectors.toMap(EvalCase::getId, Function.identity(), (a, b) -> a));

        int tp = 0, fp = 0, fn = 0, tn = 0, skipped = 0;
        for (EvalResult r : resultRepo.findByRun(runId)) {
            EvalCase c = caseById.get(r.getCaseId());
            if (c == null || r.getOutputJson() == null) {
                skipped++;
                continue;
            }
            try {
                boolean expected = mapper.readTree(c.getExpectedJson()).path("isBug").asBoolean(false);
                boolean actual = mapper.readTree(r.getOutputJson()).path("isBug").asBoolean(false);
                if (expected && actual) tp++;
                else if (!expected && actual) fp++;
                else if (expected) fn++;
                else tn++;
            } catch (Exception e) {
                skipped++;
            }
        }
        double precision = tp + fp == 0 ? 0 : (double) tp / (tp + fp);
        double recall = tp + fn == 0 ? 0 : (double) tp / (tp + fn);
        double f1 = precision + recall == 0 ? 0 : 2 * precision * recall / (precision + recall);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("runId", runId);
        out.put("truePositive", tp);
        out.put("falsePositive", fp);
        out.put("falseNegative", fn);
        out.put("trueNegative", tn);
        out.put("skipped", skipped);
        out.put("precision", precision);
        out.put("recall", recall);
        out.put("f1", f1);
        return out;
    }

    public record DiffItem(String caseId, String caseTitle, String baseVerdict, String targetVerdict,
                           Double baseScore, Double targetScore, String targetError, String targetAssertions) {
    }

    public record DiffReport(EvalRun base, EvalRun target, List<DiffItem> regressed, List<DiffItem> fixed,
                             List<DiffItem> stillFailing, int unchangedPass) {
    }
}
