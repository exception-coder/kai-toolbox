package com.exceptioncoder.toolbox.procurement;

import com.exceptioncoder.toolbox.common.sqlite.SchemaInitializer;
import com.exceptioncoder.toolbox.common.sqlite.SqliteConfig;
import com.exceptioncoder.toolbox.llm.routing.ChatModelRouter;
import com.exceptioncoder.toolbox.procurement.config.ProcurementSeedInitializer;
import com.exceptioncoder.toolbox.procurement.domain.ProcurementCandidates;
import com.exceptioncoder.toolbox.procurement.domain.ProcurementStore;
import com.exceptioncoder.toolbox.procurement.service.ProcurementCatalogService;
import com.exceptioncoder.toolbox.procurement.service.ProcurementParsingService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import java.nio.file.Files;
import java.util.List;
import java.util.Map;
import java.util.Set;
import static com.exceptioncoder.toolbox.procurement.domain.ProcurementData.*;
import static org.assertj.core.api.Assertions.*;

/** 使用真实 SQLite 验证种子幂等、管理持久化与模型证据边界。 */
@SpringBootTest(classes = ProcurementIntegrationTest.Application.class, properties = "toolbox.procurement.parser=GATEWAY")
class ProcurementIntegrationTest {
    @SpringBootConfiguration
    @EnableAutoConfiguration
    @ComponentScan({"com.exceptioncoder.toolbox.procurement", "com.exceptioncoder.toolbox.common.sqlite"})
    static class Application {
        @Bean
        ChatModelRouter chatModelRouter() {
            ChatModelRouter router = org.mockito.Mockito.mock(ChatModelRouter.class);
            org.mockito.Mockito.when(router.forTier("procurement")).thenThrow(new IllegalStateException("测试网关离线"));
            return router;
        }
    }

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) throws Exception {
        var file = Files.createTempFile("procurement-test-", ".db");
        file.toFile().deleteOnExit();
        registry.add("toolbox.sqlite.file", file::toString);
    }

    @Autowired ProcurementStore store;
    @Autowired ProcurementCatalogService catalog;
    @Autowired ProcurementParsingService parsing;
    @Autowired ProcurementSeedInitializer seed;
    @Autowired ObjectMapper mapper;

    @Test
    void seedCountsAndEditsSurviveReinitialization() throws Exception {
        assertThat(store.sites()).hasSize(8);
        assertThat(store.rules()).hasSize(171);
        assertThat(store.overview().get("notices")).isEqualTo(59);
        assertThat(store.targets("", "")).anyMatch(n -> n.sourceData().contains("duplicateSourceRows"));
        Rule original = store.rules().stream().filter(r -> r.id().equals("KW_001")).findFirst().orElseThrow();
        Rule changed = new Rule(original.id(), original.category(), "测试修改", false, original.fields());
        catalog.saveRule(changed.id(), changed);
        seed.run(null);
        assertThat(store.rules()).anyMatch(r -> r.id().equals(changed.id())
                && r.name().equals(changed.name()) && !r.enabled());
        catalog.saveRule(original.id(), original);
    }

    @Test
    void failedCapturePreservesPreviousEvidenceAndPagingDoesNotExposeRawText() {
        Notice notice = store.targets("", "").getFirst();
        store.saveCapture(new Notice(notice.id(), notice.siteId(), notice.url(), notice.title(), "FAILED",
                "CANDIDATES_ONLY", "上次采集正文", notice.url(), notice.url(), 200, "2026-09-01T00:00:00Z",
                "本次 HTTP 502", "{}", "{}", notice.sourceData(), "test", ""));
        assertThat(store.notice(notice.id()).rawText()).isEqualTo("上次采集正文");
        assertThat(store.notices(new NoticeQuery("", "", "FAILED", 0)).items())
                .allMatch(item -> item.rawText().isEmpty() && item.sourceData().equals("{}"));
    }

    @Test
    void rejectsPrivateUrlsInvalidRulesAndDuplicateSources() {
        assertThatThrownBy(() -> ProcurementCatalogService.validateUrl("http://127.0.0.1/admin", Set.of("www.ggzy.gov.cn")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ProcurementCatalogService.validateUrl("https://www.ggzy.gov.cn@localhost/", Set.of("www.ggzy.gov.cn")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> catalog.saveRule("x", new Rule("x", "SCRIPT", "test", true, Map.of())))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> catalog.addNotice(store.targets("", "").getFirst().url(), "重复"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void numericalCandidatesNeverSumRiverAndPipeLengths() {
        var candidates = ProcurementCandidates.extract("排水管道11.428公里，河道治理1.28公里。北京时间。", List.of());
        assertThat(candidates).containsEntry("status", "CANDIDATES_ONLY");
        assertThat(candidates).doesNotContainKeys("province", "pipeLength", "target_length_total");
        assertThat((List<?>) candidates.get("numbers")).hasSize(2);
    }

    @Test
    void modelQuotaErrorsExplainRecoveryWithoutLeakingResponse() {
        String message = ProcurementParsingService.failureMessage(new java.util.concurrent.ExecutionException(
                new IllegalStateException("insufficient_user_quota secret-value")));
        assertThat(message).contains("额度不足", "解析").doesNotContain("secret-value");
    }

    @Test
    void acceptsGroundedFactsAndRejectsInventedEvidenceAndClassification() throws Exception {
        String text = "建设地点：焦作市，管径DN300。";
        var valid = mapper.readTree("{\"facts\":[{\"field\":\"city\",\"value\":\"焦作市\","
                + "\"evidence\":\"建设地点：焦作市\",\"section\":\"建设地点\"}]}");
        assertThat(parsing.validate(valid, text, List.of())).isEqualTo(valid);
        assertThatThrownBy(() -> parsing.validate(valid, "没有该地区", List.of()))
                .isInstanceOf(IllegalArgumentException.class);
        var unknown = mapper.readTree("{\"facts\":[{\"field\":\"notice_stage\",\"value\":\"STG_UNKNOWN\","
                + "\"evidence\":\"建设地点：焦作市\",\"section\":\"标题\"}]}");
        assertThatThrownBy(() -> parsing.validate(unknown, text, List.of())).isInstanceOf(IllegalArgumentException.class);
        assertThat(parsing.parse(text, List.of(), true).status()).isEqualTo("MANUAL_CHECK");
        assertThat(parsing.parse(text, List.of(), false).status()).isEqualTo("CANDIDATES_ONLY");
    }
}
