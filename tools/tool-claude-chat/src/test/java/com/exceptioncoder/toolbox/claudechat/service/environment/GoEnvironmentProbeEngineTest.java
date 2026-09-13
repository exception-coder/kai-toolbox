package com.exceptioncoder.toolbox.claudechat.service.environment;

import com.exceptioncoder.toolbox.claudechat.service.ForgeEnvironmentCommandRunner;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GoEnvironmentProbeEngineTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final GoEnvironmentProbeEngine engine = new GoEnvironmentProbeEngine(
            new ForgeEnvironmentCommandRunner(), mapper, "missing-probe-binary");

    @Test
    void shouldValidateFullCatalogAndKeepTiming() throws Exception {
        var results = EnvironmentProbeCatalog.IDS.stream()
                .map(id -> new EnvironmentProbeResult(id, 0, true, "version 1", 4L)).toList();
        var json = mapper.writeValueAsString(Map.of("protocolVersion", 1, "engine", "go", "results", results));
        assertThat(engine.decode(json)).isEqualTo(results);
    }

    @Test
    void shouldRejectMalformedOrPartialProtocolWithoutFallback() throws Exception {
        for (String json : List.of("{}", "not json", "{\"protocolVersion\":2,\"engine\":\"go\",\"results\":[]}")) {
            assertThatThrownBy(() -> engine.decode(json)).isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("协议不兼容");
        }
        var repeated = java.util.Collections.nCopies(11, new EnvironmentProbeResult("git", 0, true, "x", 0L));
        String json = mapper.writeValueAsString(Map.of("protocolVersion", 1, "engine", "go", "results", repeated));
        assertThatThrownBy(() -> engine.decode(json)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void shouldExplainMissingBinary() {
        assertThatThrownBy(() -> engine.inspect("path")).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("build-environment-go.mjs");
    }
}
