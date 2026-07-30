package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.DevelopmentChangeContextProvider;
import com.exceptioncoder.toolbox.llm.spi.DevelopmentChangeContextProvider.DevelopmentChangeContext;
import com.exceptioncoder.toolbox.llm.spi.DevelopmentChangeContextProvider.DevelopmentSyncPoint;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdDocChangeBaseline;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdDocChangeCandidate;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdDocChangeBaselineRepository;
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
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** 编排开发证据采集、双阶段 AI 分析、候选状态和同步基线。 */
@Service
public class PrdDocChangeAnalysisService {

    private static final Set<String> DECISIONS =
            Set.of("NONE", "PRD_ONLY", "TDD_ONLY", "BOTH", "UNCERTAIN");

    private final PrdSessionRepository sessionRepository;
    private final PrdDocChangeCandidateRepository candidateRepository;
    private final PrdDocChangeBaselineRepository baselineRepository;
    private final ObjectProvider<DevelopmentChangeContextProvider> contextProvider;
    private final PrdDocChangeEvidenceBuilder evidenceBuilder;
    private final PrdDocChangeAgentAnalyzer analyzer;
    private final PrdDocChangeAgentVerifier verifier;
    private final PrdDocChangeConfidencePolicy confidencePolicy;
    private final PrdFileStore fileStore;
    private final ObjectMapper mapper;

    public PrdDocChangeAnalysisService(PrdSessionRepository sessionRepository,
                                       PrdDocChangeCandidateRepository candidateRepository,
                                       PrdDocChangeBaselineRepository baselineRepository,
                                       ObjectProvider<DevelopmentChangeContextProvider> contextProvider,
                                       PrdDocChangeEvidenceBuilder evidenceBuilder,
                                       PrdDocChangeAgentAnalyzer analyzer,
                                       PrdDocChangeAgentVerifier verifier,
                                       PrdDocChangeConfidencePolicy confidencePolicy,
                                       PrdFileStore fileStore,
                                       ObjectMapper mapper) {
        this.sessionRepository = sessionRepository;
        this.candidateRepository = candidateRepository;
        this.baselineRepository = baselineRepository;
        this.contextProvider = contextProvider;
        this.evidenceBuilder = evidenceBuilder;
        this.analyzer = analyzer;
        this.verifier = verifier;
        this.confidencePolicy = confidencePolicy;
        this.fileStore = fileStore;
        this.mapper = mapper;
    }

    /** 基于最近完成同步点生成或幂等复用文档变更候选。 */
    public PrdDocChangeCandidate analyze(String prdSessionId) {
        PrdSession session = requireLinkedSession(prdSessionId);
        PrdDocChangeBaseline baseline = baselineRepository
                .find(prdSessionId, session.getDevSessionId()).orElse(null);
        DevelopmentChangeContext context = snapshot(session.getDevSessionId(), syncPoint(baseline));
        PrdDocChangeEvidenceBundle evidence = buildEvidence(session, context, "[]");
        String snapshotHash = snapshotHash(context, evidence, "[]");
        PrdDocChangeCandidate duplicate = candidateRepository
                .findBySnapshot(prdSessionId, session.getDevSessionId(), snapshotHash)
                .orElse(null);
        if (duplicate != null) {
            return duplicate;
        }

        PreparedAnalysis prepared = analyzeEvidence(evidence, snapshotHash);
        long now = System.currentTimeMillis();
        PrdDocChangeCandidate candidate = toCandidate(session, context, prepared, now);
        candidateRepository.insert(candidate);
        baselineRepository.saveCandidateSnapshot(candidate.getId(), context.repositories(), context.snapshotHash());
        return candidate;
    }

    /** 返回 PRD 的最近一次候选。 */
    public PrdDocChangeCandidate latest(String prdSessionId) {
        requireSession(prdSessionId);
        return candidateRepository.findLatest(prdSessionId).orElse(null);
    }

    /** 在文档执行前覆写 AI 建议范围。 */
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

    /** 将用户回答登记为新证据后重新执行分析和复核。 */
    public PrdDocChangeCandidate reanalyze(String candidateId, String answer) {
        if (answer == null || answer.isBlank()) {
            throw new IllegalArgumentException("补充信息不能为空");
        }
        PrdDocChangeCandidate candidate = requireCandidate(candidateId);
        PrdSession session = requireSession(candidate.getPrdSessionId());
        PrdDocChangeBaseline baseline = baselineRepository
                .find(candidate.getPrdSessionId(), candidate.getDevSessionId()).orElse(null);
        long sequence = baseline == null ? candidate.getConversationFromSeq() : baseline.conversationSequence();
        Map<String, String> heads = baseline == null ? Map.of() : baseline.repositoryHeads();
        DevelopmentChangeContext context = snapshot(
                candidate.getDevSessionId(), new DevelopmentSyncPoint(sequence, heads));
        ArrayNode history = appendClarification(candidate, answer);
        PrdDocChangeEvidenceBundle evidence = buildEvidence(session, context, history.toString());
        PreparedAnalysis prepared = analyzeEvidence(
                evidence, snapshotHash(context, evidence, history.toString()));
        PrdDocChangeFinalAnalysis analysis = prepared.analysis();
        candidateRepository.updateAnalysis(candidateId, context.toSequence(), prepared.snapshotHash(),
                analysis.decision(), analysis.decision(), analysis.summary(), analysis.reasoning(),
                writeJson(analysis.evidence()), writeJson(analysis.prdPatchPlan()),
                writeJson(analysis.tddPatchPlan()), writeJson(analysis.risks()),
                analysis.clarificationQuestion(), history.toString(), analysis.confidence());
        baselineRepository.saveCandidateSnapshot(candidateId, context.repositories(), context.snapshotHash());
        return requireCandidate(candidateId);
    }

    /** 校验并记录候选执行阶段；完成或无需更新时推进同步基线。 */
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
        PrdDocChangeCandidate updated = requireCandidate(candidateId);
        if (Set.of("APPLIED", "NO_UPDATE").contains(updated.getStatus())) {
            PrdSession session = requireSession(updated.getPrdSessionId());
            baselineRepository.promote(updated, hash(readPrd(session.getId())), hash(readTdd(session)));
        }
        return updated;
    }

    private PrdDocChangeEvidenceBundle buildEvidence(PrdSession session, DevelopmentChangeContext context,
                                                      String clarificationHistoryJson) {
        return evidenceBuilder.build(
                session, context, readPrd(session.getId()), readTdd(session), clarificationHistoryJson);
    }

    private PreparedAnalysis analyzeEvidence(PrdDocChangeEvidenceBundle evidence, String snapshotHash) {
        PrdDocChangeAnalysisResult draft = analyzer.analyze(evidence);
        PrdDocChangeVerificationResult verification = verifier.verify(evidence, draft);
        PrdDocChangeFinalAnalysis analysis = confidencePolicy.evaluate(evidence, draft, verification);
        return new PreparedAnalysis(analysis, snapshotHash);
    }

    private String snapshotHash(DevelopmentChangeContext context, PrdDocChangeEvidenceBundle evidence,
                                String clarificationHistoryJson) {
        return hash(context.snapshotHash() + "\n" + evidence.prdHash()
                + "\n" + evidence.tddHash() + "\n" + clarificationHistoryJson);
    }

    private PrdDocChangeCandidate toCandidate(PrdSession session, DevelopmentChangeContext context,
                                               PreparedAnalysis prepared, long now) {
        PrdDocChangeFinalAnalysis analysis = prepared.analysis();
        return PrdDocChangeCandidate.builder()
                .id(UUID.randomUUID().toString())
                .prdSessionId(session.getId())
                .devSessionId(session.getDevSessionId())
                .conversationFromSeq(context.fromSequence())
                .conversationToSeq(context.toSequence())
                .codeSnapshotHash(prepared.snapshotHash())
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
    }

    private ArrayNode appendClarification(PrdDocChangeCandidate candidate, String answer) {
        ArrayNode history = readArray(candidate.getClarificationHistoryJson());
        ObjectNode item = mapper.createObjectNode();
        item.put("question", candidate.getClarificationQuestion() == null
                ? "" : candidate.getClarificationQuestion());
        item.put("answer", answer.trim());
        history.add(item);
        return history;
    }

    private DevelopmentChangeContext snapshot(String devSessionId, DevelopmentSyncPoint syncPoint) {
        return requireContextProvider().snapshot(devSessionId, syncPoint);
    }

    private static DevelopmentSyncPoint syncPoint(PrdDocChangeBaseline baseline) {
        return baseline == null
                ? new DevelopmentSyncPoint(0, Map.of())
                : new DevelopmentSyncPoint(baseline.conversationSequence(), baseline.repositoryHeads());
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

    private PrdSession requireLinkedSession(String id) {
        PrdSession session = requireSession(id);
        if (session.getDevSessionId() == null || session.getDevSessionId().isBlank()) {
            throw new IllegalStateException("当前 PRD 尚未关联 Vibe Coding 会话");
        }
        return session;
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
            throw new IllegalStateException("序列化文档变更候选失败", e);
        }
    }

    private ArrayNode readArray(String json) {
        try {
            JsonNode node = mapper.readTree(json == null ? "[]" : json);
            return node instanceof ArrayNode array ? array : mapper.createArrayNode();
        } catch (Exception e) {
            throw new IllegalStateException("候选澄清历史已损坏，无法继续分析", e);
        }
    }

    private static String firstStage(String decision) {
        return "TDD_ONLY".equals(decision) ? "TDD" : "PRD";
    }

    private static String normalizeError(String error) {
        if (error == null || error.isBlank()) {
            return "文档更新失败";
        }
        return error.trim().substring(0, Math.min(1_000, error.trim().length()));
    }

    private static String hash(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest((value == null ? "" : value)
                    .getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("生成文档变更快照失败", e);
        }
    }

    private record PreparedAnalysis(PrdDocChangeFinalAnalysis analysis, String snapshotHash) {
    }
}
