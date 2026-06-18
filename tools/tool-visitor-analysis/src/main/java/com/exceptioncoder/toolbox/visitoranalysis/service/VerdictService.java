package com.exceptioncoder.toolbox.visitoranalysis.service;

import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.exceptioncoder.toolbox.visitoranalysis.api.dto.IdentityType;
import com.exceptioncoder.toolbox.visitoranalysis.api.dto.MatchResult;
import com.exceptioncoder.toolbox.visitoranalysis.api.dto.RelationshipType;
import com.exceptioncoder.toolbox.visitoranalysis.api.dto.SidecarVerdict;
import com.exceptioncoder.toolbox.visitoranalysis.api.dto.VerdictView;
import com.exceptioncoder.toolbox.visitoranalysis.api.dto.VisitorInput;
import com.exceptioncoder.toolbox.visitoranalysis.config.VisitorAnalysisProperties;
import com.exceptioncoder.toolbox.visitoranalysis.repository.VerdictRepository;
import com.exceptioncoder.toolbox.visitoranalysis.repository.VisitorRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * 判别编排 + 代码裁决（系统真相）。流程：
 * ①归一化 → ②确定性匹配（命中即定,跳过 LLM）→ ④灰区交 sidecar → ⑤裁决落库。
 * "LLM 提议,代码裁决"：sidecar 输出一律经枚举校验 + 置信度阈值后才落库。
 */
@Service
public class VerdictService {

    private static final Logger log = LoggerFactory.getLogger(VerdictService.class);
    /** 流失判定阈值：最近成交超过此时长视为流失客户。 */
    private static final long CHURN_MILLIS = 365L * 24 * 60 * 60 * 1000;

    private final Normalizer normalizer;
    private final MatchService matchService;
    private final SidecarClient sidecar;
    private final VisitorRepository visitorRepo;
    private final VerdictRepository verdictRepo;
    private final VisitorAnalysisProperties props;
    private final SseEmitterRegistry sse;
    private final ObjectMapper mapper = new ObjectMapper();

    public VerdictService(Normalizer normalizer, MatchService matchService, SidecarClient sidecar,
                          VisitorRepository visitorRepo, VerdictRepository verdictRepo,
                          VisitorAnalysisProperties props, SseEmitterRegistry sse) {
        this.normalizer = normalizer;
        this.matchService = matchService;
        this.sidecar = sidecar;
        this.visitorRepo = visitorRepo;
        this.verdictRepo = verdictRepo;
        this.props = props;
        this.sse = sse;
    }

    /**
     * 跑一次完整判别并落库。taskId 非空时向对应 SSE 通道推阶段进度。
     */
    public VerdictView analyze(String taskId, VisitorInput in, String source) {
        emit(taskId, "stage", Map.of("step", "normalize", "label", "归一化"));
        String phoneNorm = normalizer.phone(in.phone());
        String companyNorm = normalizer.company(in.company());

        long visitorId = visitorRepo.insert(in.name(), in.phone(), phoneNorm, in.company(),
                companyNorm, in.companyAddr(), in.email(), in.purpose(), source);

        emit(taskId, "stage", Map.of("step", "match", "label", "确定性匹配（查库）"));
        MatchResult m = matchService.match(phoneNorm, companyNorm);

        VerdictView view;
        if (m.conclusive()) {
            view = decideByRule(visitorId, m);
        } else {
            emit(taskId, "stage", Map.of("step", "llm", "label", "灰区：AgentScope 判别"));
            view = decideByLlm(visitorId, in, phoneNorm, companyNorm, m);
        }
        emit(taskId, "done", view);
        return view;
    }

    /** 第②层命中：确定性定论,高置信,不调 LLM。 */
    private VerdictView decideByRule(long visitorId, MatchResult m) {
        if (m.hitCompetitor()) {
            String evidence = json(List.of("命中竞品名单：" + safe(m.competitorName())));
            long id = verdictRepo.insert(visitorId, IdentityType.COMPETITOR.name(),
                    RelationshipType.NONE.name(), 0.99, "rule:competitor",
                    "归一化公司名命中竞品名单", evidence, null, false);
            return verdictRepo.findById(id);
        }
        // 命中客户库：区分熟客 / 流失客户。
        RelationshipType rel = RelationshipType.EXISTING;
        String reason = "命中历史客户库";
        if ("churned".equalsIgnoreCase(m.customerStatus())
                || (m.lastDealAt() != null && System.currentTimeMillis() - m.lastDealAt() > CHURN_MILLIS)) {
            rel = RelationshipType.CHURNED;
            reason = "命中历史客户库，但最近成交久远 / 状态为流失";
        }
        String evidence = json(List.of(reason,
                m.lastDealAt() == null ? "无最近成交时间" : "最近成交：" + m.lastDealAt()));
        long id = verdictRepo.insert(visitorId, IdentityType.CUSTOMER.name(), rel.name(),
                0.95, "rule:customer", reason, evidence, null, false);
        return verdictRepo.listRecent(1).stream().filter(v -> v.id() == id).findFirst().orElseThrow();
    }

    /** 第④层灰区：sidecar 提议 → 代码裁决。sidecar 不可用则降级为 UNKNOWN + 待人工确认。 */
    private VerdictView decideByLlm(long visitorId, VisitorInput in, String phoneNorm,
                                    String companyNorm, MatchResult m) {
        SidecarVerdict proposal = sidecar.classify(in, phoneNorm, companyNorm, m);
        if (proposal == null) {
            String reason = "灰区且 AgentScope sidecar 不可用，降级为待人工确认";
            String hint = m.visitCount() > 0 ? "（注：该访客曾来访 " + m.visitCount() + " 次）" : "";
            long id = verdictRepo.insert(visitorId, IdentityType.UNKNOWN.name(),
                    RelationshipType.NONE.name(), 0.0, "degraded:no-sidecar",
                    reason + hint, json(List.of(reason)), null, true);
            return verdictRepo.findById(id);
        }

        // —— 代码裁决：LLM 输出当不可信入参 ——
        IdentityType identity = IdentityType.parse(proposal.identity());
        RelationshipType rel = identity == IdentityType.CUSTOMER
                ? RelationshipType.parse(proposal.relationship())
                : RelationshipType.NONE;
        double confidence = clamp(proposal.confidence());
        boolean needsReview = confidence < props.getReviewThreshold()
                || identity == IdentityType.UNKNOWN
                || proposal.degraded();

        String evidence = json(proposal.evidence() == null || proposal.evidence().isEmpty()
                ? List.of("LLM 未提供依据")
                : proposal.evidence());
        long id = verdictRepo.insert(visitorId, identity.name(), rel.name(), confidence,
                "llm", proposal.rationale(), evidence, proposal.model(), needsReview);
        return verdictRepo.listRecent(1).stream().filter(v -> v.id() == id).findFirst().orElseThrow();
    }

    private static double clamp(Double v) {
        if (v == null) return 0.0;
        return Math.min(1.0, Math.max(0.0, v));
    }

    private static String safe(String s) {
        return s == null ? "" : s;
    }

    private String json(List<String> evidence) {
        try {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("evidence", evidence);
            return mapper.writeValueAsString(m);
        } catch (Exception e) {
            return "{\"evidence\":[]}";
        }
    }

    private void emit(String taskId, String event, Object payload) {
        if (taskId != null && sse.hasEmitter(taskId)) {
            sse.publish(taskId, event, payload);
        }
    }
}
