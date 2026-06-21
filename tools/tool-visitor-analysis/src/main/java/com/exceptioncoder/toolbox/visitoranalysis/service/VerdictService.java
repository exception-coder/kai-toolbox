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

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 判别编排 + 代码裁决（系统真相）。流程：
 * ①归一化（含地址）→ ②确定性匹配（主名+别名+地址软信号，命中即定，跳过 LLM）
 *   → ④灰区交 sidecar → ⑤裁决落库。
 * "LLM 提议，代码裁决"：sidecar 输出一律经枚举校验 + 置信度阈值后才落库。
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
        String phoneNorm  = normalizer.phone(in.phone());
        String companyNorm = normalizer.company(in.company());
        String addrNorm   = normalizer.addr(in.companyAddr());   // 新增：地址归一化

        long visitorId = visitorRepo.insert(in.name(), in.phone(), phoneNorm, in.company(),
                companyNorm, in.companyAddr(), addrNorm, in.email(), in.purpose(), source);

        emit(taskId, "stage", Map.of("step", "match", "label", "确定性匹配（查库+别名）"));
        MatchResult m = matchService.match(phoneNorm, companyNorm, addrNorm);

        VerdictView view;
        if (m.conclusive()) {
            view = decideByRule(visitorId, m);
        } else {
            emit(taskId, "stage", Map.of("step", "llm", "label", "灰区：AgentScope 判别"));
            view = decideByLlm(visitorId, in, phoneNorm, companyNorm, addrNorm, m);
        }
        emit(taskId, "done", view);

        // 判别完成后异步索引到 Qdrant（fire-and-forget，不阻塞返回路径）。
        // 所有判别都索引，confidence 会随历史积累越来越准——包括低置信的。
        sidecar.indexVisitor(in, addrNorm, view.identity(), view.relationship(), view.confidence());

        return view;
    }

    /** 第②层命中：确定性定论，高置信，不调 LLM。 */
    private VerdictView decideByRule(long visitorId, MatchResult m) {
        if (m.hitCompetitor()) {
            List<String> evidenceList = new ArrayList<>();
            evidenceList.add("命中竞品名单：" + safe(m.competitorName()));
            if (m.hitByAlias() && m.matchedAlias() != null) {
                evidenceList.add("通过别名匹配：访客填写「" + m.matchedAlias() + "」= 竞品「" + m.competitorName() + "」");
            }
            long id = verdictRepo.insert(visitorId, IdentityType.COMPETITOR.name(),
                    RelationshipType.NONE.name(), 0.99, "rule:competitor",
                    m.hitByAlias() ? "别名命中竞品名单" : "归一化公司名命中竞品名单",
                    json(evidenceList), null, false);
            return verdictRepo.findById(id);
        }

        // 命中客户库：区分熟客 / 流失客户
        RelationshipType rel = RelationshipType.EXISTING;
        String reason = m.hitByAlias() ? "通过公司别名命中历史客户库" : "命中历史客户库";
        if ("churned".equalsIgnoreCase(m.customerStatus())
                || (m.lastDealAt() != null && System.currentTimeMillis() - m.lastDealAt() > CHURN_MILLIS)) {
            rel = RelationshipType.CHURNED;
            reason += "，但最近成交久远 / 状态为流失";
        }
        List<String> evidenceList = new ArrayList<>();
        evidenceList.add(reason);
        if (m.hitByAlias() && m.matchedAlias() != null) {
            evidenceList.add("别名匹配：访客填写「" + m.matchedAlias() + "」");
        }
        evidenceList.add(m.lastDealAt() == null ? "无最近成交时间" : "最近成交：" + m.lastDealAt());

        // 别名命中置信度略低于主名精确命中（主名/手机=0.95，别名=0.90）
        double confidence = m.hitByAlias() ? 0.90 : 0.95;
        long id = verdictRepo.insert(visitorId, IdentityType.CUSTOMER.name(), rel.name(),
                confidence, m.hitByAlias() ? "rule:customer:alias" : "rule:customer",
                reason, json(evidenceList), null, false);
        return verdictRepo.listRecent(1).stream().filter(v -> v.id() == id).findFirst().orElseThrow();
    }

    /** 第④层灰区：sidecar 提议 → 代码裁决。sidecar 不可用则降级为 UNKNOWN + 待人工确认。 */
    private VerdictView decideByLlm(long visitorId, VisitorInput in, String phoneNorm,
                                    String companyNorm, String addrNorm, MatchResult m) {
        SidecarVerdict proposal = sidecar.classify(in, phoneNorm, companyNorm, addrNorm, m);
        if (proposal == null) {
            String reason = "灰区且 AgentScope sidecar 不可用，降级为待人工确认";
            List<String> hints = new ArrayList<>();
            hints.add(reason);
            if (m.visitCount() > 0) hints.add("该访客曾来访 " + m.visitCount() + " 次");
            if (m.addrHint() != null) hints.add("地址参考：" + m.addrHint());
            long id = verdictRepo.insert(visitorId, IdentityType.UNKNOWN.name(),
                    RelationshipType.NONE.name(), 0.0, "degraded:no-sidecar",
                    reason, json(hints), null, true);
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
