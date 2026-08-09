package com.exceptioncoder.toolbox.foreconsult.service.orchestration;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

/** v3：在完整 v2 流程上增加 ERP 生产备库结构校验门禁。 */
@Configuration
public class ConsultProductionStandbyStepConfiguration {

    @Bean
    ConsultOrchestrationStep consultV3ProductionStandbySchemaStep() {
        return new ProductionStandbyPromptStep();
    }

    private record ProductionStandbyPromptStep() implements ConsultProductionStandbyOrchestrationStep {
        @Override
        public String id() {
            return "v3-erp-production-standby-schema";
        }

        @Override
        public String label() {
            return "ERP 生产备库结构校验";
        }

        @Override
        public int order() {
            return 450;
        }

        @Override
        public ConsultStepAvailability availability() {
            return ConsultStepAvailability.AVAILABLE;
        }

        @Override
        public List<String> capabilityGaps() {
            return List.of("生产备库结构按本地 DDL 快照校验；快照更新时间之后的数据库变更仍需 IT 核实");
        }

        @Override
        public void apply(ConsultOrchestrationContext context) {
            context.addSection("ERP 生产备库结构校验", """
                    仅当准备输出“供 ERP 生产备库执行”的 SELECT/WITH 查询 SQL 时，必须在最终回答前调用 consult-readonly.erp_standby_validate_sql 校验完整 SQL。
                    校验必须覆盖 FROM/JOIN 引用的对象，并区分 TABLE 与 VIEW；不得因为正库存在同名表就假设备库也存在。
                    若对象缺失，使用 consult-readonly.erp_standby_schema_search 核对实际可用表、视图和字段。只有工具返回的 DDL 结构能证明替代关系时才可改写 SQL；名称相似只能作为候选，必须明确标注待 IT 确认。
                    SQL 未通过校验、结构快照不可用或字段证据不足时，不得写“可直接在生产执行”，应列出缺失对象、候选视图和需要补充的结构信息。
                    非 ERP、非生产环境、不是查询 SQL 的回答不触发本门禁，也不得借此扩大数据库访问权限。
                    """);
        }
    }
}
