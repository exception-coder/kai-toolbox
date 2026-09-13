package com.exceptioncoder.toolbox.projects.registry.infrastructure;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.*;

class RegistryGraphSummaryTest {
    @TempDir Path root;

    @Test
    void streamsGraphLargerThanOldLimitAndCountsCoverageGaps() throws Exception {
        Path graph = root.resolve("graph.json");
        byte[] padding = new byte[1024 * 1024];
        Arrays.fill(padding, (byte) ' ');
        try (var output = Files.newOutputStream(graph)) {
            output.write("{\"nodes\":[{\"id\":\"a\"}],\"links\":[],\"forgeCoverage\":{\"missingSources\":[\"empty.json\"]}}".getBytes(java.nio.charset.StandardCharsets.UTF_8));
            for (int index = 0; index < 129; index++) { output.write(padding); }
        }
        var summary = RegistryGraphSummary.read(new ObjectMapper(), graph);
        assertThat(summary.nodes()).isEqualTo(1);
        assertThat(summary.relationships()).isTrue();
        assertThat(summary.missingSources()).isEqualTo(1);
    }

    @Test
    void rejectsIncompleteAndTrailingGraphContent() throws Exception {
        Path graph = root.resolve("graph.json");
        for (String content : new String[]{"{\"nodes\":[", "{\"nodes\":[],\"links\":[]} {}"}) {
            Files.writeString(graph, content);
            assertThatThrownBy(() -> RegistryGraphSummary.read(new ObjectMapper(), graph))
                    .isInstanceOf(java.io.IOException.class);
        }
    }
}
