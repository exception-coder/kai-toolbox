package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.domain.DocumentProfile;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * 需求拆分用例服务：负责拆分预览分析，以及把用户确认的拆分项采纳为子需求草稿。
 */
@Service
public class PrdRequirementSplitService {

    private static final String SPLIT_SYSTEM = """
            你是资深产品经理，负责判断一个需求是否"过大"，需要拆分成多个可以独立澄清、独立开发的子需求。

            判断标准：
            - 需求描述里明显包含多个彼此独立的功能点/子系统/用户旅程，且拆开后每个子需求可以
              单独验收、单独排期，就应该拆分
            - 如果需求本身已经足够聚焦（单一功能点、单一用户旅程），不要为了拆而拆，canSplit 给 false

            拆分要求（canSplit=true 时）：
            - 每个子需求要能独立被理解和澄清——rawInput 要重新组织成完整、自洽的描述，不能写
              "见原需求第2点"这种依赖上下文的片段，因为子需求之后会独立走一遍需求澄清流程，
              不会带着原始大需求的上下文
            - 子需求数量控制在 2-6 个，拆得过细没有意义
            - title 简短（不超过 30 字），一眼看出这个子需求是做什么的
            - module 可选：能从描述判断这个子需求主要落在哪个模块就填，不确定就留空字符串

            【严格输出要求】只输出一个 JSON 对象，不加任何说明、前言、结语或 markdown 围栏：
            {"canSplit":true或false,"reason":"一两句话说明为什么拆/为什么不拆","items":[{"title":"...","rawInput":"...","module":"..."}]}
            canSplit=false 时 items 给空数组 []。
            """;

    private final AgentOneShotRunner agentRunner;
    private final PrdSessionRepository repo;
    private final ObjectMapper mapper;
    private final GraphifyQueryService graphifyQuery;
    private final DomainKnowledgeQueryService domainKnowledgeQuery;

    public PrdRequirementSplitService(AgentOneShotRunner agentRunner,
                                      PrdSessionRepository repo,
                                      ObjectMapper mapper,
                                      GraphifyQueryService graphifyQuery,
                                      DomainKnowledgeQueryService domainKnowledgeQuery) {
        this.agentRunner = agentRunner;
        this.repo = repo;
        this.mapper = mapper;
        this.graphifyQuery = graphifyQuery;
        this.domainKnowledgeQuery = domainKnowledgeQuery;
    }

    public record SplitItem(String title, String rawInput, String module) {
    }

    public record SplitResult(boolean canSplit, String reason, List<SplitItem> items) {
    }

    /** 只读分析当前需求是否需要拆分，不修改原会话。 */
    public SplitResult split(String sessionId) {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        if (session.getRawInput() == null || session.getRawInput().isBlank()) {
            throw new IllegalStateException("需求描述为空，无法拆分");
        }
        String raw = agentRunner.runOnce(SPLIT_SYSTEM, buildPrompt(session), session.getModel(),
                normalizeEngine(session.getEngine()));
        return parseResult(raw);
    }

    /** 把用户确认的有效拆分项采纳为当前会话的子需求草稿。 */
    public List<PrdSession> adopt(String parentId, List<SplitItem> items, Long createdByUserId) {
        PrdSession parent = repo.findById(parentId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + parentId));
        long now = System.currentTimeMillis();
        List<PrdSession> created = new ArrayList<>();
        for (SplitItem item : items) {
            if (item.title() == null || item.title().isBlank()
                    || item.rawInput() == null || item.rawInput().isBlank()) {
                continue;
            }
            PrdSession child = PrdSession.builder()
                    .id(UUID.randomUUID().toString())
                    .title(item.title().trim())
                    .rawInput(item.rawInput().trim())
                    .project(parent.getProject())
                    .module((item.module() == null || item.module().isBlank()) ? parent.getModule() : item.module())
                    .role("PRODUCT")
                    .reqType(PrdRequirementTypeResolver.NEW_MODULE)
                    .maxQuestions(PrdRequirementTypeResolver.defaultMaxQuestions(
                            PrdRequirementTypeResolver.NEW_MODULE))
                    .clarifyMode("progressive")
                    .documentProfile(DocumentProfile.normalize(parent.getDocumentProfile()))
                    .status("DRAFT")
                    .parentId(parentId)
                    .createdByUserId(createdByUserId)
                    .createdAt(now)
                    .updatedAt(now)
                    .build();
            repo.insert(child);
            created.add(child);
        }
        if (created.isEmpty()) {
            throw new IllegalArgumentException("未选择任何有效子需求");
        }
        return created;
    }

    private String buildPrompt(PrdSession session) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("需求标题：").append(session.getTitle()).append("\n");
        if (session.getProject() != null && !session.getProject().isBlank()) {
            prompt.append("关联项目：").append(session.getProject());
            if (session.getModule() != null && !session.getModule().isBlank()) {
                prompt.append(" / ").append(session.getModule());
            }
            prompt.append("\n");
        }
        prompt.append("\n【需求描述】\n").append(session.getRawInput()).append("\n");
        appendGraphContext(prompt, queryGraphContext(session.getProject(), session.getModule(), session.getTitle()));
        appendDomainContext(prompt, queryDomainContext(session.getProject(), session.getTitle()));
        prompt.append("\n请判断是否需要拆分，严格按系统提示的 JSON 结构输出。");
        return prompt.toString();
    }

    private SplitResult parseResult(String raw) {
        JsonNode node;
        try {
            node = mapper.readTree(stripFence(raw == null ? "" : raw.trim()));
        } catch (Exception e) {
            throw new IllegalStateException("需求拆分结果解析失败，请重试: " + e.getMessage(), e);
        }
        if (!node.isObject()) {
            throw new IllegalStateException("需求拆分结果格式不正确，请重试");
        }
        boolean canSplit = node.path("canSplit").asBoolean(false);
        String reason = node.path("reason").asText("");
        List<SplitItem> items = new ArrayList<>();
        for (JsonNode item : node.path("items")) {
            String title = item.path("title").asText("").trim();
            String rawInput = item.path("rawInput").asText("").trim();
            if (title.isEmpty() || rawInput.isEmpty()) {
                continue;
            }
            String module = item.path("module").asText("").trim();
            items.add(new SplitItem(title, rawInput, module.isEmpty() ? null : module));
        }
        if (canSplit && items.isEmpty()) {
            canSplit = false;
            reason = reason.isBlank() ? "拆分结果解析异常，未获得有效子需求" : reason;
        }
        if (items.size() > 8) {
            items = items.subList(0, 8);
        }
        return new SplitResult(canSplit, reason, items);
    }

    private Optional<String> queryGraphContext(String project, String module, String title) {
        List<String> projects = splitProjects(project);
        if (projects.size() <= 1) {
            String selectedProject = projects.isEmpty() ? null : projects.get(0);
            return Optional.ofNullable(graphifyQuery.query(selectedProject, module, title));
        }
        StringBuilder merged = new StringBuilder();
        for (String selectedProject : projects) {
            appendProjectResult(merged, selectedProject,
                    graphifyQuery.query(selectedProject, module, title));
        }
        return merged.isEmpty() ? Optional.empty() : Optional.of(merged.toString());
    }

    private Optional<String> queryDomainContext(String project, String title) {
        List<String> projects = splitProjects(project);
        if (projects.size() <= 1) {
            String selectedProject = projects.isEmpty() ? null : projects.get(0);
            return Optional.ofNullable(domainKnowledgeQuery.query(selectedProject, title));
        }
        StringBuilder merged = new StringBuilder();
        for (String selectedProject : projects) {
            appendProjectResult(merged, selectedProject,
                    domainKnowledgeQuery.query(selectedProject, title));
        }
        return merged.isEmpty() ? Optional.empty() : Optional.of(merged.toString());
    }

    private static List<String> splitProjects(String project) {
        if (project == null || project.isBlank()) {
            return List.of();
        }
        return Arrays.stream(project.split("[,，、]"))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .distinct()
                .toList();
    }

    private static void appendProjectResult(StringBuilder merged, String project, String result) {
        if (result == null || result.isBlank()) {
            return;
        }
        if (!merged.isEmpty()) {
            merged.append("\n\n");
        }
        merged.append("--- 项目 ").append(project).append(" ---\n").append(result);
    }

    private static void appendGraphContext(StringBuilder prompt, Optional<String> context) {
        if (context.isPresent() && !context.get().isBlank()) {
            prompt.append("\n【代码知识图谱查询结果】（系统已直接调用 graphify CLI 查询，非 MCP，内容为真实代码事实）\n")
                    .append(context.get()).append("\n");
        }
    }

    private static void appendDomainContext(StringBuilder prompt, Optional<String> context) {
        if (context.isPresent() && !context.get().isBlank()) {
            prompt.append("\n【业务知识图谱查询结果】（系统已直接检索 project-domain-knowledge 库，内容为团队沉淀的业务真理，可信）\n")
                    .append(context.get()).append("\n");
        }
    }

    private static String normalizeEngine(String engine) {
        if (engine == null || engine.isBlank() || "claude".equalsIgnoreCase(engine)) {
            return "claude";
        }
        if ("codex".equalsIgnoreCase(engine)) {
            return "codex";
        }
        throw new IllegalArgumentException("不支持的 Agent 引擎: " + engine);
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
}
