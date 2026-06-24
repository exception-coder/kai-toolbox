package com.exceptioncoder.toolbox.visitoranalysis.service;

import com.exceptioncoder.toolbox.visitoranalysis.ai.ClassifyProposal;
import com.exceptioncoder.toolbox.visitoranalysis.ai.GreyZoneClassifier;
import com.exceptioncoder.toolbox.visitoranalysis.api.dto.GreyVerdict;
import com.exceptioncoder.toolbox.visitoranalysis.api.dto.MatchResult;
import com.exceptioncoder.toolbox.visitoranalysis.api.dto.SimilarRecord;
import com.exceptioncoder.toolbox.visitoranalysis.api.dto.VisitorInput;
import com.exceptioncoder.toolbox.visitoranalysis.config.VisitorAnalysisProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 灰区分类编排（纯 Java，LangChain4j）。仅在确定性匹配无法定论时调用（LLM-last）：
 * ① 向量召回历史相似客户 → ② 拼装提示（含召回上下文）→ ③ 共享网关 LLM 结构化分类。
 *
 * <p>替代原 Python AgentScope sidecar 的 HTTP 桥接。任何失败（LLM 调用 / 解析异常）都返回 null，
 * 由 {@code VerdictService} 降级为待人工确认，绝不让灰区把整条流程拖垮。
 *
 * <p>「企业数据增强」当前仍为模拟桩（未接真实工商数据），故灰区结果恒标记 {@code degraded=true}，
 * 与原 sidecar 行为一致。
 */
@Service
public class GreyZoneService {

    private static final Logger log = LoggerFactory.getLogger(GreyZoneService.class);

    private final GreyZoneClassifier classifier;
    private final VisitorVectorService vectorService;
    private final VisitorAnalysisProperties props;
    private final ObjectMapper mapper = new ObjectMapper();

    public GreyZoneService(GreyZoneClassifier classifier, VisitorVectorService vectorService,
                           VisitorAnalysisProperties props) {
        this.classifier = classifier;
        this.vectorService = vectorService;
        this.props = props;
    }

    /**
     * 灰区分类：召回 + 提示拼装 + LLM 结构化输出。
     *
     * @return 提议；LLM 调用/解析失败时返回 null（由调用方降级）
     */
    public GreyVerdict classify(VisitorInput in, String phoneNorm, String companyNorm,
                                String addrNorm, MatchResult match) {
        List<SimilarRecord> similar = vectorService.searchSimilar(
                in.company(), companyNorm, in.companyAddr(), addrNorm, in.purpose());

        String userPrompt = buildUserPrompt(in, addrNorm, match, similar);
        log.info("[grey-zone] tier={} 召回相似记录={} 条", props.getTier(), similar.size());

        try {
            ClassifyProposal p = classifier.classify(userPrompt);
            if (p == null) return null;
            // 「企业数据增强」仍为桩 → degraded 恒 true（同 sidecar）。最终裁决仍在 VerdictService。
            return new GreyVerdict(
                    p.identity(), p.relationship(), p.confidence(), p.rationale(),
                    p.evidence(), "gateway:" + props.getTier(), true, similar);
        } catch (Exception e) {
            log.warn("[grey-zone] LLM 分类失败,降级处理: {}", e.toString());
            return null;
        }
    }

    /**
     * 构建送 LLM 的用户提示：访客字段 + 企业增强（桩）+ 向量召回的历史相似客户。
     * 与原 Python {@code _build_user_prompt} 单一来源、逐项对齐。
     */
    private String buildUserPrompt(VisitorInput in, String addrNorm, MatchResult match,
                                   List<SimilarRecord> similar) {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("姓名", in.name());
        fields.put("手机号", in.phone());
        fields.put("公司", in.company());
        fields.put("公司地址（原始）", in.companyAddr());
        fields.put("邮箱", in.email());
        fields.put("来访目的", in.purpose());
        fields.put("该访客历史来访次数", match.visitCount());
        fields.put("企业增强数据", Map.of(
                "degraded", true, "note", "企业数据增强为模拟桩，未接入真实工商数据"));
        if (addrNorm != null && !addrNorm.isBlank()) {
            fields.put("地址归一化（城市+区）", addrNorm);
        }
        if (match.addrHint() != null && !match.addrHint().isBlank()) {
            fields.put("地址参考提示（客户库同城区公司）", match.addrHint());
        }

        StringBuilder sb = new StringBuilder("客户新增申请信息如下，请判断是否与库中已有客户重复：\n");
        sb.append(toJson(fields));

        if (similar != null && !similar.isEmpty()) {
            sb.append("\n\n【历史客户资料库召回：与本申请最相似的已有客户记录，按相似度排序。")
              .append("判重复请优先比对公司名是否完全一致、其次比对地址是否高度相似】\n");
            int i = 1;
            for (SimilarRecord r : similar) {
                String company = (r.company() != null && !r.company().isBlank()) ? r.company() : "未知公司";
                String addr = (r.companyAddr() != null && !r.companyAddr().isBlank()) ? r.companyAddr() : "地址缺失";
                String source = "customer".equals(r.source()) ? "客户库" : "历史访客";
                sb.append(String.format("  %d. 公司名：%s｜地址：%s（文本相似度 %.0f%%，来源：%s）%n",
                        i++, company, addr, r.score() * 100, source));
            }
        }
        return sb.toString();
    }

    private String toJson(Map<String, Object> fields) {
        try {
            return mapper.writerWithDefaultPrettyPrinter().writeValueAsString(fields);
        } catch (Exception e) {
            return String.valueOf(fields);
        }
    }

    // ── 向量库运维（委托 VisitorVectorService）──────────────────────────────────

    /** 向量召回是否就绪（前端提示用）。 */
    public boolean ping() {
        return vectorService.ping();
    }

    /** 同步索引一条客户底库记录到向量库，供「一键同步」逐条统计成功/失败。 */
    public boolean indexCustomerSync(Long custId, String company, String companyNorm,
                                     String companyAddr, String addrNorm, String status) {
        return vectorService.indexCustomer(custId, company, companyNorm, companyAddr, addrNorm, status);
    }

    /** 清空向量库客户集合。返回 {ok, before, after} 或 {ok:false, error}。 */
    public Map<String, Object> clearCustomers() {
        return vectorService.clearCustomers();
    }
}
