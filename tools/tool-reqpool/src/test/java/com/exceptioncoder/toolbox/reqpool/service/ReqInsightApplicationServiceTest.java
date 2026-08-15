package com.exceptioncoder.toolbox.reqpool.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ReqInsightApplicationServiceTest {

    @Test
    void doesNotPersistPortfolioWhenModelReturnsForeignId() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        ReqInsightPersistenceService persistence = mock(ReqInsightPersistenceService.class);
        ReqInsightApplicationService service = new ReqInsightApplicationService(
                runner,
                new ReqInsightValidator(new ObjectMapper()),
                new ReqInsightFingerprint(),
                persistence
        );
        when(runner.runOnce(anyString(), anyString(), nullable(String.class), anyString())).thenReturn("""
                {"portfolioSummary":"排序完成","items":[
                  {"id":"outside","rank":1,"priority":"HIGH","stars":4,"recommendation":"先做",
                   "reason":"价值高","impacts":["订单"],"roi":"HIGH","estimatedHours":12,"comparedTo":"影响更广"}
                ]}
                """);

        assertThatThrownBy(() -> service.analyzePortfolio(List.of(item("req-1"))))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("输入集合外");
        verifyNoInteractions(persistence);
    }

    private static ReqItem item(String id) {
        return ReqItem.builder()
                .id(id)
                .title("需求")
                .description("描述")
                .priority("MEDIUM")
                .status("DRAFT")
                .build();
    }
}
