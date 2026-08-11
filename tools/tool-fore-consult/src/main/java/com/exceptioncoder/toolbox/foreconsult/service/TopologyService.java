package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.api.dto.TopologyView;
import com.exceptioncoder.toolbox.foreconsult.api.dto.EvidenceRouteRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.EvidenceRouteView;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultTopologyLink;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTopologyLinkRepository;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;

/**
 * 系统链路分析：驱动一次性 headless Claude Agent 引擎，用 cross-topology MCP 图谱查出当前
 * 星图上这批系统之间的关系边。引擎为可选依赖（由 tool-claude-chat 提供），缺失时给出明确的 503。
 */
@Service
public class TopologyService {

    private static final Logger log = LoggerFactory.getLogger(TopologyService.class);
    private static final String CLAUDE_ENGINE = "claude";
    private static final String CODEX_ENGINE = "codex";

    private static final String SYSTEM_PROMPT = """
            你是企业业务系统拓扑分析助手。用户会给出一批业务系统名。请调用 cross-topology 相关 MCP 工具
            （如 list_projects / search_knowledge / get_related / get_knowledge）核对这些系统之间**真实存在**的
            关联关系（调用链、数据流、依赖、上下游等）。

            严格要求：
            1. 只输出 JSON，不要任何解释性文字、不要 Markdown 代码围栏。
            2. 结构固定为：{"links":[...],"evidenceRoutes":[{"contextSystem":"发起系统","moduleName":"展示模块","businessObject":"业务对象或指标","keywords":["触发词"],"evidenceSystem":"权威证据系统","schemaSource":"ERP_STANDBY|RUNTIME_METADATA|NONE","description":"为什么该系统是权威来源","evidenceRefs":["接口/数据流证据"]}]}。
            3. from / to 必须是用户给定清单里**原样**的系统名；不得出现清单外的系统。
            4. 方向必须明确：from 是调用方、依赖方或数据来源方，to 是被调用方、被依赖方或数据接收方；
               不得为了排版方便交换 from / to。无法确认方向时不要输出该关系。
            5. 只包含图谱中确有依据的关系；没有把握或查不到就不要编造，宁可返回 {"links":[]}。
            6. relation 用简短中文标签（如 调用 / 数据同步 / 依赖 / 上游 / 下游）；description 一句话即可。
            7. evidenceRoutes 只输出能从图谱证明确有跨系统数据流的候选；contextSystem/evidenceSystem 必须来自用户清单且不能相同。不能确定业务对象或权威方向时不要输出。候选只供人工审核，不代表已经授权。
            """;

    private final ObjectProvider<AgentOneShotRunner> runnerProvider;
    private final ConsultTopologyLinkRepository linkRepo;
    private final ConsultEvidenceRouteService evidenceRouteService;
    private final ObjectMapper mapper = new ObjectMapper();

    @Autowired
    public TopologyService(ObjectProvider<AgentOneShotRunner> runnerProvider,
                           ConsultTopologyLinkRepository linkRepo,
                           ConsultEvidenceRouteService evidenceRouteService) {
        this.runnerProvider = runnerProvider;
        this.linkRepo = linkRepo;
        this.evidenceRouteService = evidenceRouteService;
    }

    TopologyService(ObjectProvider<AgentOneShotRunner> runnerProvider,
                    ConsultTopologyLinkRepository linkRepo) {
        this.runnerProvider = runnerProvider;
        this.linkRepo = linkRepo;
        this.evidenceRouteService = null;
    }

    /** 读取已持久化的链路（前端加载时用，无需重新调引擎）。 */
    public TopologyView listPersisted() {
        List<TopologyView.LinkEdge> links = linkRepo.findAll().stream()
                .map(l -> new TopologyView.LinkEdge(l.getFromSystem(), l.getToSystem(), l.getRelation(), l.getDescription()))
                .toList();
        List<EvidenceRouteView> routes = evidenceRouteService == null ? List.of()
                : evidenceRouteService.list().stream().map(EvidenceRouteView::from).toList();
        return new TopologyView(links, routes);
    }

    /** 分析给定系统之间的链路关系，并整表持久化。仅返回两端都在入参集合内、去重后的边。 */
    public TopologyView analyze(List<String> systems, String requestedEngine) {
        Set<String> known = new LinkedHashSet<>();
        for (String s : systems == null ? List.<String>of() : systems) {
            if (s != null && !s.isBlank()) {
                known.add(s.trim());
            }
        }
        if (known.size() < 2) {
            return new TopologyView(List.of());
        }

        AgentOneShotRunner runner = runnerProvider.getIfAvailable();
        if (runner == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "高质量引擎不可用（tool-claude-chat 未加载），无法分析系统链路");
        }

        String userPrompt = "系统清单（只在这些之间找关系）：\n"
                + String.join("\n", known.stream().map(s -> "- " + s).toList());
        String engine = normalizeEngine(requestedEngine);
        String raw = runOnEngine(runner, userPrompt, engine);
        List<TopologyView.LinkEdge> links = parseLinks(raw, known);
        if (!links.isEmpty()) {
            persist(links);
        }
        List<EvidenceRouteView> candidates = persistEvidenceRouteCandidates(raw, known);
        return new TopologyView(links, candidates);
    }

    private List<EvidenceRouteView> persistEvidenceRouteCandidates(String raw, Set<String> known) {
        if (evidenceRouteService == null || raw == null || raw.isBlank()) return List.of();
        try {
            JsonNode array = mapper.readTree(stripFence(raw.trim())).path("evidenceRoutes");
            if (!array.isArray()) return List.of();
            List<EvidenceRouteView> saved = new ArrayList<>();
            for (JsonNode node : array) {
                String context = node.path("contextSystem").asText("").trim();
                String evidence = node.path("evidenceSystem").asText("").trim();
                String businessObject = node.path("businessObject").asText("").trim();
                if (!known.contains(context) || !known.contains(evidence) || context.equals(evidence)
                        || businessObject.isBlank()) continue;
                List<String> keywords = stringArray(node.path("keywords"));
                String moduleName = node.path("moduleName").asText("").trim();
                if (moduleName.isBlank() && keywords.isEmpty()) continue;
                EvidenceRouteRequest request = new EvidenceRouteRequest(
                        context, moduleName, businessObject, keywords, evidence,
                        node.path("schemaSource").asText("RUNTIME_METADATA"),
                        node.path("description").asText(""), stringArray(node.path("evidenceRefs")), "DRAFT");
                saved.add(EvidenceRouteView.from(evidenceRouteService.createDraftCandidate(request)));
            }
            return saved;
        } catch (Exception error) {
            log.warn("[fore-consult] 数据归属候选解析失败，不影响系统连线: {}", error.getMessage());
            return List.of();
        }
    }

    private static List<String> stringArray(JsonNode node) {
        if (!node.isArray()) return List.of();
        List<String> values = new ArrayList<>();
        for (JsonNode item : node) {
            String value = item.asText("").trim();
            if (!value.isBlank()) values.add(value);
        }
        return values;
    }

    /** 旧客户端未传引擎时保持 Claude 默认；非法值直接拒绝，禁止静默路由到未知引擎。 */
    private String normalizeEngine(String requestedEngine) {
        if (requestedEngine == null || requestedEngine.isBlank()) {
            return CLAUDE_ENGINE;
        }
        String engine = requestedEngine.trim().toLowerCase(Locale.ROOT);
        if (CLAUDE_ENGINE.equals(engine) || CODEX_ENGINE.equals(engine)) {
            return engine;
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "链路分析仅支持 Claude Code 或 Codex 引擎");
    }

    /** 整表替换持久化本次分析结果（失败不影响返回给前端）。 */
    private void persist(List<TopologyView.LinkEdge> links) {
        try {
            long now = System.currentTimeMillis();
            linkRepo.replaceAll(links.stream()
                    .map(e -> ConsultTopologyLink.builder()
                            .fromSystem(e.from()).toSystem(e.to())
                            .relation(e.relation()).description(e.description())
                            .createdAt(now).build())
                    .toList());
        } catch (Exception e) {
            log.warn("[fore-consult] 链路结果持久化失败（不影响本次返回）", e);
        }
    }

    /** 引擎调用阻塞且要求在虚拟线程执行（见 AgentOneShotRunner 契约），此处在虚拟线程上跑并等结果。 */
    private String runOnEngine(AgentOneShotRunner runner, String userPrompt, String engine) {
        CompletableFuture<String> future = new CompletableFuture<>();
        Thread.ofVirtual().name("fore-consult-topo-").start(() -> {
            try {
                future.complete(runner.runOnce(SYSTEM_PROMPT, userPrompt, null, engine));
            } catch (Throwable t) {
                future.completeExceptionally(t);
            }
        });
        try {
            return future.get();
        } catch (ExecutionException e) {
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            log.warn("[fore-consult] 系统链路分析引擎调用失败", cause);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "链路分析失败：" + cause.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "链路分析被中断");
        }
    }

    /** 容错解析引擎回吐的 JSON；过滤掉端点不在集合内、自环、重复的边。解析失败返回空。 */
    private List<TopologyView.LinkEdge> parseLinks(String raw, Set<String> known) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        try {
            JsonNode root = mapper.readTree(stripFence(raw.trim()));
            JsonNode arr = root.path("links");
            if (!arr.isArray()) {
                return List.of();
            }
            List<TopologyView.LinkEdge> out = new ArrayList<>();
            Set<String> seen = new LinkedHashSet<>();
            for (JsonNode node : arr) {
                String from = node.path("from").asText("").trim();
                String to = node.path("to").asText("").trim();
                if (from.isEmpty() || to.isEmpty() || from.equals(to)) continue;
                if (!known.contains(from) || !known.contains(to)) continue;
                if (!seen.add(from + " " + to)) continue;
                out.add(new TopologyView.LinkEdge(
                        from, to,
                        node.path("relation").asText("关联"),
                        node.path("description").asText("")));
            }
            return out;
        } catch (Exception e) {
            log.warn("[fore-consult] 链路 JSON 解析失败", e);
            return List.of();
        }
    }

    /** 去掉可能的 ```json ... ``` 围栏，尽量截出 JSON 主体。 */
    private static String stripFence(String s) {
        String t = s;
        if (t.startsWith("```")) {
            int nl = t.indexOf('\n');
            if (nl >= 0) t = t.substring(nl + 1);
            if (t.endsWith("```")) t = t.substring(0, t.length() - 3);
        }
        int lb = t.indexOf('{');
        int rb = t.lastIndexOf('}');
        return (lb >= 0 && rb > lb) ? t.substring(lb, rb + 1) : t;
    }
}
