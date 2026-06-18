package com.exceptioncoder.toolbox.visitoranalysis.service;

import com.exceptioncoder.toolbox.visitoranalysis.api.dto.MatchResult;
import com.exceptioncoder.toolbox.visitoranalysis.repository.CompetitorRepository;
import com.exceptioncoder.toolbox.visitoranalysis.repository.CustomerRepository;
import com.exceptioncoder.toolbox.visitoranalysis.repository.VisitorRepository;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * 第②层确定性匹配（查库,无 LLM,命中即定论）。
 * 这是 deterministic-first 的核心:多数访客在这里就被判完,LLM 只接灰区。
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

    public MatchResult match(String phoneNorm, String companyNorm) {
        // 竞品优先级最高:命中即定论,不再看是否也是客户。
        String competitorName = competitors.matchName(companyNorm);
        boolean hitCompetitor = competitorName != null;

        Map<String, Object> customer = hitCompetitor ? null
                : customers.findByPhoneOrCompany(phoneNorm, companyNorm);
        boolean hitCustomer = customer != null;
        String customerStatus = hitCustomer ? (String) customer.get("status") : null;
        Long lastDealAt = hitCustomer ? toLong(customer.get("last_deal_at")) : null;

        int visitCount = visitors.countPrior(phoneNorm, companyNorm);
        boolean conclusive = hitCompetitor || hitCustomer;

        return new MatchResult(hitCustomer, customerStatus, lastDealAt,
                hitCompetitor, competitorName, visitCount, conclusive);
    }

    private static Long toLong(Object o) {
        if (o == null) return null;
        if (o instanceof Number num) return num.longValue();
        try { return Long.parseLong(o.toString()); } catch (NumberFormatException e) { return null; }
    }
}
