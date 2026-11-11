package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SidecarPayloadParserTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void parsesMcpServerWithToolsAndProvenance() throws Exception {
        var servers = SidecarPayloadParser.parseMcpServers(mapper.readTree("""
                [{"name":"forge","status":"connected","verified":true,"toolInventoryComplete":true,
                  "tools":[{"name":"prepare_sql_context","provenance":[{"origin":"forge","scope":"session","effective":true}]}],
                  "provenance":[{"origin":"forge","scope":"session","sourceId":"s1","effective":true,"evidence":"runtime"}]}]
                """));
        assertThat(servers).singleElement().satisfies(server -> {
            assertThat(server.name()).isEqualTo("forge");
            assertThat(server.verified()).isTrue();
            assertThat(server.tools()).singleElement().satisfies(tool -> assertThat(tool.name()).isEqualTo("prepare_sql_context"));
            assertThat(server.provenance()).singleElement().satisfies(p -> assertThat(p.evidence()).isEqualTo("runtime"));
        });
    }

    @Test
    void legacySidecarWithoutOptionalFieldsStaysCompatible() throws Exception {
        var servers = SidecarPayloadParser.parseMcpServers(mapper.readTree("[{\"name\":\"old\",\"status\":\"connected\"}]"));
        assertThat(servers).singleElement().satisfies(server -> {
            assertThat(server.tools()).isEmpty();
            assertThat(server.provenance()).isEmpty();
            assertThat(server.verified()).isFalse();
        });
        assertThat(SidecarPayloadParser.parseSkillCapabilities(mapper.readTree("[{\"name\":\"s\"}]")))
                .singleElement().satisfies(skill -> {
                    assertThat(skill.enabled()).isTrue();
                    assertThat(skill.scope()).isEqualTo("unknown");
                    assertThat(skill.toolDependencies()).isEmpty();
                });
    }

    @Test
    void ignoresMalformedEntries() throws Exception {
        assertThat(SidecarPayloadParser.parseStringList(mapper.readTree("[\"a\", 1, null, \"b\"]"))).containsExactly("a", "b");
        assertThat(SidecarPayloadParser.parseBackgroundTasks(mapper.readTree("[{\"taskId\":\"t1\",\"taskType\":\"shell\"}, 3]")))
                .singleElement().satisfies(task -> {
                    assertThat(task.taskId()).isEqualTo("t1");
                    assertThat(task.description()).isEmpty();
                });
        assertThat(SidecarPayloadParser.parsePluginCapabilities(null)).isEmpty();
        assertThat(SidecarPayloadParser.parseCapabilityProvenance(mapper.readTree("{}"))).isEmpty();
    }

    @Test
    void parsesModelsAndSkipsBlankValues() throws Exception {
        var models = SidecarPayloadParser.parseModels(mapper.readTree("""
                [{"value":"opus","displayName":"Opus","supportedEffortLevels":["auto","high"],"supportsEffort":true},
                 {"value":""}]
                """));
        assertThat(models).singleElement().satisfies(model -> {
            assertThat(model.value()).isEqualTo("opus");
            assertThat(model.supportsEffort()).isTrue();
            assertThat(model.supportedEffortLevels()).containsExactly("high");
        });
        assertThat(SidecarPayloadParser.parseModels(null)).isEmpty();
    }
}
