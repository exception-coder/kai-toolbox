package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.llm.spi.DevelopmentChangeContextProvider;
import com.exceptioncoder.toolbox.llm.spi.DevelopmentChangeContextProvider.DevelopmentChangeContext;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdDocChangeCandidate;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdDocChangeCandidateRepository;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * 将开发对话与 Git 事实规整为可确认的 PRD/TDD 更新候选。
 */
@Service
public class PrdDocChangeAnalysisService {

    private static final String PROMPT_VERSION = "v1";
    private static final Set<String> DECISIONS =
            Set.of("NONE", "PRD_ONLY", "TDD_ONLY", "BOTH", "UNCERTAIN");
    private static final int MAX_DOCUMENT_CHARS = 60_000;
    private static final int MAX_CONTEXT_CHARS = 140_000;

    private static final String SYSTEM_PROMPT = """
            你是软件交付文档变更分析器。你的任务不是改文档，而是根据开发事实判断 PRD/TDD 是否需要更新。

            判定：
            - NONE：仅调试、环境、日志、临时探索，最终产品行为和技术方案均未变化。
            - PRD_ONLY：业务目标、范围、规则、交互、异常或验收变化，但技术方案无需调整。
            - TDD_ONLY：接口、类、数据、依赖、事务、异常、兼容或测试策略变化，但产品行为不变。
            - BOTH：需求事实变化且引起技术方案变化。
            - UNCERTAIN：存在冲突，或缺少只能由用户决定的关键业务事实。

            必须区分“讨论过”与“最终确认”。被否定、撤销、仅头脑风暴的内容不得写成确定事实。
            Git diff 能确认的技术事实不要再问用户；只有用户必须决定的阻塞事实才追问。
            UNCERTAIN 时 clarificationQuestion 必须只有一个最关键问题；其余判定该字段为空字符串。

            只输出一个 JSON 对象，禁止 Markdown 围栏和解释。字段必须完整：
            {
              "decision":"NONE|PRD_ONLY|TDD_ONLY|BOTH|UNCERTAIN",
              "summary":"可直接作为文档更新说明的摘要",
              "reasoning":"判断理由",
              "evidence":["对话、工具或代码证据"],
              "prdPatchPlan":["拟修改 PRD 章节"],
              "tddPatchPlan":["拟修改 TDD 章节"],
              "risks":["风险或非阻塞待确认项"],
              "clarificationQuestion":"",
              "confidence":0
            }
            """;

    private final PrdSessionRepository sessionRepository;
    private final PrdDocChangeCandidateRepository candidateRepository;
    private final ObjectProvider<DevelopmentChangeContextProvider> contextProvider;
    private final AgentOneShotRunner agentRunner;
    private final PrdFileStore fileStore;
    private final ObjectMapper mapper;

    public PrdDocChangeAnalysisService(PrdSessionRepository sessionRepository,
                                       PrdDocChangeCandidateRepository candidateRepository,
                                       ObjectProvider<DevelopmentChangeContextProvider> contextProvider,
                                       AgentOneShotRunner agentRunner,
                                       PrdFileStore fileStore,
                                       ObjectMapper mapper) {
        this.sessionRepository = sessionRepository;
        this.candidateRepository = candidateRepository;
        this.contextProvider = contextProvider;
        this.agentRunner = agentRunner;
        this.fileStore = fileStore;
        this.mapper = mapper;
    }

    public PrdDocChangeCandidate analyze(String prdSessionId) {
        PrdSession session = requireSession(prdSessionId);
        if (session.getDevSessionId() == null || session.getDevSessionId().isBlank()) {
            throw new IllegalStateException("当前 PRD 尚未关联 Vibe Coding 会话");
        }
        PrdDocChangeCandidate latest = candidateRepository.findLatest(prdSessionId).orElse(null);
        long afterSequence = latest == null ? 0 : latest.getConversationToSeq();
        DevelopmentChangeContext context = requireContextProvider()
                .snapshot(session.getDevSessionId(), afterSequence);

        PrdDocChangeCandidate duplicate = candidateRepository
                .findBySnapshot(prdSessionId, session.getDevSessionId(), context.snapshotHash())
                .orElse(null);
        if (duplicate != null) {
            return duplicate;
        }

        ParsedAnalysis analysis = runAnalysis(session, context, "[]");
        long now = System.currentTimeMillis();
        PrdDocChangeCandidate candidate = PrdDocChangeCandidate.builder()
                .id(UUID.randomUUID().toString())
                .prdSessionId(prdSessionId)
                .devSessionId(session.getDevSessionId())
                .conversationFromSeq(context.fromSequence())
                .conversationToSeq(context.toSequence())
                .codeSnapshotHash(context.snapshotHash())
                .decision(analysis.decision())
                .aiDecision(analysis.decision())
                .summary(analysis.summary())
                .reasoning(analysis.reasoning())
                .evidenceJson(writeJson(analysis.evidence()))
                .prdPatchPlanJson(writeJson(analysis.prdPatchPlan()))
                .tddPatchPlanJson(writeJson(analysis.tddPatchPlan()))
                .risksJson(writeJson(analysis.risks()))
                .clarificationQuestion(analysis.clarificationQuestion())
                .clarificationHistoryJson("[]")
                .confidence(analysis.confidence())
                .status("PENDING")
                .applyStage("NONE")
                .createdAt(now)
                .updatedAt(now)
                .build();
        candidateRepository.insert(candidate);
        return candidate;
    }

    public PrdDocChangeCandidate latest(String prdSessionId) {
        requireSession(prdSessionId);
        return candidateRepository.findLatest(prdSessionId).orElse(null);
    }

    public PrdDocChangeCandidate overrideDecision(String candidateId, String decision) {
        requireDecision(decision);
        PrdDocChangeCandidate candidate = requireCandidate(candidateId);
        if ("APPLYING".equals(candidate.getStatus()) || "APPLIED".equals(candidate.getStatus())
                || candidate.getPrdAppliedAt() != null || candidate.getTddAppliedAt() != null) {
            throw new IllegalStateException("正式文档已开始更新，不能再修改更新范围");
        }
        candidateRepository.updateDecision(candidateId, decision);
        return requireCandidate(candidateId);
    }

    public PrdDocChangeCandidate reanalyze(String candidateId, String answer) {
        if (answer == null || answer.isBlank()) {
            throw new IllegalArgumentException("补充信息不能为空");
        }
        PrdDocChangeCandidate candidate = requireCandidate(candidateId);
        PrdSession session = requireSession(candidate.getPrdSessionId());
        DevelopmentChangeContext context = requireContextProvider()
                .snapshot(candidate.getDevSessionId(), candidate.getConversationFromSeq());
        ArrayNode history = readArray(candidate.getClarificationHistoryJson());
        ObjectNode item = mapper.createObjectNode();
        item.put("question", candidate.getClarificationQuestion() == null ? "" : candidate.getClarificationQuestion());
        item.put("answer", answer.trim());
        history.add(item);
        ParsedAnalysis analysis = runAnalysis(session, context, history.toString());
        candidateRepository.updateAnalysis(candidateId, context.toSequence(), context.snapshotHash(),
                analysis.decision(), analysis.decision(),
                analysis.summary(), analysis.reasoning(), writeJson(analysis.evidence()),
                writeJson(analysis.prdPatchPlan()), writeJson(analysis.tddPatchPlan()),
                writeJson(analysis.risks()), analysis.clarificationQuestion(), history.toString(),
                analysis.confidence());
        return requireCandidate(candidateId);
    }

    public PrdDocChangeCandidate applyAction(String candidateId, String action, String error) {
        PrdDocChangeCandidate candidate = requireCandidate(candidateId);
        requireActionAllowed(candidate, action);
        long now = System.currentTimeMillis();
        switch (action == null ? "" : action) {
            case "CONFIRM" -> candidateRepository.updateStage(candidateId, "CONFIRMED",
                    firstStage(candidate.getDecision()), null, null, null);
            case "START_PRD" -> candidateRepository.updateStage(candidateId, "APPLYING", "PRD",
                    null, null, null);
            case "PRD_SUCCESS" -> candidateRepository.updateStage(candidateId, "CONFIRMED", "TDD",
                    null, now, null);
            case "START_TDD" -> candidateRepository.updateStage(candidateId, "APPLYING", "TDD",
                    null, null, null);
            case "TDD_SUCCESS" -> candidateRepository.updateStage(candidateId, "APPLIED", "DONE",
                    null, null, now);
            case "PRD_ONLY_SUCCESS" -> candidateRepository.updateStage(candidateId, "APPLIED", "DONE",
                    null, now, null);
            case "FAIL" -> candidateRepository.updateStage(candidateId, "PARTIAL",
                    candidate.getApplyStage(), normalizeError(error), null, null);
            case "DISMISS" -> candidateRepository.updateStage(candidateId, "DISMISSED", "NONE",
                    null, null, null);
            case "NO_UPDATE" -> candidateRepository.updateStage(candidateId, "NO_UPDATE", "DONE",
                    null, null, null);
            default -> throw new IllegalArgumentException("不支持的候选操作: " + action);
        }
        return requireCandidate(candidateId);
    }

    private void requireActionAllowed(PrdDocChangeCandidate candidate, String action) {
        String status = candidate.getStatus();
        String stage = candidate.getApplyStage();
        boolean allowed = switch (action == null ? "" : action) {
            case "CONFIRM" -> "PENDING".equals(status);
            case "START_PRD" -> "PRD".equals(stage)
                    && Set.of("CONFIRMED", "PARTIAL", "APPLYING").contains(status);
            case "PRD_SUCCESS", "PRD_ONLY_SUCCESS" -> "APPLYING".equals(status) && "PRD".equals(stage);
            case "START_TDD" -> "TDD".equals(stage)
                    && Set.of("CONFIRMED", "PARTIAL", "APPLYING").contains(status);
            case "TDD_SUCCESS" -> "APPLYING".equals(status) && "TDD".equals(stage);
            case "FAIL" -> "APPLYING".equals(status) && Set.of("PRD", "TDD").contains(stage);
            case "DISMISS", "NO_UPDATE" -> "PENDING".equals(status);
            default -> false;
        };
        if (!allowed) {
            throw new IllegalStateException("候选当前状态不允许执行 " + action + "（"
                    + status + "/" + stage + "）");
        }
    }

    private ParsedAnalysis runAnalysis(PrdSession session, DevelopmentChangeContext context,
                                       String clarificationHistoryJson) {
        String prompt = buildPrompt(session, context, clarificationHistoryJson);
        String raw = agentRunner.runOnce(SYSTEM_PROMPT, prompt, session.getModel(), normalizeEngine(session.getEngine()));
        return parse(raw);
    }

    private String buildPrompt(PrdSession session, DevelopmentChangeContext context,
                               String clarificationHistoryJson) {
        String prd = readPrd(session.getId());
        String tdd = readTdd(session);
        String contextJson = writeJson(context);
        return """
                提示词版本：%s
                需求标题：%s

                === 当前 PRD ===
                %s

                === 当前 TDD ===
                %s

                === 上次同步点后的开发上下文 ===
                %s

                === 已补充的澄清回答 ===
                %s
                """.formatted(PROMPT_VERSION, session.getTitle(),
                truncate(prd, MAX_DOCUMENT_CHARS), truncate(tdd, MAX_DOCUMENT_CHARS),
                truncate(contextJson, MAX_CONTEXT_CHARS), clarificationHistoryJson);
    }

    private ParsedAnalysis parse(String raw) {
        try {
            JsonNode node = mapper.readTree(stripFence(raw == null ? "" : raw.trim()));
            String decision = node.path("decision").asText("").toUpperCase();
            requireDecision(decision);
            String question = text(node, "clarificationQuestion");
            if ("UNCERTAIN".equals(decision) && question.isBlank()) {
                question = "当前证据不足，请补充这次最终确认的业务或技术结论。";
            }
            if (!"UNCERTAIN".equals(decision)) {
                question = "";
            }
            return new ParsedAnalysis(decision, text(node, "summary"), text(node, "reasoning"),
                    strings(node.path("evidence")), strings(node.path("prdPatchPlan")),
                    strings(node.path("tddPatchPlan")), strings(node.path("risks")),
                    question, Math.max(0, Math.min(100, node.path("confidence").asInt(0))));
        } catch (Exception e) {
            return new ParsedAnalysis("UNCERTAIN", "AI 分析结果格式异常，尚不能安全更新正式文档",
                    "模型未返回符合契约的结构化结果：" + e.getMessage(), List.of(),
                    List.of(), List.of(), List.of("可重试分析，或补充最终确认结论"),
                    "请补充这次开发最终确认并实际落地的核心变化。", 0);
        }
    }

    private PrdSession requireSession(String id) {
        return sessionRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("PRD 会话不存在: " + id));
    }

    private PrdDocChangeCandidate requireCandidate(String id) {
        return candidateRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("文档变更候选不存在: " + id));
    }

    private DevelopmentChangeContextProvider requireContextProvider() {
        DevelopmentChangeContextProvider provider = contextProvider.getIfAvailable();
        if (provider == null) {
            throw new IllegalStateException("开发变更上下文能力未加载，请确认 Vibe Coding 模块已启用");
        }
        return provider;
    }

    private void requireDecision(String decision) {
        if (!DECISIONS.contains(decision)) {
            throw new IllegalArgumentException("不支持的更新范围: " + decision);
        }
    }

    private String readPrd(String sessionId) {
        try {
            return fileStore.read(sessionId);
        } catch (Exception e) {
            return "";
        }
    }

    private String readTdd(PrdSession session) {
        try {
            if (session.getDevDocPath() == null || session.getDevDocPath().isBlank()) {
                return "";
            }
            Path path = Path.of(session.getDevDocPath());
            return Files.isRegularFile(path) ? Files.readString(path, StandardCharsets.UTF_8) : "";
        } catch (Exception e) {
            return "";
        }
    }

    private String writeJson(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception e) {
            return "[]";
        }
    }

    private ArrayNode readArray(String json) {
        try {
            JsonNode node = mapper.readTree(json == null ? "[]" : json);
            return node instanceof ArrayNode array ? array : mapper.createArrayNode();
        } catch (Exception e) {
            return mapper.createArrayNode();
        }
    }

    private static String firstStage(String decision) {
        return "TDD_ONLY".equals(decision) ? "TDD" : "PRD";
    }

    private static String normalizeError(String error) {
        if (error == null || error.isBlank()) {
            return "文档更新失败";
        }
        return truncate(error.trim(), 1_000);
    }

    private static String normalizeEngine(String engine) {
        return "codex".equalsIgnoreCase(engine) ? "codex" : "claude";
    }

    private static String text(JsonNode node, String field) {
        return node.path(field).asText("").trim();
    }

    private static List<String> strings(JsonNode node) {
        if (!node.isArray()) {
            return List.of();
        }
        return java.util.stream.StreamSupport.stream(node.spliterator(), false)
                .map(JsonNode::asText)
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .toList();
    }

    private static String stripFence(String value) {
        String cleaned = value;
        if (cleaned.startsWith("```")) {
            int newline = cleaned.indexOf('\n');
            cleaned = newline >= 0 ? cleaned.substring(newline + 1) : cleaned;
        }
        if (cleaned.endsWith("```")) {
            cleaned = cleaned.substring(0, cleaned.length() - 3);
        }
        int start = cleaned.indexOf('{');
        int end = cleaned.lastIndexOf('}');
        return start >= 0 && end >= start ? cleaned.substring(start, end + 1) : cleaned.trim();
    }

    private static String truncate(String value, int maxChars) {
        if (value == null) {
            return "";
        }
        return value.length() <= maxChars ? value : value.substring(0, maxChars) + "\n…（已截断）";
    }

    private record ParsedAnalysis(
            String decision,
            String summary,
            String reasoning,
            List<String> evidence,
            List<String> prdPatchPlan,
            List<String> tddPatchPlan,
            List<String> risks,
            String clarificationQuestion,
            int confidence
    ) {
    }
}
