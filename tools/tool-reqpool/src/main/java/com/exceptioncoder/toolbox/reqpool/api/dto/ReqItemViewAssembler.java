package com.exceptioncoder.toolbox.reqpool.api.dto;

import com.exceptioncoder.toolbox.reqpool.domain.ReqInsight;
import com.exceptioncoder.toolbox.reqpool.domain.ReqInsightStatus;
import com.exceptioncoder.toolbox.reqpool.domain.ReqInsightType;
import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;
import com.exceptioncoder.toolbox.reqpool.repository.ReqInsightRepository;
import com.exceptioncoder.toolbox.reqpool.repository.ReqPlanningAssessmentRepository;
import com.exceptioncoder.toolbox.reqpool.service.ReqInsightFingerprint;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/** 为需求 API 视图批量装配最新洞察及新鲜度。 */
@Component
public class ReqItemViewAssembler {

    private final ReqInsightRepository insightRepository;
    private final ReqInsightFingerprint fingerprint;
    private final ReqPlanningAssessmentRepository planningAssessmentRepository;

    public ReqItemViewAssembler(
            ReqInsightRepository insightRepository,
            ReqInsightFingerprint fingerprint,
            ReqPlanningAssessmentRepository planningAssessmentRepository
    ) {
        this.insightRepository = insightRepository;
        this.fingerprint = fingerprint;
        this.planningAssessmentRepository = planningAssessmentRepository;
    }

    public List<ReqItemView> fromAll(List<ReqItem> items, List<ReqItem> currentPortfolioItems) {
        Map<String, ReqInsight> latestByItemId = insightRepository.findLatestByItemIds(
                items.stream().map(ReqItem::getId).toList());
        String currentPortfolioHash = fingerprint.portfolioSetHash(currentPortfolioItems);
        Map<String, com.exceptioncoder.toolbox.reqpool.domain.ReqPlanningAssessment> planningByItemId =
                planningAssessmentRepository.findLatestByItemIds(items.stream().map(ReqItem::getId).toList());
        return items.stream()
                .map(item -> ReqItemView.from(
                        item,
                        statusOf(item, latestByItemId.get(item.getId()), currentPortfolioHash),
                        ReqPlanningAssessmentView.from(planningByItemId.get(item.getId()))))
                .toList();
    }

    public ReqItemView from(ReqItem item, List<ReqItem> currentPortfolioItems) {
        return fromAll(List.of(item), currentPortfolioItems).getFirst();
    }

    private ReqInsightStatus statusOf(ReqItem item, ReqInsight insight, String currentPortfolioHash) {
        if (insight == null) {
            return item.getAiInsight() == null || item.getAiInsight().isBlank()
                    ? ReqInsightStatus.absent()
                    : ReqInsightStatus.legacy();
        }
        if (!insight.sourceHash().equals(fingerprint.sourceHash(item))) {
            return stale(insight, "SOURCE_CHANGED");
        }
        if (insight.analysisType() == ReqInsightType.PORTFOLIO
                && !currentPortfolioHash.equals(insight.portfolioSetHash())) {
            return stale(insight, "PORTFOLIO_CHANGED");
        }
        return new ReqInsightStatus(
                insight.analysisType(), insight.promptVersion(), insight.createdAt(), false, null);
    }

    private static ReqInsightStatus stale(ReqInsight insight, String reason) {
        return new ReqInsightStatus(
                insight.analysisType(), insight.promptVersion(), insight.createdAt(), true, reason);
    }
}
