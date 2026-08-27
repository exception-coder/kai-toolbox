package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.llm.spi.LocalProjectResolver;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceQuery;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceQueryPort;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactType;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdDiscoveryRunRepository;
import com.exceptioncoder.toolbox.prdclarify.spi.InitialSpecPlanningGateway;
import com.exceptioncoder.toolbox.prdclarify.spi.InitialSpecPlanningRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.ObjectProvider;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

/** 编排 PRD 探索证据并生成可审阅的初始化规格。 */
@Slf4j
@Service
public class PrdDiscoveryService implements ProjectEvidenceQueryPort {

    public static final String PROMPT_VERSION = "initial-spec-discovery-v3";

    private static final String SYSTEM_PROMPT = """
            直接输出一份 Markdown 初始化规格，不进入交互，不编造未提供的事实。你可以使用 Vibe Coding
            提供的只读工具继续核验当前项目，但不得修改代码、数据库或项目文件。
            首要任务是用系统预查证据尽可能消除不确定性，不得把可从证据确认的信息转成用户问题。
            你收到的模块业务知识、代码图谱、关键 DDL 和路由映射均由系统预先查询。Graphify 只证明
            结构导航，DDL 只证明表、字段、索引和约束等实现结构，路由映射只证明入口关联；只有明确
            给出的业务知识、用户输入和源码证据才能写成已确认的业务事实。

            不要把用户提出的功能做法直接当成最终需求。先识别其真正要改善的业务结果，再审视原做法
            是否引入了重复流程、非必要状态、过度配置、提前泛化或基于错误假设的复杂度。优先复用
            已有能力，默认推荐最简单、可验证、可回退的方案；原做法确实更合适时明确说明保留理由，
            不得为了展示创造力而强行增加方案或架构。

            固定结构：
            # [功能名称] · 初始化规格
            ## 1. 探索摘要
            ## 2. 目标与范围草案
            ## 3. 现有行为、数据结构与约束
            ## 4. 需求重构与推荐方案
            ### 4.1 原始做法与真实目标
            ### 4.2 复杂度审计
            ### 4.3 候选方案
            ### 4.4 推荐结论
            ## 5. 需求与规则草案
            ## 6. 场景与验收草案
            ## 7. 证据账本
            ## 8. 风险与冲突
            ## 9. 开放问题

            使用 GOAL/FACT/ASSUMPTION/OPT/REC/REQ/RULE/SCN/AC/CONSTRAINT/OPEN 稳定 ID。证据使用
            EVD-001 起，记录来源类型、来源位置、支持的结论和可信等级。至少给出一个 OPT 候选方案和
            一个 REC 推荐结论；推荐必须说明收益、代价、风险、采用的证据和未确认的假设。FACT 只能
            引用可追溯证据，ASSUMPTION 必须显式标记，无法确认的业务取舍写入 OPEN，不得以建议冒充事实。
            开放问题只保留会影响目标、范围、规则或验收结果且必须由用户决定的事项。不得为了完整感
            或继续对话而提问；能以证据、合理约束或风险记录处理的事项不提问。开放问题通常为 0-3 个，
            最多 5 个；没有必须由用户决定的事项时明确写“无”。
            """;

    private final PrdSessionRepository repository;
    private final PrdDiscoveryRunRepository discoveryRunRepository;
    private final PrdEvidenceOrchestrationService evidenceOrchestration;
    private final AgentOneShotRunner agentRunner;
    private final PrdImageInputResolver imageInputResolver;
    private final PrdArtifactService artifactService;
    private final List<InitialSpecPlanningGateway> planningGateways;
    private final ObjectProvider<LocalProjectResolver> localProjectResolver;

    public PrdDiscoveryService(PrdSessionRepository repository,
                               PrdDiscoveryRunRepository discoveryRunRepository,
                               PrdEvidenceOrchestrationService evidenceOrchestration,
                               AgentOneShotRunner agentRunner,
                               PrdImageInputResolver imageInputResolver,
                               PrdArtifactService artifactService,
                               List<InitialSpecPlanningGateway> planningGateways,
                               ObjectProvider<LocalProjectResolver> localProjectResolver) {
        this.repository = repository;
        this.discoveryRunRepository = discoveryRunRepository;
        this.evidenceOrchestration = evidenceOrchestration;
        this.agentRunner = agentRunner;
        this.imageInputResolver = imageInputResolver;
        this.artifactService = artifactService;
        this.planningGateways = List.copyOf(planningGateways);
        this.localProjectResolver = localProjectResolver;
    }

    /** 在后台线程准备证据上下文；浏览器请求不等待这些查询。 */
    public DiscoveryContext prepare(String sessionId) {
        PrdSession session = findSession(sessionId);
        EvidenceContext evidence = collectEvidence(session);
        String prompt = buildPrompt(session, evidence.evidenceText(), evidence.traceJson());
        Optional<LocalProjectResolver.ProjectLocation> projectLocation = resolveProject(session.getProject());
        return new DiscoveryContext(session, prompt, projectLocation.map(LocalProjectResolver.ProjectLocation::path)
                .orElse(null), imageInputResolver.resolve(session.getRawInput()), evidence.traceJson());
    }

    /** 通过 Vibe Coding Agent 执行一次完整规格生成或带缺口的 ReAct 修复。 */
    public DiscoveryAttempt generate(
            DiscoveryContext context,
            int attempt,
            String previousOutput,
            List<String> gaps
    ) {
        String prompt = context.prompt();
        if (attempt > 1) {
            prompt += "\n\n【上一次输出】\n" + bounded(previousOutput, 60_000)
                    + "\n\n【服务端完成性检查未通过】\n- " + String.join("\n- ", gaps)
                    + "\n\n请基于同一证据重新输出完整 Markdown，不要只输出补丁或解释。";
        }
        AgentOneShotRunner.ExecutionRequest request = new AgentOneShotRunner.ExecutionRequest(
                SYSTEM_PROMPT, prompt, context.cwd(), context.session().getModel(),
                normalizeEngine(context.session().getEngine()),
                "codex".equals(normalizeEngine(context.session().getEngine())) ? "medium" : null,
                null, null, null, null,
                context.cwd() == null
                        ? AgentOneShotRunner.TOOL_POLICY_DISABLED
                        : AgentOneShotRunner.TOOL_POLICY_CONSULT_READONLY);
        AgentOneShotRunner.ObservedResult observed = agentRunner.runObserved(request, context.images());
        return new DiscoveryAttempt(observed.text(), observed.executionSessionId(), observed.traceId());
    }

    /** 只有通过服务端完成性检查的正文才登记为初始化规格。 */
    public void publish(String sessionId, String content) {
        try {
            artifactService.write(sessionId, PrdArtifactType.INITIAL_SPEC, content,
                    new PrdArtifactService.ArtifactMetadata(null, PROMPT_VERSION));
        } catch (IOException error) {
            throw new IllegalStateException("初始化规格落盘失败", error);
        }
    }

    private Optional<LocalProjectResolver.ProjectLocation> resolveProject(String project) {
        LocalProjectResolver resolver = localProjectResolver.getIfAvailable();
        return resolver == null || project == null || project.isBlank()
                ? Optional.empty() : resolver.resolve(project);
    }

    private static String bounded(String value, int maxLength) {
        if (value == null) return "";
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }

    public record DiscoveryContext(
            PrdSession session,
            String prompt,
            String cwd,
            List<AgentOneShotRunner.ImageInput> images,
            String evidenceTraceJson
    ) {
    }

    public record DiscoveryAttempt(String output, String vibeSessionId, String traceId) {
    }

    private record EvidenceContext(String evidenceText, String traceJson) {
    }

    /** 读取当前初始化规格。 */
    public String read(String sessionId) throws IOException {
        PrdSession session = findSession(sessionId);
        if (session.getInitialSpecPath() == null || session.getInitialSpecPath().isBlank()) {
            return "";
        }
        return Files.readString(Path.of(session.getInitialSpecPath()));
    }

    /** 保存用户审阅后的初始化规格新版本。 */
    public void save(String sessionId, String content) throws IOException {
        PrdSession session = findSession(sessionId);
        if (!"SPEC_REVIEW".equals(session.getStatus())) {
            throw new IllegalStateException("当前状态不允许保存初始化规格: " + session.getStatus());
        }
        artifactService.write(sessionId, PrdArtifactType.INITIAL_SPEC, value(content),
                PrdArtifactService.ArtifactMetadata.empty());
    }

    /** 确认初始化规格并进入核心规格生成。 */
    public PrdSession confirm(String sessionId) {
        PrdSession session = findSession(sessionId);
        if (!"SPEC_REVIEW".equals(session.getStatus())) {
            throw new IllegalStateException("当前状态不允许确认初始化规格: " + session.getStatus());
        }
        String initialSpec;
        try {
            initialSpec = read(sessionId);
        } catch (IOException error) {
            throw new IllegalStateException("读取待确认初始化规格失败", error);
        }
        if (initialSpec.isBlank()) {
            throw new IllegalStateException("初始化规格为空，无法确认");
        }
        schedulePlanning(session, initialSpec);
        repository.updateStatus(sessionId, "GENERATING");
        return findSession(sessionId);
    }

    private void schedulePlanning(PrdSession session, String initialSpec) {
        String evidenceTrace = discoveryRunRepository.findLatestBySessionId(session.getId())
                .map(com.exceptioncoder.toolbox.prdclarify.domain.PrdDiscoveryRun::evidenceTraceJson)
                .filter(value -> value != null && !value.isBlank())
                .orElseGet(() -> collectEvidence(session).traceJson());
        InitialSpecPlanningRequest request = new InitialSpecPlanningRequest(
                session.getId(), session.getSourceReqItemId(), session.getTitle(), session.getRawInput(),
                session.getProject(), session.getModule(), session.getReqType(), session.getModel(),
                session.getEngine(), initialSpec, evidenceTrace);
        for (InitialSpecPlanningGateway gateway : planningGateways) {
            try {
                gateway.schedule(request);
            } catch (RuntimeException error) {
                log.warn("[prd-planning] 规划任务登记失败，核心规格流程继续 sessionId={}", session.getId(), error);
            }
        }
    }

    private EvidenceContext collectEvidence(PrdSession session) {
        PrdEvidenceOrchestrationService.DiscoveryResult result = evidenceOrchestration.discover(session);
        return new EvidenceContext(result.evidenceText(), result.traceJson());
    }

    @Override
    public String queryTrace(ProjectEvidenceQuery query) {
        return evidenceOrchestration.discover(query, "VALUE_ANALYSIS").traceJson();
    }

    private String buildPrompt(PrdSession session, String evidenceText, String traceJson) {
        return "功能标题：" + session.getTitle() + "\n"
                + "项目：" + value(session.getProject()) + "\n"
                + "模块：" + value(session.getModule()) + "\n\n"
                + "【用户输入】\n" + value(session.getRawInput()) + "\n\n"
                + "【跨项目证据账本摘要】\n" + unavailable(evidenceText) + "\n\n"
                + "【证据轨迹引用】\n" + value(traceJson) + "\n";
    }

    private PrdSession findSession(String sessionId) {
        return repository.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
    }

    private static String unavailable(String value) {
        return value.isBlank() ? "未获得该类证据，请在规格中明确记录缺失。" : value;
    }

    private static String normalizeEngine(String engine) {
        return "codex".equalsIgnoreCase(engine) ? "codex" : "claude";
    }

    private static String value(String value) {
        return value == null ? "" : value;
    }
}
