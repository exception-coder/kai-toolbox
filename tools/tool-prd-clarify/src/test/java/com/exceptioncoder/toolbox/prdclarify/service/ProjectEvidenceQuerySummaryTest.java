package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceQuery;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ProjectEvidenceQuerySummaryTest {

    @Test
    void summarizesEmbeddedAttachmentIntoBusinessCluesAndTechnicalCoordinates() {
        String description = "补充齐纱 200 公斤门槛。\n"
                + "[附件：规格.md](/api/files/spec)\n---\n【附件：规格.md】\n"
                + "# 新品全程进度\n"
                + "管理层需要查看织造计划、调拨、审批和番禺仓入库的里程碑。\n"
                + "入口 `/product/list.action?ismenu=1`，表 `erp_morder`，复用 ProductOrderService。\n"
                + "附件正文".repeat(2_000);

        String result = ProjectEvidenceQuerySummary.build(new ProjectEvidenceQuery(
                "新品进度管理", description, "yoooni-one", "生产管理"));

        assertThat(result).contains("需求标题：新品进度管理")
                .contains("需求摘要：补充齐纱 200 公斤门槛")
                .contains("附件业务线索：新品全程进度")
                .contains("管理层需要查看织造计划、调拨、审批和番禺仓入库的里程碑")
                .contains("技术坐标：")
                .contains("/product/list.action?ismenu=1")
                .contains("erp_morder")
                .contains("ProductOrderService")
                .doesNotContain("附件正文附件正文");
        assertThat(result.length()).isLessThanOrEqualTo(ProjectEvidenceQuerySummary.MAX_QUERY_CHARS);
    }

    @Test
    void boundsPlainDescriptionsWithoutAttachmentMarkers() {
        String result = ProjectEvidenceQuerySummary.build(new ProjectEvidenceQuery(
                "需求", "业务描述".repeat(2_000), "project", null));

        assertThat(result.length()).isLessThanOrEqualTo(ProjectEvidenceQuerySummary.MAX_QUERY_CHARS);
    }
}
