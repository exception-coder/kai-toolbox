package com.exceptioncoder.toolbox.reqpool.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReqPlanningAssessmentNormalizerTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final ReqPlanningAssessmentNormalizer normalizer = new ReqPlanningAssessmentNormalizer(mapper);

    @Test
    void deterministicallyAddsConfidenceBufferAndPersonDays() throws Exception {
        JsonNode result = mapper.readTree(normalizer.normalize(validOutput("MEDIUM")));

        assertThat(result.path("criteriaVersion").asText()).isEqualTo("initial-spec-planning-v3");
        assertThat(result.path("hoursMin").asInt()).isEqualTo(15);
        assertThat(result.path("hoursMax").asInt()).isEqualTo(29);
        assertThat(result.path("personDaysMin").decimalValue()).isEqualByComparingTo("2.5");
        assertThat(result.path("personDaysMax").decimalValue()).isEqualByComparingTo("4.8");
    }

    @Test
    void rejectsMissingStandardWorkPackage() throws Exception {
        JsonNode invalid = mapper.readTree(validOutput("HIGH"));
        ((com.fasterxml.jackson.databind.node.ArrayNode) invalid
                .path("capabilities").get(0).path("workPackages")).remove(5);

        assertThatThrownBy(() -> normalizer.normalize(mapper.writeValueAsString(invalid)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("六类工作包");
    }

    @Test
    void identifiesMissingScopeByCapabilityPositionAndBusinessMeaning() throws Exception {
        JsonNode invalid = mapper.readTree(validOutput("HIGH"));
        ((com.fasterxml.jackson.databind.node.ObjectNode) invalid
                .path("capabilities").get(0)).remove("scope");

        assertThatThrownBy(() -> normalizer.normalize(mapper.writeValueAsString(invalid)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("第 1 个领域功能的范围说明（scope）缺失");
    }

    @Test
    void rejectsRepeatedTechnicalWorkThatInflatesOneBusinessCapability() throws Exception {
        JsonNode invalid = mapper.readTree(validOutput("LOW"));
        var packages = (com.fasterxml.jackson.databind.node.ArrayNode) invalid
                .path("capabilities").get(0).path("workPackages");
        int[] inflatedMaximums = {8, 24, 20, 12, 12, 12};
        for (int index = 0; index < packages.size(); index++) {
            ((com.fasterxml.jackson.databind.node.ObjectNode) packages.get(index))
                    .put("hoursMax", inflatedMaximums[index]);
        }

        assertThatThrownBy(() -> normalizer.normalize(mapper.writeValueAsString(invalid)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("业务功能基础工时上界不能超过 60 小时");
    }

    private static String validOutput(String confidence) {
        return """
                {
                  "summary":"按订单领域独立验收",
                  "assumptions":["复用现有权限"],
                  "capabilities":[{
                    "id":"CAP-001",
                    "domain":"订单",
                    "name":"审核前取消",
                    "businessOutcome":"减少人工撤单",
                    "scope":"支持审核前主动取消",
                    "specRefs":["REQ-001"],
                    "evidenceRefs":["EVD-001"],
                    "dependencies":[],
                    "risks":[],
                    "confidence":"%s",
                    "workPackages":[
                      {"type":"DISCOVERY_DESIGN","hoursMin":2,"hoursMax":3,"reason":"规则核对"},
                      {"type":"BACKEND","hoursMin":5,"hoursMax":8,"reason":"状态与接口"},
                      {"type":"FRONTEND","hoursMin":3,"hoursMax":5,"reason":"入口与反馈"},
                      {"type":"DATA","hoursMin":1,"hoursMax":2,"reason":"字段核验"},
                      {"type":"INTEGRATION","hoursMin":2,"hoursMax":2,"reason":"模块联调"},
                      {"type":"TEST_VERIFICATION","hoursMin":2,"hoursMax":3,"reason":"回归"}
                    ]
                  }]
                }
                """.formatted(confidence);
    }
}
