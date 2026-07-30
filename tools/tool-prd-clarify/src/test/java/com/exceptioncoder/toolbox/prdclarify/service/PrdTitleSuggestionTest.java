package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PrdTitleSuggestionTest {

    @Test
    void removesDuplicatedPrefixAndFormatsFullTitle() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        when(runner.runOnce(anyString(), anyString(), isNull(), eq("claude"), anyList()))
                .thenReturn("标题：SRM-采购询价-自动催报价。");
        PrdClarifyService service = service(runner);

        PrdClarifyService.TitleSuggestion result =
                service.suggestTitle("SRM", "采购询价", "报价截止前自动提醒供应商");

        assertThat(result.shortTitle()).isEqualTo("自动催报价");
        assertThat(result.title()).isEqualTo("SRM-采购询价-自动催报价");
    }

    @Test
    void fallsBackToDescriptionWhenAgentFails() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        when(runner.runOnce(anyString(), anyString(), isNull(), eq("claude"), anyList()))
                .thenThrow(new IllegalStateException("agent unavailable"));
        PrdClarifyService service = service(runner);

        PrdClarifyService.TitleSuggestion result =
                service.suggestTitle("ERP", "库存", "支持批量导入安全库存\n补充说明");

        assertThat(result.shortTitle()).isEqualTo("支持批量导入安全库存");
        assertThat(result.title()).isEqualTo("ERP-库存-支持批量导入安全库存");
    }

    private PrdClarifyService service(AgentOneShotRunner runner) {
        return new PrdClarifyService(
                runner,
                mock(PrdSessionRepository.class),
                mock(PrdFileStore.class),
                new ObjectMapper(),
                mock(GraphifyQueryService.class),
                mock(DomainKnowledgeQueryService.class),
                mock(ImageAttachmentStorageService.class));
    }
}
