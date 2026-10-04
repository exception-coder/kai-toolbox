package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import org.springframework.stereotype.Service;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

/** 从当前会话最近消息推荐 OpenSpec change，并给出启动前的权威检查结果。 */
@Service
public class AutopilotBindingPreviewService {
    private final ClaudeChatSessionRepository sessions;
    private final SessionHistoryService history;
    private final AutopilotProjectContextResolver projects;
    private final OpenSpecAutopilotAdapter openSpec;
    private final OpenSpecChangeCatalog catalog;
    private final AgentOneShotService agent;
    private final ObjectMapper mapper;

    public AutopilotBindingPreviewService(ClaudeChatSessionRepository sessions, SessionHistoryService history,
                                          AutopilotProjectContextResolver projects, OpenSpecAutopilotAdapter openSpec,
                                          OpenSpecChangeCatalog catalog, AgentOneShotService agent,
                                          ObjectMapper mapper) {
        this.sessions = sessions;
        this.history = history;
        this.projects = projects;
        this.openSpec = openSpec;
        this.catalog = catalog;
        this.agent = agent;
        this.mapper = mapper;
    }

    public List<Candidate> preview(String sessionId, String projectRoot) {
        var identity = projects.resolve(sessionId, projectRoot);
        ClaudeChatSession session = sessions.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在"));
        String context = session.getTitle() == null ? "" : session.getTitle().toLowerCase(Locale.ROOT);
        try {
            context += "\n" + history.readMessages(session.getCwd(), session.getSdkSessionId(),
                        session.getCodexHome(), null, 30).items().stream()
                .filter(message -> ("user".equals(message.kind()) || "assistant".equals(message.kind()))
                        && message.text() != null)
                .map(message -> message.text().toLowerCase(Locale.ROOT))
                    .reduce("", (left, right) -> left + "\n" + right);
        } catch (RuntimeException ignored) {
            // 原生会话历史丢失时仍展示项目中的规格候选，相关性仅由标题提供。
        }
        final String recentContext = context;
        return catalog.recommend(identity.projectRoot(), recentContext, 30).stream()
                .sorted(Comparator.comparingInt((OpenSpecAutopilotAdapter.ChangeOption change) ->
                        relevance(recentContext, change.id())).reversed()
                        .thenComparing(OpenSpecAutopilotAdapter.ChangeOption::id))
                .limit(30).map(change -> {
            int score = relevance(recentContext, change.id());
            return new Candidate(change.id(), change.completedTasks(), change.totalTasks(),
                    "", score, false, "选择后检查规格");
        }).sorted(Comparator.comparingInt(Candidate::relevance).reversed()
                .thenComparing(Candidate::changeId)).toList();
    }

    /** Agent 只提议 ID，返回前按当前项目目录中的真实 ID 校验。 */
    public List<String> recommendAi(String sessionId, String projectRoot) {
        var identity = projects.resolve(sessionId, projectRoot);
        ClaudeChatSession session = sessions.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在"));
        String context = session.getTitle() == null ? "" : session.getTitle();
        try {
            context += "\n" + history.readMessages(session.getCwd(), session.getSdkSessionId(),
                            session.getCodexHome(), null, 30).items().stream()
                    .filter(message -> ("user".equals(message.kind()) || "assistant".equals(message.kind()))
                            && message.text() != null)
                    .map(message -> message.text()).collect(Collectors.joining("\n"));
        } catch (RuntimeException ignored) {
            // 保留标题线索。
        }
        return recommendWithAgent(session, identity.projectRoot(), context,
                catalog.recommend(identity.projectRoot(), context, 30));
    }

    private List<String> recommendWithAgent(ClaudeChatSession session, Path projectRoot, String context,
                                             List<OpenSpecAutopilotAdapter.ChangeOption> options) {
        if (options.isEmpty() || context.isBlank()) return List.of();
        String summaries = options.stream().map(option -> {
            return option.id() + " (tasks " + option.completedTasks() + "/" + option.totalTasks() + ")\n"
                    + catalog.proposalExcerpt(projectRoot, option.id());
        }).collect(Collectors.joining("\n---\n"));
        try {
            String skill = new ClassPathResource("skills/forge-openspec-spec-recommendation/SKILL.md")
                    .getContentAsString(StandardCharsets.UTF_8);
            String response = agent.runOnce(skill,
                    "最近会话：\n" + context.substring(Math.max(0, context.length() - 8_000))
                            + "\n\n候选规格：\n" + summaries,
                    session.getSelectedModel(), session.getEngine());
            if (response == null) return List.of();
            int first = response.indexOf('[');
            int last = response.lastIndexOf(']');
            if (first < 0 || last < first) return List.of();
            var parsed = mapper.readTree(response.substring(first, last + 1));
            if (!parsed.isArray()) return List.of();
            List<String> allowed = options.stream().map(OpenSpecAutopilotAdapter.ChangeOption::id).toList();
            List<String> ordered = new ArrayList<>();
            parsed.forEach(node -> {
                String id = node.asText();
                if (allowed.contains(id) && !ordered.contains(id) && ordered.size() < 5) ordered.add(id);
            });
            return ordered;
        } catch (Exception exception) {
            return List.of();
        }
    }

    public OpenSpecChangeCatalog.Page catalog(String sessionId, String projectRoot,
                                               String query, int offset, int limit) {
        return catalog.search(projects.resolve(sessionId, projectRoot).projectRoot(), query, offset, limit);
    }

    public Candidate check(String sessionId, String projectRoot, String changeId) {
        var identity = projects.resolve(sessionId, projectRoot);
        var change = catalog.find(identity.projectRoot(), changeId)
                .orElseThrow(() -> new IllegalArgumentException("OpenSpec change 不存在或已归档"));
        try {
            var snapshot = openSpec.inspect(identity.projectRoot(), changeId);
            var validation = openSpec.strictValidate(identity.projectRoot(), changeId);
            boolean ready = validation.passed() && snapshot.nextTask() != null && snapshot.totalTasks() > 0;
            String reason = !validation.passed() ? validation.detail()
                    : snapshot.totalTasks() == 0 ? "没有可执行的 OpenSpec task"
                    : snapshot.nextTask() == null ? "全部 task 已完成" : "规格校验通过，可以绑定并推进";
            return new Candidate(changeId, snapshot.completedTasks(), snapshot.totalTasks(),
                    snapshot.revision(), 0, ready, reason);
        } catch (RuntimeException exception) {
            return new Candidate(changeId, change.completedTasks(), change.totalTasks(),
                    "", 0, false, "预检无法读取规格：" + exception.getMessage());
        }
    }

    private int relevance(String context, String changeId) {
        String normalized = changeId.toLowerCase(Locale.ROOT);
        int score = context.contains(normalized) ? 100 : 0;
        for (String token : normalized.split("[-_.]+")) {
            if (token.length() >= 3 && context.contains(token)) score += 10;
        }
        return score;
    }

    public record Candidate(String changeId, int completedTasks, int totalTasks,
                            String revision, int relevance, boolean ready, String reason) { }
}
