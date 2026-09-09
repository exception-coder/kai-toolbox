package com.exceptioncoder.toolbox.procurement;

import com.exceptioncoder.toolbox.procurement.domain.ProcurementStore;
import com.exceptioncoder.toolbox.llm.routing.ChatModelRouter;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.SystemMessage;
import dev.langchain4j.data.message.UserMessage;
import com.exceptioncoder.toolbox.procurement.domain.ProcurementValueTypes;
import com.exceptioncoder.toolbox.procurement.service.ProcurementParsingService;
import com.exceptioncoder.toolbox.procurement.service.ProcurementStructureService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import static com.exceptioncoder.toolbox.procurement.domain.ProcurementData.*;
import static com.exceptioncoder.toolbox.procurement.domain.ProcurementStructure.*;
import static org.assertj.core.api.Assertions.*;

/** 真实 SQLite 验证配置契约、人工修正保护与精确类型转换。 */
@SpringBootTest(classes = ProcurementIntegrationTest.Application.class, properties = "toolbox.procurement.parser=GATEWAY")
class ProcurementStructureIntegrationTest {
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) throws Exception {
        var file = Files.createTempFile("procurement-structure-test-", ".db");
        file.toFile().deleteOnExit();
        registry.add("toolbox.sqlite.file", file::toString);
    }

    @Autowired ProcurementStructureService structure;
    @Autowired ProcurementParsingService parsing;
    @Autowired ProcurementStore store;
    @Autowired ObjectMapper mapper;
    @Autowired ChatModelRouter router;

    @Test
    void versionedSchemaControlsModelFieldsWithoutReplacingHistoricalValues() throws Exception {
        Schema initial = structure.schema();
        assertThat(initial.fields()).hasSize(47);
        assertThat(initial.fields()).extracting(Field::label).contains("建议销售需要做的", "本次招采金额（万元）");
        List<Field> fields = new ArrayList<>(initial.fields());
        fields.add(new Field("delivery_date", "交付日期", "公告信息", "DATE", "LLM", "明确交付日", true, 48));
        Schema updated = structure.save(new Schema(initial.version(), fields));
        assertThat(structure.schema()).isEqualTo(updated);
        assertThatThrownBy(() -> structure.save(initial)).hasMessageContaining("已被修改");
        assertThatThrownBy(() -> structure.save(new Schema(updated.version(), initial.fields())))
                .hasMessageContaining("不可删除");
        var facts = mapper.readTree("{\"facts\":[{\"field\":\"delivery_date\",\"value\":\"2026年9月5日\","
                + "\"evidence\":\"交付日期为2026年9月5日\",\"section\":\"技术要求\"}]}");
        assertThat(parsing.validate(facts, "交付日期为2026年9月5日", List.of())).isEqualTo(facts);
        ChatModel model = org.mockito.Mockito.mock(ChatModel.class);
        org.mockito.Mockito.doReturn(model).when(router).forTier("procurement");
        org.mockito.Mockito.when(model.chat(org.mockito.ArgumentMatchers.any(SystemMessage.class),
                org.mockito.ArgumentMatchers.any(UserMessage.class)))
                .thenReturn(ChatResponse.builder().aiMessage(AiMessage.from(facts.toString())).build());
        try {
            Parsed parsed = parsing.parse("交付日期为2026年9月5日", List.of(), true);
            assertThat(parsed.status()).isEqualTo("PARSED");
            assertThat(mapper.readTree(parsed.analysis()).path("schemaVersion").asInt()).isEqualTo(updated.version());
            assertThat(mapper.readTree(parsed.analysis()).path("schemaFields").size()).isEqualTo(48);
            var prompt = org.mockito.ArgumentCaptor.forClass(SystemMessage.class);
            org.mockito.Mockito.verify(model).chat(prompt.capture(), org.mockito.ArgumentMatchers.any(UserMessage.class));
            assertThat(prompt.getValue().text()).contains("delivery_date", "明确交付日").doesNotContain("sales_action");
        } finally {
            org.mockito.Mockito.doThrow(new IllegalStateException("测试网关离线")).when(router).forTier("procurement");
        }
        fields.set(fields.size() - 1, new Field("delivery_date", "交付日期", "公告信息", "DATE", "LLM", "明确交付日", false, 48));
        structure.save(new Schema(updated.version(), fields));
        assertThatThrownBy(() -> parsing.validate(facts, "交付日期为2026年9月5日", List.of()))
                .isInstanceOf(IllegalArgumentException.class);
        Field original = fields.getFirst();
        fields.set(0, new Field(original.key(), original.label(), original.group(), "DECIMAL", original.mode(), "", true, 1));
        assertThatThrownBy(() -> structure.save(new Schema(structure.schema().version(), fields)))
                .hasMessageContaining("类型不可修改");
    }

    @Test
    void manualCorrectionSurvivesReparseAndRejectsStaleWrites() {
        Notice notice = store.targets("", "").getFirst();
        String historical = notice.sourceData();
        Result initial = structure.result(notice.id());
        assertThat(initial.values()).filteredOn(v -> v.field().key().equals("city"))
                .allMatch(v -> v.value().isEmpty());
        Result corrected = structure.correct(notice.id(), new Correction(initial.schemaVersion(), initial.version(),
                Map.of("city", "人工城市", "procurement_amount", "12.3400", "manual_notes", "待核实金额")));
        assertThat(corrected.overrides()).containsEntry("procurement_amount", "12.34");
        assertThatThrownBy(() -> structure.correct(notice.id(), new Correction(initial.schemaVersion(), initial.version(), Map.of())))
                .hasMessageContaining("已被修改");
        assertThatThrownBy(() -> structure.correct(notice.id(), new Correction(corrected.schemaVersion(), corrected.version(), Map.of("title", "伪标题"))))
                .hasMessageContaining("系统维护");
        String analysis = "{\"schemaVersion\":1,\"facts\":[{\"field\":\"city\",\"value\":\"焦作市\","
                + "\"evidence\":\"建设地点焦作市\",\"section\":\"建设地点\"}]}";
        store.saveCapture(new Notice(notice.id(), notice.siteId(), notice.url(), notice.title(), "SUCCESS", "PARSED",
                "建设地点焦作市", notice.url(), notice.url(), 200, "2026-09-05", "", "{}", analysis, historical, "test", ""));
        Result after = structure.result(notice.id());
        assertThat(after.values()).filteredOn(v -> v.field().key().equals("city"))
                .allMatch(v -> v.value().equals("人工城市") && v.source().equals("MANUAL"));
        Result reset = structure.correct(notice.id(), new Correction(after.schemaVersion(), after.version(), Map.of()));
        assertThat(reset.values()).filteredOn(v -> v.field().key().equals("city"))
                .allMatch(v -> v.value().equals("焦作市") && v.source().equals("LLM"));
        assertThat(store.notice(notice.id()).sourceData()).isEqualTo(historical);
    }

    @Test
    void amountsRequireUnitsAndDatesRequireValidCalendarValues() throws Exception {
        Field amount = structure.schema().fields().stream().filter(f -> f.key().equals("procurement_amount")).findFirst().orElseThrow();
        assertThat(ProcurementValueTypes.normalize(amount, "1,262,451.716元", true)).isEqualTo("126.2451716");
        assertThat(ProcurementValueTypes.normalize(amount, "1.25亿元", true)).isEqualTo("12500");
        assertThatThrownBy(() -> ProcurementValueTypes.normalize(amount, "1262.45", true)).hasMessageContaining("单位");
        assertThatThrownBy(() -> ProcurementValueTypes.normalize(amount, "1美元", true)).hasMessageContaining("单位");
        Field date = structure.schema().fields().stream().filter(f -> f.key().equals("award_date")).findFirst().orElseThrow();
        assertThat(ProcurementValueTypes.normalize(date, "2026年9月5日", true)).isEqualTo("2026-09-05");
        assertThatThrownBy(() -> ProcurementValueTypes.normalize(date, "2026-02-30", false)).isInstanceOf(IllegalArgumentException.class);
        var fabricated = mapper.readTree("{\"facts\":[{\"field\":\"sales_action\",\"value\":\"联系业主\","
                + "\"evidence\":\"联系业主\",\"section\":\"招标人信息\"}]}");
        assertThatThrownBy(() -> parsing.validate(fabricated, "联系业主", List.of())).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void multipleDifferentValuesRemainUnresolved() {
        Notice notice = store.targets("", "").getLast();
        String facts = "{\"facts\":[{\"field\":\"procurement_amount\",\"value\":\"10万元\",\"evidence\":\"一标10万元\",\"section\":\"招标范围\"},"
                + "{\"field\":\"procurement_amount\",\"value\":\"20万元\",\"evidence\":\"二标20万元\",\"section\":\"招标范围\"}]}";
        store.saveCapture(new Notice(notice.id(), notice.siteId(), notice.url(), notice.title(), "SUCCESS", "PARSED",
                "一标10万元二标20万元", notice.url(), notice.url(), 200, "2026-09-05", "", "{}", facts, notice.sourceData(), "test", ""));
        assertThat(structure.result(notice.id()).values()).filteredOn(v -> v.field().key().equals("procurement_amount"))
                .allMatch(v -> v.value().isEmpty() && v.source().equals("CONFLICT") && v.alternatives().equals(List.of("10", "20")));
    }
}
