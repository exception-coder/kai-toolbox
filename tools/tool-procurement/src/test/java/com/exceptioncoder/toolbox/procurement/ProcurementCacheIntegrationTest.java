package com.exceptioncoder.toolbox.procurement;

import com.exceptioncoder.toolbox.procurement.domain.*;
import com.exceptioncoder.toolbox.procurement.service.ProcurementRunService;
import com.exceptioncoder.toolbox.procurement.service.ProcurementParsingService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import java.nio.file.Files;
import java.util.List;
import java.util.Map;
import static com.exceptioncoder.toolbox.procurement.domain.ProcurementData.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 真实 SQLite 快照完整性及缓存复用的浏览器零调用回归。 */
@SpringBootTest(classes = ProcurementIntegrationTest.Application.class, properties = "toolbox.procurement.parser=GATEWAY")
class ProcurementCacheIntegrationTest {
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) throws Exception {
        var file = Files.createTempFile("procurement-cache-test-", ".db");
        file.toFile().deleteOnExit();
        registry.add("toolbox.sqlite.file", file::toString);
    }
    @Autowired ProcurementCacheStore cache;
    @Autowired ProcurementStore store;
    @Autowired ProcurementParsingService parsing;
    @Autowired com.exceptioncoder.toolbox.procurement.service.ProcurementExperienceService experiences;

    @Test
    void registeredExamplesUseProductionValidationAndPersistWithoutChangingNotices() {
        var before = store.targets("", "");
        var result = experiences.regress();
        assertThat(result.path("total").asInt()).isEqualTo(14);
        assertThat(result.path("passed").asInt()).isEqualTo(14);
        assertThat(experiences.catalog().path("rules").size()).isEqualTo(9);
        assertThat(experiences.history()).anyMatch(run -> run.path("id").equals(result.path("id")));
        assertThat(store.targets("", "")).isEqualTo(before);
        assertThat(cache.exampleRuns().getFirst()).contains("schemaSnapshot", "ruleSnapshot");
    }

    @Test
    void snapshotKeepsOuterHtmlAndFramesAndDoesNotOverwrite() {
        String id = store.targets("", "").getFirst().id();
        Capture first = new Capture("公告", "采购人：测试公司", "https://www.ggzy.gov.cn/a", "https://www.ggzy.gov.cn/b", 200,
                List.of(), "<html><iframe src='/b'></iframe></html>", List.of(new PageFrame("/b", "<p>正文</p>", "正文")));
        cache.save(id, first);
        cache.save(id, new Capture("其他", "其他", "", "", 200, List.of()));
        assertThat(cache.find(id)).contains(first);
    }

    @Test
    void cachedNoticeNeverCallsBrowserAndPreservesCapturedTime() {
        ProcurementStore data = mock(ProcurementStore.class);
        ProcurementCollector browser = mock(ProcurementCollector.class);
        ProcurementParsingService parser = mock(ProcurementParsingService.class);
        ProcurementCacheStore snapshots = mock(ProcurementCacheStore.class);
        Notice n = new Notice("cached", "www.ggzy.gov.cn", "https://www.ggzy.gov.cn/a", "公告", "SUCCESS",
                "PENDING", "本地缓存正文", "url", "frame", 200, "2026-09-06T01:00:00Z", "", "{}", "{}", "{}", "", "");
        when(data.targets("", "cached")).thenReturn(List.of(n));
        when(data.rules()).thenReturn(List.of());
        when(data.sites()).thenReturn(List.of());
        when(parser.parse(anyString(), anyList(), eq(true))).thenReturn(new Parsed("PARSED", "{}", "{}", ""));
        new ProcurementRunService(data, browser, parser, snapshots, mock(com.exceptioncoder.toolbox.procurement.service.ProcurementRuleGroupService.class)).start("", "cached", true, true);
        verify(data, timeout(2000)).saveCapture(argThat(result -> result.capturedAt().equals(n.capturedAt())));
        verifyNoInteractions(browser);
    }

    @Test
    void deterministicFactsRequireUniqueValuesAndExplicitRoles() {
        String text = "项目编号：ABC-123\n预算金额：12.5万元\n招标人：甲公司\n联系人：张三\n电话：13800138000\n"
                + "招标代理机构：乙公司\n联系人：李四\n电话：13900139000";
        var facts = ProcurementBusinessExtractor.extract(text);
        assertThat(facts).anyMatch(f -> f.get("field").equals("owner_phone") && f.get("value").equals("13800138000"));
        assertThat(facts).anyMatch(f -> f.get("field").equals("agent_contact") && f.get("value").equals("李四"));
        assertThat(facts).allMatch(f -> text.contains(f.get("evidence")));
        assertThat(ProcurementBusinessExtractor.extract("项目编号：AAA-111\n项目编号：BBB-222\n电话：13800138000"))
                .noneMatch(f -> f.get("field").equals("project_number") || f.get("field").endsWith("phone"));
        var parallel = ProcurementBusinessExtractor.extract("招标人：甲公司\t招标代理机构：乙公司\n联系人：张三\t联系人：李四\n电话：13800138000\t电话：13900139000");
        assertThat(parallel).anyMatch(f -> f.get("field").equals("owner") && f.get("value").equals("甲公司"));
        assertThat(parallel).noneMatch(f -> f.get("field").endsWith("phone") || f.get("field").endsWith("contact"));
        assertThat(ProcurementBusinessExtractor.extract("1.采购人信息\n名称：甲单位 2.采购代理机构信息\n名称：乙单位\n联系方式：13800138000"))
                .noneMatch(f -> f.get("field").equals("owner_phone"));
    }

    @Test
    void failedModelRetryKeepsPreviouslyExtractedValues() {
        String previous = "{\"facts\":[{\"field\":\"owner\",\"value\":\"甲公司\"}]}";
        Parsed failed = new Parsed("MANUAL_CHECK", "{}", "{\"facts\":[]}", "模型不可用");
        assertThat(parsing.retainOnFailure(previous, failed)).isEqualTo(previous);
        assertThat(parsing.retainOnFailure("{}", failed)).isEqualTo(failed.analysis());
    }
}
