package com.exceptioncoder.toolbox.reqpool.api.dto;

import com.exceptioncoder.toolbox.reqpool.domain.ReqInsight;
import com.exceptioncoder.toolbox.reqpool.domain.ReqInsightType;
import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;
import com.exceptioncoder.toolbox.reqpool.repository.ReqInsightRepository;
import com.exceptioncoder.toolbox.reqpool.repository.ReqPlanningAssessmentRepository;
import com.exceptioncoder.toolbox.reqpool.service.ReqInsightFingerprint;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ReqItemViewAssemblerTest {

    private final ReqInsightRepository repository = mock(ReqInsightRepository.class);
    private final ReqInsightFingerprint fingerprint = new ReqInsightFingerprint();
    private final ReqPlanningAssessmentRepository planningRepository = mock(ReqPlanningAssessmentRepository.class);
    private final ReqItemViewAssembler assembler = new ReqItemViewAssembler(
            repository, fingerprint, planningRepository);

    @Test
    void marksInsightStaleWhenSourceFactsChange() {
        ReqItem item = item("req-1", "新标题");
        ReqItem oldItem = item("req-1", "旧标题");
        when(repository.findLatestByItemIds(List.of("req-1"))).thenReturn(Map.of(
                "req-1", insight(oldItem, ReqInsightType.ITEM, null)));
        when(planningRepository.findLatestByItemIds(List.of("req-1"))).thenReturn(Map.of());

        ReqItemView view = assembler.from(item, List.of(item));

        assertThat(view.aiInsightStale()).isTrue();
        assertThat(view.aiInsightStaleReason()).isEqualTo("SOURCE_CHANGED");
    }

    @Test
    void marksPortfolioStaleWhenActiveSetChanges() {
        ReqItem first = item("req-1", "一");
        ReqItem second = item("req-2", "二");
        ReqInsight latest = insight(
                first, ReqInsightType.PORTFOLIO, fingerprint.portfolioSetHash(List.of(first)));
        when(repository.findLatestByItemIds(List.of("req-1"))).thenReturn(Map.of(
                "req-1", latest));
        when(planningRepository.findLatestByItemIds(List.of("req-1"))).thenReturn(Map.of());

        ReqItemView view = assembler.from(first, List.of(first, second));

        assertThat(view.aiInsightStale()).isTrue();
        assertThat(view.aiInsightStaleReason()).isEqualTo("PORTFOLIO_CHANGED");
    }

    private ReqInsight insight(ReqItem item, ReqInsightType type, String portfolioHash) {
        return new ReqInsight(
                "history", item.getId(), type, "v1", fingerprint.sourceHash(item), portfolioHash,
                "{}", "claude", null, 10);
    }

    private static ReqItem item(String id, String title) {
        return ReqItem.builder()
                .id(id)
                .title(title)
                .description("描述")
                .project("kai-toolbox")
                .module("reqpool")
                .priority("MEDIUM")
                .status("DRAFT")
                .aiInsight("{}")
                .createdAt(1)
                .updatedAt(1)
                .build();
    }
}
