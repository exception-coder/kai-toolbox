package com.exceptioncoder.toolbox.prdclarify.api.dto;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PrdSessionViewBusinessFieldsTest {

    @Test
    void exposesStructuredBusinessFields() {
        PrdSession session = PrdSession.builder()
                .id("prd-1")
                .title("ERP-付款-批量审批")
                .rawInput("需求详情")
                .status("DRAFT")
                .businessRequirementType("功能优化")
                .requirementSoftware("ERP")
                .initiatingDepartment("财务部")
                .requester("张三")
                .requestedAt("2026-07-30")
                .requirementDetail("增加批量审批能力")
                .businessBackground("逐单审批耗时")
                .attachments("流程截图.png")
                .followUpRecords("财务已确认")
                .build();

        PrdSessionView view = PrdSessionView.from(session);

        assertThat(view.businessFields().businessRequirementType()).isEqualTo("功能优化");
        assertThat(view.businessFields().requirementSoftware()).isEqualTo("ERP");
        assertThat(view.businessFields().requirementDetail()).isEqualTo("增加批量审批能力");
        assertThat(view.businessFields().requestedAt()).isEqualTo("2026-07-30");
    }
}
