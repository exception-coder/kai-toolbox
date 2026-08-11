package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultEvidenceRoute;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultEvidenceRouteRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ConsultEvidenceRouteServiceTest {

    @Test
    void confirmedRouteExpandsEvidenceSystemWhenQuestionMatches() {
        ConsultEvidenceRouteRepository repository = mock(ConsultEvidenceRouteRepository.class);
        when(repository.findAll()).thenReturn(List.of(route("CONFIRMED")));
        ConsultEvidenceRouteService service = new ConsultEvidenceRouteService(repository, new ObjectMapper());

        ConsultEvidenceRouteResolution result = service.resolve("SRM", List.of("采购订单"), "查看入库匹配数量");

        assertThat(result.evidenceSystems()).containsExactly("srm", "erp");
        assertThat(result.matchedRoutes()).hasSize(1);
        assertThat(result.snapshot()).contains("ERP");
    }

    @Test
    void unmatchedRouteKeepsOnlyCurrentSystem() {
        ConsultEvidenceRouteRepository repository = mock(ConsultEvidenceRouteRepository.class);
        when(repository.findAll()).thenReturn(List.of(route("CONFIRMED")));
        ConsultEvidenceRouteService service = new ConsultEvidenceRouteService(repository, new ObjectMapper());

        ConsultEvidenceRouteResolution result = service.resolve("SRM", List.of("供应商"), "修改联系人");

        assertThat(result.evidenceSystems()).containsExactly("srm");
        assertThat(result.matchedRoutes()).isEmpty();
    }

    private ConsultEvidenceRoute route(String status) {
        return ConsultEvidenceRoute.builder()
                .id("route-1").contextSystem("SRM").moduleName("采购订单").businessObject("入库数量")
                .keywords("[\"入库\",\"匹配数量\"]").evidenceSystem("ERP").schemaSource("ERP_STANDBY")
                .description("SRM 展示，ERP 保存权威入库数据").evidenceRefs("[]").status(status)
                .source("MANUAL").createdAt(1L).updatedAt(1L).confirmedAt(1L).build();
    }
}
