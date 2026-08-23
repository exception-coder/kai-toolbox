package com.exceptioncoder.toolbox.prdclarify.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PrdInitialSpecValidatorTest {

    private final PrdInitialSpecValidator validator = new PrdInitialSpecValidator();

    @Test
    void shouldAcceptCompleteInitialSpec() {
        String content = """
                # 订单取消 · 初始化规格
                ## 1. 探索摘要
                EVD-001 已核验现有入口与状态约束。%s
                ## 2. 目标与范围草案
                GOAL-001 支持审核前取消。
                ## 3. 现有行为、数据结构与约束
                CONSTRAINT-001 仅处理未审核订单。
                ## 4. 需求重构与推荐方案
                ### 4.1 原始做法与真实目标
                原做法是新增取消流程，真实目标是安全减少错误订单。
                ### 4.2 复杂度审计
                现有状态校验和审计能力可复用，无需新增取消状态或审批节点。
                ### 4.3 候选方案
                OPT-001 复用现有状态校验并增加取消动作；OPT-002 新增独立取消审批流。
                ### 4.4 推荐结论
                REC-001 推荐 OPT-001，改动更小且可沿用审计；代价是仅覆盖审核前订单，风险可控。
                ## 5. 需求与规则草案
                REQ-001 提供取消操作。RULE-001 已审核订单不可取消。
                ## 6. 场景与验收草案
                SCN-001 未审核订单取消；AC-001 状态更新且记录操作人。
                ## 7. 证据账本
                EVD-002 来源：代码；结论：现有服务具备状态校验。
                ## 8. 风险与冲突
                暂无已识别冲突。
                ## 9. 开放问题
                无。
                """.formatted("已确认事实。".repeat(80));

        assertThat(validator.validate(content).complete()).isTrue();
    }

    @Test
    void shouldReturnActionableGapsForIncompleteOutput() {
        PrdInitialSpecValidator.ValidationResult result = validator.validate("# 初始化规格");

        assertThat(result.complete()).isFalse();
        assertThat(result.gaps())
                .anyMatch(gap -> gap.contains("500"))
                .anyMatch(gap -> gap.contains("固定章节"))
                .anyMatch(gap -> gap.contains("稳定标识"));
    }

    @Test
    void shouldRejectEmptyComplexityAuditAndRecommendation() {
        String content = """
                # 订单取消 · 初始化规格
                ## 1. 探索摘要
                EVD-001 已核验现有入口与状态约束。%s
                ## 2. 目标与范围草案
                GOAL-001 支持审核前取消。
                ## 3. 现有行为、数据结构与约束
                当前存在订单状态校验。
                ## 4. 需求重构与推荐方案
                ### 4.1 原始做法与真实目标
                用户希望增加取消按钮。
                ### 4.2 复杂度审计
                无。
                ### 4.3 候选方案
                OPT-001
                ### 4.4 推荐结论
                REC-001
                ## 5. 需求与规则草案
                REQ-001 提供取消操作。
                ## 6. 场景与验收草案
                SCN-001 取消订单；AC-001 状态更新。
                ## 7. 证据账本
                EVD-002 来源代码。
                ## 8. 风险与冲突
                无。
                ## 9. 开放问题
                无。
                """.formatted("已确认事实。".repeat(80));

        PrdInitialSpecValidator.ValidationResult result = validator.validate(content);

        assertThat(result.complete()).isFalse();
        assertThat(result.gaps()).hasSize(3)
                .allMatch(gap -> gap.contains("章节内容不足"));
    }
}
