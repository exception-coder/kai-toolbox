package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultTopologyLink;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTopologyLinkRepository;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class TopologyServiceTest {
    @Test
    void retiresAnalysisWithoutReadingOrOverwritingHistory() {
        var repository = mock(ConsultTopologyLinkRepository.class);
        var routes = mock(ConsultEvidenceRouteService.class);
        var service = new TopologyService(repository, routes);
        assertThatThrownBy(() -> service.analyze(List.of("ERP", "SCM"), "codex"))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode().value()).isEqualTo(410));
        verifyNoInteractions(repository, routes);
    }

    @Test
    void readsHistoricalLinksAndRoutes() {
        var repository = mock(ConsultTopologyLinkRepository.class);
        var routes = mock(ConsultEvidenceRouteService.class);
        when(repository.findAll()).thenReturn(List.of(ConsultTopologyLink.builder()
                .fromSystem("ERP").toSystem("SCM").relation("调用").description("历史记录").build()));
        when(routes.list()).thenReturn(List.of());
        var result = new TopologyService(repository, routes).listPersisted();
        assertThat(result.links()).hasSize(1);
        assertThat(result.links().getFirst().description()).isEqualTo("历史记录");
        verify(repository, never()).replaceAll(anyList());
        verify(routes).list();
    }
}
