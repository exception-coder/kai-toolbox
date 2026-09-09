package com.exceptioncoder.toolbox.procurement;

import com.exceptioncoder.toolbox.procurement.domain.ProcurementDiscovery;
import com.exceptioncoder.toolbox.procurement.domain.ProcurementStore;
import com.exceptioncoder.toolbox.procurement.service.ProcurementDiscoveryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import java.nio.file.Files;
import java.util.List;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

/** 列表批次隔离、链接去重与重启恢复使用真实 SQLite 验证。 */
@SpringBootTest(classes = ProcurementIntegrationTest.Application.class, properties = "toolbox.procurement.parser=GATEWAY")
class ProcurementDiscoveryIntegrationTest {
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) throws Exception {
        var file = Files.createTempFile("procurement-discovery-test-", ".db");
        file.toFile().deleteOnExit();
        registry.add("toolbox.sqlite.file", file::toString);
    }
    @Autowired ProcurementDiscovery.Store discovery;
    @Autowired ProcurementStore notices;
    @Autowired ProcurementDiscoveryService service;
    @Autowired com.exceptioncoder.toolbox.procurement.service.ProcurementStructureService structure;

    @Test
    void duplicateLinksPreserveNoticesAndUnknownRegionsDoNotEnterDetails() {
        String id = UUID.randomUUID().toString();
        discovery.create(id, "2026-09-06");
        var existing = notices.targets("www.ggzy.gov.cn", "").getFirst();
        var known = new ProcurementDiscovery.Link("列表标题不得覆盖现存公告", existing.url(), "2026-09-06",
                "河北省", "列表元信息", "河北", "MATCHED");
        var unknown = new ProcurementDiscovery.Link("地区不明", "https://www.ggzy.gov.cn/information/deal/unknown.html",
                "2026-09-06", "央企招投标", "", "", "REGION_UNKNOWN");
        var page = new ProcurementDiscovery.Event("page", "省平台", "河北", null, 1, 0, 0,
                "2026-09-06", "", List.of(known, unknown));
        discovery.accept(id, page);
        discovery.accept(id, page);
        assertThat(discovery.links(id, "MATCHED", 0).total()).isEqualTo(1);
        assertThat(discovery.links(id, "REGION_UNKNOWN", 0).total()).isEqualTo(1);
        assertThat(discovery.noticeIds(id)).containsExactly(existing.id());
        assertThat(notices.notice(existing.id())).isEqualTo(existing);
    }

    @Test
    void newlyDiscoveredMatchedLinkIsPendingAndParseRequiresDetails() {
        String id = UUID.randomUUID().toString();
        discovery.create(id, "2026-09-06");
        var link = new ProcurementDiscovery.Link("新发现公告", "https://www.ggzy.gov.cn/information/deal/new.html",
                "2026-09-06", "北京市", "", "北京", "MATCHED");
        discovery.accept(id, new ProcurementDiscovery.Event("page", "省平台", "北京", null, 1, 0, 0,
                "2026-09-06", "", List.of(link)));
        discovery.finish(id, "COMPLETED", "");
        var notice = notices.notice(discovery.noticeIds(id).getFirst());
        assertThat(notice.captureStatus()).isEqualTo("PENDING");
        assertThat(notice.rawText()).isEmpty();
        assertThatThrownBy(() -> service.details(id, true)).hasMessageContaining("第 2 步");
        var business = structure.businessPage(new com.exceptioncoder.toolbox.procurement.domain.ProcurementData.NoticeQuery(
                "新发现公告", "www.ggzy.gov.cn", "", 0, true));
        assertThat(business.get("total")).isEqualTo(1L);
        assertThat(business.get("items").toString()).contains("analysis={}").doesNotContain("schemaFields");
        assertThat(structure.businessPage(new com.exceptioncoder.toolbox.procurement.domain.ProcurementData.NoticeQuery(
                "新发现公告", "ggzy.hebei.gov.cn", "", 0, true)).get("total")).isEqualTo(0L);
    }

    @Test
    void unfinishedScopesAreInterruptedOnRestart() {
        String id = UUID.randomUUID().toString();
        discovery.create(id, "2026-09-06");
        discovery.accept(id, new ProcurementDiscovery.Event("scope", "省平台", "天津", "RUNNING", 0, 0, 0,
                null, "", null));
        discovery.interrupt();
        assertThat(discovery.batch(id)).containsEntry("status", "INTERRUPTED");
        assertThat(discovery.batch(id).get("scopes").toString()).contains("INTERRUPTED");
    }
}
