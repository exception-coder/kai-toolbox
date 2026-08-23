package com.exceptioncoder.toolbox.prdclarify.delivery;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.exceptioncoder.toolbox.prdclarify.api.dto.DeliveryOverviewView;
import com.exceptioncoder.toolbox.prdclarify.domain.DeliveryClaim;
import com.exceptioncoder.toolbox.prdclarify.domain.DeliveryClaimStatus;
import com.exceptioncoder.toolbox.prdclarify.domain.DeliveryEvidenceStatus;
import com.exceptioncoder.toolbox.prdclarify.domain.DeliveryVerificationStatus;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactState;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactType;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdArtifactRepository;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;

/**
 * 将用户可见 PRD、开发文档和进度报告投影为 AI 交付中心大看板。
 */
@Service
public class DeliveryOverviewService {

    private static final Logger log = LoggerFactory.getLogger(DeliveryOverviewService.class);
    private static final int MAX_REQUIREMENTS = 500;

    private final PrdSessionRepository repository;
    private final ProgressReportParser reportParser;
    private final DeliveryMetrics metrics;
    private final ObjectMapper objectMapper;
    private final PrdArtifactRepository artifactRepository;
    private final DeliveryClaimLedgerService claimLedgerService;
    private final DeliveryVerificationService verificationService;

    public DeliveryOverviewService(
            PrdSessionRepository repository,
            ProgressReportParser reportParser,
            DeliveryMetrics metrics,
            ObjectMapper objectMapper,
            PrdArtifactRepository artifactRepository,
            DeliveryClaimLedgerService claimLedgerService,
            DeliveryVerificationService verificationService) {
        this.repository = repository;
        this.reportParser = reportParser;
        this.metrics = metrics;
        this.objectMapper = objectMapper;
        this.artifactRepository = artifactRepository;
        this.claimLedgerService = claimLedgerService;
        this.verificationService = verificationService;
    }

    /**
     * 构建当前用户可见的交付概览。
     *
     * @param administrator 是否管理员或鉴权关闭
     * @param userId 普通用户 ID
     * @param project 项目筛选
     * @param module 模块筛选
     * @param query 搜索词
     * @return 完整交付投影
     */
    public DeliveryOverviewView overview(
            boolean administrator,
            Long userId,
            String project,
            String module,
            String query) {
        List<PrdSession> visibleSessions = administrator
                ? repository.findRecent(MAX_REQUIREMENTS)
                : repository.findRecentByUser(MAX_REQUIREMENTS, Objects.requireNonNull(userId));
        DeliveryOverviewView.FilterOptionsView filterOptions = filterOptions(visibleSessions);
        List<PrdSession> filteredSessions = visibleSessions.stream()
                .filter(session -> matches(session, project, module, query))
                .toList();

        List<String> warnings = new ArrayList<>();
        List<RequirementProjection> projections = filteredSessions.stream()
                .map(session -> project(session, warnings))
                .sorted(Comparator
                        .comparingInt((RequirementProjection item) -> item.requirement().healthScore())
                        .thenComparing(item -> item.requirement().updatedAt(), Comparator.reverseOrder()))
                .toList();
        List<DeliveryOverviewView.RequirementView> requirements = projections.stream()
                .map(RequirementProjection::requirement)
                .toList();
        List<DeliveryOverviewView.FindingView> findings = projections.stream()
                .flatMap(item -> item.findings().stream())
                .sorted(Comparator
                        .comparingInt((DeliveryOverviewView.FindingView item) -> severityRank(item.severity()))
                        .thenComparing(DeliveryOverviewView.FindingView::title))
                .toList();

        return new DeliveryOverviewView(
                System.currentTimeMillis(),
                summary(requirements, findings),
                filterOptions,
                requirements,
                findings,
                List.copyOf(warnings));
    }

    private RequirementProjection project(PrdSession session, List<String> warnings) {
        boolean prdComplete = "DONE".equals(session.getStatus()) && fileExists(session.getMdPath());
        boolean tddPresent = fileExists(session.getDevDocPath());
        boolean tddStale = tddPresent && session.getDevDocGeneratedAt() != null
                && session.getDevDocGeneratedAt() < session.getUpdatedAt();
        long assessmentBaseline = Math.max(
                session.getUpdatedAt(),
                Optional.ofNullable(session.getDevDocGeneratedAt()).orElse(0L));
        boolean assessmentPresent = fileExists(session.getProgressPath());
        boolean assessmentStale = assessmentPresent && session.getProgressGeneratedAt() != null
                && session.getProgressGeneratedAt() < assessmentBaseline;

        ProgressReportParser.ParsedProgressReport report = ProgressReportParser.ParsedProgressReport.empty();
        boolean assessmentError = false;
        if (assessmentPresent) {
            try {
                String markdown = Files.readString(Path.of(session.getProgressPath()), StandardCharsets.UTF_8);
                report = reportParser.parse(markdown);
            } catch (Exception exception) {
                assessmentError = true;
                warnings.add("“" + session.getTitle() + "”的进度报告读取失败");
                log.warn("读取交付进度报告失败, sessionId={}", session.getId(), exception);
            }
        }

        int legacyCompletedWithoutEvidence = (int) report.completed().stream()
                .filter(item -> item.evidence().isEmpty())
                .count();
        ClaimAssessment claims = claimAssessment(session.getId(), assessmentPresent);
        Integer codeScore = claims.codeScore();
        Integer codeScoreWithoutTests = claims.codeScoreWithoutTests();
        int testItemCount = claims.ledgerPresent()
                ? claims.testItemCount()
                : countTests(report.completed()) + countTests(report.partial())
                        + countTests(report.missing()) + countTests(report.excluded());
        int unitTestItemCount = countUnitTests(report.completed())
                + countUnitTests(report.partial())
                + countUnitTests(report.missing())
                + countUnitTests(report.excluded());
        Optional<DeliveryVerificationService.RunProjection> verification =
                verificationService.latest(session.getId(), session.getProject());
        Integer verificationScore = verificationScore(verification);
        int deliveryProgress = metrics.overallProgress(
                prdComplete ? 100 : 0,
                tddPresent ? 100 : 0,
                codeScore,
                verificationScore);
        int deliveryProgressWithoutTests = metrics.overallProgress(
                prdComplete ? 100 : 0,
                tddPresent ? 100 : 0,
                codeScoreWithoutTests,
                verificationScore);
        DeliveryOverviewView.EffortProgressView effortProgress = effortProgress(
                session, codeScore, deliveryProgress,
                claims.ledgerPresent() && !assessmentStale);
        boolean verificationPresent = verification
                .map(item -> item.run().status() != DeliveryVerificationStatus.RUNNING && !item.stale())
                .orElse(false);
        boolean verificationStale = verification.map(DeliveryVerificationService.RunProjection::stale).orElse(false);
        int evidenceGapCount = claims.ledgerPresent()
                ? claims.invalidEvidenceCount()
                : legacyCompletedWithoutEvidence;
        int confidence = metrics.confidence(
                prdComplete,
                tddPresent,
                tddStale,
                claims.ledgerPresent(),
                assessmentStale,
                evidenceGapCount,
                verificationPresent,
                verificationStale);
        int health = metrics.health(
                prdComplete,
                tddPresent,
                tddStale,
                claims.ledgerPresent(),
                assessmentStale,
                claims.ledgerPresent() ? claims.partial() : report.partial().size(),
                claims.ledgerPresent() ? claims.missing() : report.missing().size(),
                evidenceGapCount,
                verificationPresent,
                verificationStale);

        List<String> staleReasons = staleReasons(tddStale, assessmentStale, assessmentError);
        if (verificationStale) {
            staleReasons = new ArrayList<>(staleReasons);
            staleReasons.add("构建或测试验证早于当前 Git HEAD");
            staleReasons = List.copyOf(staleReasons);
        }
        DeliveryOverviewView.RequirementView requirement = new DeliveryOverviewView.RequirementView(
                session.getId(),
                session.getParentId(),
                session.getTitle(),
                blankAsUnassigned(session.getProject()),
                blankAsUnassigned(session.getModule()),
                session.getStatus(),
                session.getUpdatedAt(),
                links(session),
                stages(session, prdComplete, tddPresent, tddStale, claims.ledgerPresent(), assessmentStale,
                        assessmentError, codeScore),
                new DeliveryOverviewView.CoverageView(
                        claims.ledgerPresent() ? claims.completed() : report.completed().size(),
                        claims.ledgerPresent() ? claims.partial() : report.partial().size(),
                        claims.ledgerPresent() ? claims.missing() : report.missing().size(),
                        claims.ledgerPresent() ? claims.total() : report.total()),
                new DeliveryOverviewView.CodeScoreVariantsView(
                        codeScore,
                        codeScoreWithoutTests,
                        testItemCount,
                        codeScore,
                        codeScoreWithoutTests,
                        unitTestItemCount),
                deliveryProgress,
                new DeliveryOverviewView.OverallProgressVariantsView(
                        deliveryProgress, deliveryProgressWithoutTests),
                claims.evidenceMode(),
                claims.verifiedClaimCount(),
                claims.invalidEvidenceCount(),
                verification.map(this::verificationView).orElse(null),
                verificationService.commandOptions().stream()
                        .map(item -> new DeliveryOverviewView.VerificationCommandView(item.id(), item.label()))
                        .toList(),
                new DeliveryOverviewView.ProgressItemsView(
                        progressItems(report.completed()),
                        progressItems(report.partial()),
                        progressItems(report.missing()),
                        progressItems(report.excluded())),
                report.alignment().stream()
                        .map(item -> new DeliveryOverviewView.AlignmentFindingView(
                                item.requirement(), item.expected(), item.actual(), item.status()))
                        .toList(),
                effortProgress,
                confidence,
                health,
                metrics.grade(health),
                staleReasons);
        return new RequirementProjection(requirement, findings(requirement, prdComplete, tddPresent, tddStale,
                claims.ledgerPresent(), assessmentStale, assessmentError, evidenceGapCount));
    }

    /**
     * 将责任时间处持久化的原始 AI 工时评估投影为“当前代码进度 vs 剩余工作量”。
     * 只接受已经产出过有效结果的记录；后台重评中仍保留上一版数值，因此 estimatedAt 有值时
     * 继续展示旧基线并由 workStatus 提示刷新状态。
     */
    private DeliveryOverviewView.EffortProgressView effortProgress(
            PrdSession session,
            Integer codeScore,
            int deliveryProgress,
            boolean assessmentAvailable) {
        if (session.getDevDocEstimation() == null || session.getDevDocEstimation().isBlank()) {
            return null;
        }
        try {
            JsonNode estimation = objectMapper.readTree(session.getDevDocEstimation());
            long estimatedAt = estimation.path("estimatedAt").asLong(0);
            int hoursMin = Math.max(0, estimation.path("hoursMin").asInt(0));
            int hoursMax = Math.max(hoursMin, estimation.path("hoursMax").asInt(hoursMin));
            if (!estimation.isObject() || estimatedAt <= 0 || hoursMax <= 0) {
                return null;
            }

            List<String> staleReasons = new ArrayList<>();
            String invalidatedReason = estimation.path("invalidatedReason").asText("").trim();
            if (!invalidatedReason.isBlank()) staleReasons.add(invalidatedReason);
            if (session.getPrdGeneratedAt() != null && estimatedAt < session.getPrdGeneratedAt()) {
                staleReasons.add("PRD 晚于原工时评估");
            }
            if (session.getDevDocGeneratedAt() != null && estimatedAt < session.getDevDocGeneratedAt()) {
                staleReasons.add("TDD 晚于原工时评估");
            }

            Integer effectiveCodeScore = assessmentAvailable ? codeScore : null;
            DeliveryMetrics.EffortProjection projection = metrics.effortProjection(
                    hoursMin, hoursMax, effectiveCodeScore);
            return new DeliveryOverviewView.EffortProgressView(
                    projection.baselineHoursMin(),
                    projection.baselineHoursMax(),
                    projection.baselineWorkdaysMin(),
                    projection.baselineWorkdaysMax(),
                    projection.codeProgress(),
                    deliveryProgress,
                    projection.completedHoursMin(),
                    projection.completedHoursMax(),
                    projection.remainingHoursMin(),
                    projection.remainingHoursMax(),
                    projection.remainingWorkdaysMin(),
                    projection.remainingWorkdaysMax(),
                    DeliveryMetrics.AI_HOURS_PER_WORKDAY,
                    estimatedAt,
                    assessmentAvailable ? session.getProgressGeneratedAt() : null,
                    !staleReasons.isEmpty(),
                    staleReasons.stream().distinct().toList());
        } catch (Exception exception) {
            log.warn("解析 AI 工时基线失败, sessionId={}", session.getId(), exception);
            return null;
        }
    }

    private DeliveryOverviewView.StageSetView stages(
            PrdSession session,
            boolean prdComplete,
            boolean tddPresent,
            boolean tddStale,
            boolean assessmentPresent,
            boolean assessmentStale,
            boolean assessmentError,
            Integer codeScore) {
        return new DeliveryOverviewView.StageSetView(
                prdDraftStage(session),
                prdClarifyStage(session),
                new DeliveryOverviewView.StageView(
                        prdComplete ? "COMPLETE" : "MISSING",
                        prdComplete ? 100 : 0,
                        session.getUpdatedAt(),
                        prdComplete ? "PRD 已归档" : "PRD 尚未完成或文件缺失"),
                tddClarifyStage(session, prdComplete, tddPresent),
                new DeliveryOverviewView.StageView(
                        tddStale ? "STALE" : tddPresent ? "COMPLETE" : "MISSING",
                        tddPresent ? 100 : 0,
                        session.getDevDocGeneratedAt(),
                        tddStale ? "开发文档早于最新 PRD" : tddPresent ? "开发文档已生成" : "尚未生成开发文档"),
                new DeliveryOverviewView.StageView(
                        codeStage(assessmentPresent, assessmentStale, assessmentError, codeScore),
                        codeScore,
                        session.getProgressGeneratedAt(),
                        codeNote(assessmentPresent, assessmentStale, assessmentError, codeScore)),
                new DeliveryOverviewView.StageView(
                        "UNAVAILABLE", null, null, "待接入测试报告"),
                new DeliveryOverviewView.StageView(
                        "UNAVAILABLE", null, null, "待接入部署与运行数据"));
    }

    private DeliveryOverviewView.StageView prdDraftStage(PrdSession session) {
        boolean hasDraft = session.getRawInput() != null && !session.getRawInput().isBlank();
        return new DeliveryOverviewView.StageView(
                hasDraft ? "COMPLETE" : "MISSING",
                hasDraft ? 100 : 0,
                session.getCreatedAt(),
                hasDraft ? "需求草稿已保存" : "需求草稿内容为空");
    }

    private DeliveryOverviewView.StageView prdClarifyStage(PrdSession session) {
        String status = session.getStatus();
        if ("DRAFT".equals(status)) {
            return new DeliveryOverviewView.StageView(
                    "MISSING", 0, session.getUpdatedAt(), "尚未开始 PRD 业务澄清");
        }
        if ("ERROR".equals(status)) {
            return new DeliveryOverviewView.StageView(
                    "ERROR", clarificationProgress(session), session.getUpdatedAt(), "PRD 澄清执行失败");
        }
        if ("CLARIFYING".equals(status)) {
            int score = clarificationProgress(session);
            return new DeliveryOverviewView.StageView(
                    "PARTIAL", score, session.getUpdatedAt(),
                    score > 0 ? "正在核对 PRD 必须明确的业务问题" : "等待核对 PRD 业务问题");
        }
        return new DeliveryOverviewView.StageView(
                "COMPLETE", 100, session.getUpdatedAt(), "PRD 业务目标、范围和规则已确认");
    }

    private DeliveryOverviewView.StageView tddClarifyStage(
            PrdSession session, boolean prdComplete, boolean tddPresent) {
        if (!prdComplete) {
            return new DeliveryOverviewView.StageView(
                    "UNAVAILABLE", null, null, "请先完成 PRD 与业务澄清");
        }
        boolean recorded = hasRecordedTddClarification(session.getDevDocHistory());
        if (recorded) {
            return new DeliveryOverviewView.StageView(
                    "COMPLETE", 100, session.getDevDocGeneratedAt(), "编码前关键技术决策已由开发者确认");
        }
        if (tddPresent) {
            return new DeliveryOverviewView.StageView(
                    "PARTIAL", 50, session.getDevDocGeneratedAt(), "旧版 TDD 未记录生成前技术澄清");
        }
        return new DeliveryOverviewView.StageView(
                "MISSING", 0, null, "待核对编码前必须明确的关键技术细节");
    }

    private int clarificationProgress(PrdSession session) {
        int total = Math.max(1, session.getMaxQuestions());
        int answered = 0;
        try {
            JsonNode questions = objectMapper.readTree(session.getQuestions());
            if (questions != null && questions.isArray()) {
                for (JsonNode question : questions) {
                    if (!question.path("answer").asText("").isBlank()) {
                        answered++;
                    }
                }
            }
        } catch (Exception ignored) {
            // 历史脏数据不影响交付看板，按尚未回答展示。
        }
        return Math.min(99, Math.round(answered * 100f / total));
    }

    private boolean hasRecordedTddClarification(String historyJson) {
        if (historyJson == null || historyJson.isBlank()) {
            return false;
        }
        try {
            JsonNode history = objectMapper.readTree(historyJson);
            if (history == null || !history.isArray()) {
                return false;
            }
            for (JsonNode version : history) {
                if (version.path("clarificationCompleted").asBoolean(false)
                        || (version.path("qaHistory").isArray() && !version.path("qaHistory").isEmpty())) {
                    return true;
                }
            }
        } catch (Exception ignored) {
            // 旧版历史无法解析时按未记录澄清处理。
        }
        return false;
    }

    private String codeStage(
            boolean assessmentPresent,
            boolean assessmentStale,
            boolean assessmentError,
            Integer codeScore) {
        if (assessmentError) {
            return "ERROR";
        }
        if (!assessmentPresent || codeScore == null) {
            return "UNAVAILABLE";
        }
        if (assessmentStale) {
            return "STALE";
        }
        return codeScore >= 100 ? "COMPLETE" : "PARTIAL";
    }

    private String codeNote(
            boolean assessmentPresent,
            boolean assessmentStale,
            boolean assessmentError,
            Integer codeScore) {
        if (assessmentError) {
            return "进度报告读取或解析失败";
        }
        if (!assessmentPresent) {
            return "尚未执行代码进度评估";
        }
        if (codeScore == null) {
            return "报告中没有可统计的功能点";
        }
        return assessmentStale ? "代码评估早于最新文档" : "基于最新进度评估";
    }

    private List<DeliveryOverviewView.FindingView> findings(
            DeliveryOverviewView.RequirementView requirement,
            boolean prdComplete,
            boolean tddPresent,
            boolean tddStale,
            boolean assessmentPresent,
            boolean assessmentStale,
            boolean assessmentError,
            int evidenceGapCount) {
        List<DeliveryOverviewView.FindingView> findings = new ArrayList<>();
        if (!prdComplete) {
            addFinding(findings, requirement, "DOCUMENT_GAP", "HIGH", "PRD 尚未形成可归档事实",
                    "会话状态或 PRD 文件未完成", "返回 PRD 澄清助手完成并保存 PRD");
        }
        if (prdComplete && !tddPresent) {
            addFinding(findings, requirement, "DOCUMENT_GAP", "HIGH", "缺少开发文档",
                    "PRD 已完成，但尚未生成 TDD", "基于最新 PRD 生成开发文档");
        }
        if (tddStale) {
            addFinding(findings, requirement, "DOCUMENT_STALE", "HIGH", "开发文档已经过期",
                    "开发文档生成时间早于 PRD 更新时间", "先同步开发文档再继续评估");
        }
        if (tddPresent && !assessmentPresent) {
            addFinding(findings, requirement, "ASSESSMENT_GAP", "MEDIUM", "缺少代码进度评估",
                    "已有开发文档，但没有代码核对报告", "执行一次 AI 进度评估");
        }
        if (assessmentStale) {
            addFinding(findings, requirement, "ASSESSMENT_STALE", "HIGH", "代码进度评估已经过期",
                    "评估时间早于最新 PRD 或开发文档", "重新执行进度评估校准真实状态");
        }
        if (assessmentError) {
            addFinding(findings, requirement, "SOURCE_ERROR", "HIGH", "进度报告无法读取",
                    "磁盘文件缺失、损坏或格式不可解析", "检查报告文件后重新评估");
        }
        if (assessmentPresent) {
            for (DeliveryOverviewView.ProgressItemView item : requirement.progressItems().missing()) {
                addFinding(findings, requirement, "IMPLEMENTATION_GAP", "HIGH", item.title() + " 尚未实现",
                        firstNonBlank(item.actual(), "最新评估未找到对应代码实现"),
                        "回到开发会话补齐后重新评估");
            }
            for (DeliveryOverviewView.ProgressItemView item : requirement.progressItems().partial()) {
                addFinding(findings, requirement, "PARTIAL_IMPLEMENTATION", "MEDIUM", item.title() + " 仅部分实现",
                        firstNonBlank(item.missing(), "最新评估仍存在缺失项"),
                        "补齐缺失分支并增加对应验证");
            }
        }
        if (evidenceGapCount > 0) {
            addFinding(findings, requirement, "EVIDENCE_GAP", "MEDIUM", "源码证据未通过验证",
                    evidenceGapCount + " 个证据坐标缺失、越界或无法读取",
                    "重新评估并提供项目根内可验证的文件与行范围");
        }
        for (DeliveryOverviewView.AlignmentFindingView item : requirement.alignmentFindings()) {
            if (!isCompleteStatus(item.status())) {
                addFinding(findings, requirement, "ALIGNMENT_GAP", "HIGH", item.requirement() + " 与文档存在偏差",
                        item.actual(), "按文档要求修正实现或确认更新 PRD");
            }
        }
        return List.copyOf(findings);
    }

    private void addFinding(
            List<DeliveryOverviewView.FindingView> findings,
            DeliveryOverviewView.RequirementView requirement,
            String type,
            String severity,
            String title,
            String evidence,
            String recommendation) {
        findings.add(new DeliveryOverviewView.FindingView(
                requirement.id() + ":" + type.toLowerCase(Locale.ROOT) + ":" + findings.size(),
                requirement.id(),
                type,
                severity,
                title,
                evidence,
                recommendation));
    }

    private DeliveryOverviewView.SummaryView summary(
            List<DeliveryOverviewView.RequirementView> requirements,
            List<DeliveryOverviewView.FindingView> findings) {
        if (requirements.isEmpty()) {
            return new DeliveryOverviewView.SummaryView(
                    0, 0, 0, null, 0, 0, 0, 0, "E",
                    0, 0, 0, 0, 0);
        }

        int prdCompletion = average(requirements.stream().map(item -> item.stages().prd().score()).toList());
        int tddCompletion = average(requirements.stream().map(item -> item.stages().tdd().score()).toList());
        Integer codeProgress = averageNullable(requirements.stream().map(item -> item.stages().code().score()).toList());
        int assessed = (int) requirements.stream().filter(item -> item.stages().code().score() != null).count();
        int assessmentCoverage = Math.round(assessed * 100F / requirements.size());
        int overallProgress = average(requirements.stream()
                .map(DeliveryOverviewView.RequirementView::overallProgress)
                .toList());
        int confidence = average(requirements.stream().map(DeliveryOverviewView.RequirementView::confidence).toList());
        int health = average(requirements.stream().map(DeliveryOverviewView.RequirementView::healthScore).toList());
        int completed = requirements.stream().mapToInt(item -> item.coverage().completed()).sum();
        int partial = requirements.stream().mapToInt(item -> item.coverage().partial()).sum();
        int missing = requirements.stream().mapToInt(item -> item.coverage().missing()).sum();
        int unassessed = requirements.size() - assessed;
        int highRisk = (int) findings.stream().filter(item -> "HIGH".equals(item.severity())).count();

        return new DeliveryOverviewView.SummaryView(
                requirements.size(), prdCompletion, tddCompletion, codeProgress, assessmentCoverage,
                overallProgress, confidence, health, metrics.grade(health),
                completed, partial, missing, unassessed, highRisk);
    }

    private DeliveryOverviewView.FilterOptionsView filterOptions(List<PrdSession> sessions) {
        List<String> projects = sessions.stream()
                .map(PrdSession::getProject)
                .filter(value -> value != null && !value.isBlank())
                .distinct()
                .sorted()
                .toList();
        List<String> modules = sessions.stream()
                .map(PrdSession::getModule)
                .filter(value -> value != null && !value.isBlank())
                .distinct()
                .sorted()
                .toList();
        return new DeliveryOverviewView.FilterOptionsView(projects, modules);
    }

    private boolean matches(PrdSession session, String project, String module, String query) {
        if (hasText(project) && !project.equals(session.getProject())) {
            return false;
        }
        if (hasText(module) && !module.equals(session.getModule())) {
            return false;
        }
        if (!hasText(query)) {
            return true;
        }
        String keyword = query.trim().toLowerCase(Locale.ROOT);
        return contains(session.getTitle(), keyword)
                || contains(session.getProject(), keyword)
                || contains(session.getModule(), keyword);
    }

    private boolean contains(String value, String keyword) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(keyword);
    }

    private boolean fileExists(String path) {
        if (!hasText(path)) {
            return false;
        }
        try {
            return Files.isRegularFile(Path.of(path));
        } catch (Exception exception) {
            return false;
        }
    }

    private DeliveryOverviewView.RequirementLinksView links(PrdSession session) {
        String developmentLink = hasText(session.getDevSessionId())
                ? "/tools/claude-chat?sessionId="
                        + URLEncoder.encode(session.getDevSessionId(), StandardCharsets.UTF_8)
                : null;
        return new DeliveryOverviewView.RequirementLinksView(
                "/tools/prd-clarify?viewSession=" + session.getId(),
                developmentLink,
                "/tools/project-workspace");
    }

    private List<DeliveryOverviewView.ProgressItemView> progressItems(
            List<ProgressReportParser.ProgressItem> items) {
        return items.stream()
                .map(item -> new DeliveryOverviewView.ProgressItemView(
                        item.title(),
                        item.evidence(),
                        item.implemented(),
                        item.missing(),
                        item.expected(),
                        item.actual(),
                        item.testItem(),
                        item.unitTest()))
                .toList();
    }

    private ClaimAssessment claimAssessment(String sessionId, boolean legacyAssessmentPresent) {
        List<DeliveryClaim> claims = artifactRepository.findLatest(sessionId, PrdArtifactType.PROGRESS)
                .filter(artifact -> artifact.state() == PrdArtifactState.READY)
                .map(artifact -> claimLedgerService.findByArtifact(artifact.id()))
                .orElseGet(List::of);
        if (claims.isEmpty()) {
            return ClaimAssessment.empty(legacyAssessmentPresent ? "LEGACY_UNVERIFIED" : "UNASSESSED");
        }

        int completed = countClaims(claims, DeliveryClaimStatus.COMPLETED, false);
        int partial = countClaims(claims, DeliveryClaimStatus.PARTIAL, false);
        int missing = countClaims(claims, DeliveryClaimStatus.MISSING, false);
        int completedWithoutTests = countClaims(claims, DeliveryClaimStatus.COMPLETED, true);
        int partialWithoutTests = countClaims(claims, DeliveryClaimStatus.PARTIAL, true);
        int missingWithoutTests = countClaims(claims, DeliveryClaimStatus.MISSING, true);
        int nonTestTotal = completedWithoutTests + partialWithoutTests + missingWithoutTests;
        Integer scoreWithoutTests = nonTestTotal == 0
                ? 100
                : metrics.codeProgress(completedWithoutTests, partialWithoutTests, missingWithoutTests);
        int verifiedClaimCount = (int) claims.stream()
                .filter(this::hasVerifiedEvidence)
                .count();
        int invalidEvidenceCount = claims.stream()
                .mapToInt(claim -> (int) claim.evidences().stream()
                        .filter(evidence -> evidence.status() != DeliveryEvidenceStatus.VERIFIED)
                        .count())
                .sum();
        int testItemCount = (int) claims.stream().filter(DeliveryClaim::testItem).count();
        return new ClaimAssessment(
                true,
                "VERIFIED_LEDGER",
                completed,
                partial,
                missing,
                metrics.codeProgress(completed, partial, missing),
                scoreWithoutTests,
                testItemCount,
                verifiedClaimCount,
                invalidEvidenceCount);
    }

    private int countClaims(List<DeliveryClaim> claims, DeliveryClaimStatus status, boolean excludeTests) {
        return (int) claims.stream()
                .filter(claim -> claim.status() == status)
                .filter(claim -> !excludeTests || !claim.testItem())
                .count();
    }

    private boolean hasVerifiedEvidence(DeliveryClaim claim) {
        return claim.evidences().stream()
                .anyMatch(evidence -> evidence.status() == DeliveryEvidenceStatus.VERIFIED);
    }

    private Integer verificationScore(Optional<DeliveryVerificationService.RunProjection> projection) {
        if (projection.isEmpty() || projection.get().stale()) {
            return null;
        }
        return switch (projection.get().run().status()) {
            case SUCCEEDED -> 100;
            case FAILED, ERROR -> 0;
            case RUNNING -> null;
        };
    }

    private DeliveryOverviewView.VerificationRunView verificationView(
            DeliveryVerificationService.RunProjection projection) {
        var run = projection.run();
        return new DeliveryOverviewView.VerificationRunView(
                run.id(), run.commandId(), run.gitHead(), run.status().name(), run.exitCode(),
                run.testCount(), run.outputSummary(), run.lastError(), run.startedAt(), run.finishedAt(),
                projection.stale());
    }

    private int countNonTests(List<ProgressReportParser.ProgressItem> items) {
        return (int) items.stream().filter(item -> !item.testItem()).count();
    }

    private Integer codeProgressWithoutTests(ProgressReportParser.ParsedProgressReport report) {
        int completed = countNonTests(report.completed());
        int partial = countNonTests(report.partial());
        int missing = countNonTests(report.missing());
        if (completed + partial + missing == 0
                && (report.total() > 0 || countTests(report.excluded()) > 0)) {
            return 100;
        }
        return metrics.codeProgress(completed, partial, missing);
    }

    private int countTests(List<ProgressReportParser.ProgressItem> items) {
        return (int) items.stream().filter(ProgressReportParser.ProgressItem::testItem).count();
    }

    private int countUnitTests(List<ProgressReportParser.ProgressItem> items) {
        return (int) items.stream().filter(ProgressReportParser.ProgressItem::unitTest).count();
    }

    private List<String> staleReasons(boolean tddStale, boolean assessmentStale, boolean assessmentError) {
        List<String> reasons = new ArrayList<>();
        if (tddStale) {
            reasons.add("开发文档早于最新 PRD");
        }
        if (assessmentStale) {
            reasons.add("进度评估早于最新文档");
        }
        if (assessmentError) {
            reasons.add("进度报告读取失败");
        }
        return List.copyOf(reasons);
    }

    private String blankAsUnassigned(String value) {
        return hasText(value) ? value : "未归档";
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private String firstNonBlank(String value, String fallback) {
        return hasText(value) ? value : fallback;
    }

    private boolean isCompleteStatus(String status) {
        if (status == null) {
            return false;
        }
        String normalized = status.toLowerCase(Locale.ROOT);
        if (normalized.contains("未完成") || normalized.contains("部分")
                || normalized.contains("缺失") || normalized.contains("偏差")) {
            return false;
        }
        return normalized.contains("完成") || normalized.contains("一致") || normalized.contains("已实现");
    }

    private int severityRank(String severity) {
        return switch (severity) {
            case "HIGH" -> 0;
            case "MEDIUM" -> 1;
            default -> 2;
        };
    }

    private int average(List<Integer> values) {
        return values.isEmpty()
                ? 0
                : (int) Math.round(values.stream().mapToInt(Integer::intValue).average().orElse(0));
    }

    private Integer averageNullable(List<Integer> values) {
        List<Integer> known = values.stream().filter(Objects::nonNull).toList();
        return known.isEmpty() ? null : average(known);
    }

    private record RequirementProjection(
            DeliveryOverviewView.RequirementView requirement,
            List<DeliveryOverviewView.FindingView> findings) {
    }

    private record ClaimAssessment(
            boolean ledgerPresent,
            String evidenceMode,
            int completed,
            int partial,
            int missing,
            Integer codeScore,
            Integer codeScoreWithoutTests,
            int testItemCount,
            int verifiedClaimCount,
            int invalidEvidenceCount) {

        private static ClaimAssessment empty(String evidenceMode) {
            return new ClaimAssessment(false, evidenceMode, 0, 0, 0,
                    null, null, 0, 0, 0);
        }

        private int total() {
            return completed + partial + missing;
        }
    }
}
