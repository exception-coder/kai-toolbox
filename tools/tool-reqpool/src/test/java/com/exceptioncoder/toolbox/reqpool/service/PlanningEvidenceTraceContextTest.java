package com.exceptioncoder.toolbox.reqpool.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PlanningEvidenceTraceContextTest {

    private final PlanningEvidenceTraceContext context = new PlanningEvidenceTraceContext(new ObjectMapper());

    @Test
    void distinguishesCurrentGapsFromLegacyHits() {
        String result = context.promptContext(trace());

        assertThat(result)
                .contains("当前实现 yoooni-one")
                .contains("数据源缺失 [代码图谱]")
                .contains("遗留来源 yoooni")
                .contains("已命中")
                .contains("数据库 DDL")
                .contains("迁移与复用依据")
                .contains("T_PRODUCT_ORDER");
    }

    @Test
    void rejectsGlobalMissingClaimWhenLegacyEvidenceHit() {
        String payload = "{\"summary\":\"当前没有已评审业务知识、代码图谱、数据库 DDL，无法分析\"}";

        assertThatThrownBy(() -> context.validateClaims(payload, trace()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("证据轨迹矛盾");
    }

    @Test
    void acceptsGapExplicitlyScopedToCurrentImplementation() {
        String payload = "{\"summary\":\"当前实现项目缺少代码图谱；遗留项目已命中，可用于迁移核验\"}";

        context.validateClaims(payload, trace());
    }

    private static String trace() {
        return """
                {
                  "version":"planning-evidence-trace-v2",
                  "traceId":"trace-1",
                  "primaryProject":"yoooni-one",
                  "sources":[
                    {"source":"GRAPHIFY","sourceProject":"yoooni-one","projectRole":"CURRENT_IMPLEMENTATION","status":"SOURCE_MISSING","excerpt":""},
                    {"source":"DOMAIN_KNOWLEDGE","sourceProject":"yoooni-one","projectRole":"CURRENT_IMPLEMENTATION","status":"NO_HIT","excerpt":""},
                    {"source":"GRAPHIFY","sourceProject":"yoooni","projectRole":"LEGACY_SOURCE","status":"HIT","excerpt":"OrderAction -> OrderService"},
                    {"source":"DDL","sourceProject":"yoooni","projectRole":"LEGACY_SOURCE","status":"HIT","excerpt":"T_PRODUCT_ORDER"}
                  ]
                }
                """;
    }
}
