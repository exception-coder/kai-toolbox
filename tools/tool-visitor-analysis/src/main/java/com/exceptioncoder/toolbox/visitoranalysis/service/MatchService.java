package com.exceptioncoder.toolbox.visitoranalysis.service;

import com.exceptioncoder.toolbox.visitoranalysis.api.dto.MatchResult;
import com.exceptioncoder.toolbox.visitoranalysis.repository.CompetitorRepository;
import com.exceptioncoder.toolbox.visitoranalysis.repository.CustomerRepository;
import com.exceptioncoder.toolbox.visitoranalysis.repository.VisitorRepository;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * 第②层确定性匹配（查库，无 LLM，命中即定论）。
 *
 * <p>匹配扩展（相比初版）：
 * <ul>
 *   <li>公司名匹配同时走 {@code va_company_alias} 别名表——"腾讯/Tencent/腾讯科技/TX"都能命中</li>
 *   <li>新增地址软匹配（{@code addrNorm}）——公司地址城市+区相同作为补充信号，不定论</li>
 * </ul>
 *
 * <p>优先级：竞品（含别名） &gt; 客户（手机/主名/别名） &gt; 地址提示（非定论）。
 */
@Service
public class MatchService {

    private final CustomerRepository customers;
    private final CompetitorRepository competitors;
    private final VisitorRepository visitors;

    public MatchService(CustomerRepository customers, CompetitorRepository competitors,
                        VisitorRepository visitors) {
        this.customers = customers;
        this.competitors = competitors;
        this.visitors = visitors;
    }

    /**
     * @param phoneNorm   归一化手机号
     * @param companyNorm 归一化公司名
     * @param addrNorm    归一化地址（城市+区），用于地址软匹配；可为空串
     */
    public MatchResult match(String phoneNorm, String companyNorm, String addrNorm) {
        // ── 竞品优先：含别名匹配，命中即定论 ──────────────────────────
        String competitorName = competitors.matchName(companyNorm);
        boolean hitCompetitor = competitorName != null;

        // ── 客户库：含别名匹配，手机>公司名>别名 ──────────────────────
        Map<String, Object> customer = hitCompetitor ? null
                : customers.findByPhoneOrCompany(phoneNorm, companyNorm);
        boolean hitCustomer = customer != null;
        String customerStatus = hitCustomer ? (String) customer.get("status") : null;
        Long lastDealAt = hitCustomer ? toLong(customer.get("last_deal_at")) : null;

        // 是否通过别名命中
        boolean hitByAlias = false;
        String matchedAlias = null;
        if (hitCustomer && customer.get("matched_alias") != null) {
            hitByAlias = true;
            matchedAlias = (String) customer.get("matched_alias");
        }
        // 竞品别名命中：matchName 内部已合并，此处简单检查名称是否不等于 companyNorm
        if (hitCompetitor && competitorName != null && !companyNorm.equals(competitorName)) {
            hitByAlias = true;
            matchedAlias = companyNorm;  // 访客填写的原始归一化名
        }

        int visitCount = visitors.countPrior(phoneNorm, companyNorm);
        boolean conclusive = hitCompetitor || hitCustomer;

        // ── 地址软匹配（非定论，仅补充上下文） ─────────────────────────
        String addrHint = null;
        if (!conclusive && addrNorm != null && !addrNorm.isBlank()) {
            Map<String, Object> addrMatch = customers.findByAddr(addrNorm);
            if (addrMatch != null) {
                addrHint = addrNorm + "（客户：" + addrMatch.get("company") + "）";
            }
        }

        return new MatchResult(hitCustomer, customerStatus, lastDealAt,
                hitCompetitor, competitorName, visitCount, conclusive,
                hitByAlias, matchedAlias, addrHint);
    }

    private static Long toLong(Object o) {
        if (o == null) return null;
        if (o instanceof Number num) return num.longValue();
        try { return Long.parseLong(o.toString()); } catch (NumberFormatException e) { return null; }
    }
}
