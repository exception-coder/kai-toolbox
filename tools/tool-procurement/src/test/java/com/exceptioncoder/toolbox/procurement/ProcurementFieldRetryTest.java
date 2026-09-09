package com.exceptioncoder.toolbox.procurement;

import com.exceptioncoder.toolbox.procurement.domain.*;
import com.exceptioncoder.toolbox.procurement.service.ProcurementParsingService;
import com.exceptioncoder.toolbox.llm.routing.ChatModelRouter;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ProcurementFieldRetryTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final ProcurementModel model = mock(ProcurementModel.class);
    private ProcurementParsingService parser() {
        var store = mock(ProcurementStructureStore.class);
        when(store.schema()).thenReturn(new ProcurementStructure.Schema(1, List.of(
                new ProcurementStructure.Field("owner", "采购人", "业务", "TEXT", "LLM", "", true, 1),
                new ProcurementStructure.Field("city", "城市", "业务", "TEXT", "LLM", "", true, 2),
                new ProcurementStructure.Field("procurement_amount", "金额", "业务", "DECIMAL", "LLM", "", true, 3))));
        var parser = new ProcurementParsingService(mapper, mock(ChatModelRouter.class), store);
        ReflectionTestUtils.setField(parser, "codex", model);
        return parser;
    }
    private String fact(String field, String value, String evidence) {
        return "{\"field\":\"" + field + "\",\"value\":\"" + value
                + "\",\"evidence\":\"" + evidence + "\",\"section\":\"项目概况\"}";
    }
    @Test
    void validFieldsSurviveAndRetryReceivesOnlyUnresolvedFields() throws Exception {
        when(model.extract(anyString(), anyString())).thenReturn("{\"facts\":["
                + fact("city", "北京市", "北京市") + "," + fact("procurement_amount", "100", "金额100") + "]}");
        var result = parser().parse("北京市 金额100", List.of(), true);
        var analysis = mapper.readTree(result.analysis());
        assertThat(result.status()).isEqualTo("PARTIAL");
        assertThat(analysis.path("facts").size()).isEqualTo(1);
        assertThat(analysis.path("diagnostics").path("rounds").size()).isEqualTo(2);
        assertThat(analysis.path("diagnostics").path("rounds").get(1).path("allowedFields").toString()).doesNotContain("city");
        assertThat(analysis.path("diagnostics").path("unresolvedErrors").toString()).contains("金额必须");
        verify(model, times(2)).extract(anyString(), anyString());
    }
    @Test
    void explicitLabelUnitsNormalizeWithoutGuessing() {
        var field = new ProcurementStructure.Field("procurement_amount", "金额", "业务", "DECIMAL", "LLM", "", true, 1);
        assertThat(ProcurementValueTypes.normalize(field, "预算金额（元）：1050000", true)).isEqualTo("105");
        assertThatThrownBy(() -> ProcurementValueTypes.normalize(field, "1050000", true)).hasMessageContaining("单位");
        assertThat(ProcurementBusinessExtractor.extract("预算金额（元）：1050000"))
                .anyMatch(f -> f.get("value").equals("预算金额（元）：1050000"));
    }
    @Test
    void whitespaceRepairPreservesActualEvidenceAndMissingIsNotFailure() throws Exception {
        when(model.extract(anyString(), anyString())).thenReturn("{\"facts\":[" + fact("owner", "甲公司", "名称： 甲公司") + "]}");
        var result = parser().parse("名称：\n甲公司", List.of(), true);
        assertThat(result.status()).isEqualTo("PARSED");
        var diagnostics = mapper.readTree(result.analysis()).path("diagnostics");
        assertThat(diagnostics.toString()).contains("UNIQUE_WHITESPACE_EVIDENCE", "NOT_EXTRACTED");
        verify(model).extract(anyString(), anyString());
    }
    @Test
    void invocationFailureIsDistinctAndRetainsDiagnostic() throws Exception {
        when(model.extract(anyString(), anyString())).thenThrow(new IllegalStateException("offline"));
        var result = parser().parse("缓存正文", List.of(), true);
        assertThat(mapper.readTree(result.analysis()).path("diagnostics").path("execution").asText()).isEqualTo("CALL_FAILED");
        verify(model).extract(anyString(), anyString());
    }
    @Test
    void badEnvelopeGetsOneCorrectiveRetry() throws Exception {
        when(model.extract(anyString(), anyString())).thenReturn("bad", "{\"facts\":[" + fact("city", "北京市", "北京市") + "]}");
        var result = parser().parse("北京市", List.of(), true);
        assertThat(result.status()).isEqualTo("PARSED");
        assertThat(mapper.readTree(result.analysis()).path("diagnostics").path("rounds").get(0).path("rawOutput").asText()).isEqualTo("bad");
        verify(model, times(2)).extract(anyString(), anyString());
    }
    @Test
    void bareModelNumberUsesOnlyItsOwnExplicitLabel() throws Exception {
        when(model.extract(anyString(), anyString())).thenReturn("{\"facts\":["
                + fact("procurement_amount", "1050000", "预算金额（元）：1050000") + "]}");
        var result = parser().parse("预算金额（元）：1050000\n最高限价（元）：1050000", List.of(), true);
        assertThat(result.status()).isEqualTo("PARSED");
        assertThat(mapper.readTree(result.analysis()).path("diagnostics").toString()).contains("EXPLICIT_LABEL_UNIT");
    }
    @Test
    void tableAmountExtractsUniqueUnitSpanWithoutIncludingLabel() throws Exception {
        when(model.extract(anyString(), anyString())).thenReturn("{\"facts\":["
                + fact("procurement_amount", "控制价（最高限价） 99,775,461元 人民币", "控制价（最高限价） 99,775,461元 人民币") + "]}");
        var result = parser().parse("控制价（最高限价） 99,775,461元 人民币", List.of(), true);
        assertThat(result.status()).isEqualTo("PARSED");
        var amount = mapper.readTree(result.analysis()).path("facts").get(0).path("value").asText();
        var field = new ProcurementStructure.Field("procurement_amount", "金额", "业务", "DECIMAL", "LLM", "", true, 1);
        assertThat(ProcurementValueTypes.normalize(field, amount, true)).isEqualTo("9977.5461");
        verify(model).extract(anyString(), anyString());
    }
}
