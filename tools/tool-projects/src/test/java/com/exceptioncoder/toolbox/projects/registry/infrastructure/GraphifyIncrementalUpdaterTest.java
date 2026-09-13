package com.exceptioncoder.toolbox.projects.registry.infrastructure;

import com.exceptioncoder.toolbox.projects.registry.domain.ProjectEvidencePort.RepositorySnapshot;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** 覆盖缺口必须在运行任何工具前阻断发布，且可定位到具体文件。 */
class GraphifyIncrementalUpdaterTest {
    @TempDir Path root;

    @Test
    void incompleteScanPreservesGraphAndReportsSpecificGapWithoutLaunchingPython() throws Exception {
        Path graph = root.resolve("graphify-out/graph.json");
        Files.createDirectories(graph.getParent());
        Files.writeString(graph, "original graph");
        var scanner = mock(RegistrySourceScanner.class);
        when(scanner.scan(root)).thenReturn(new RepositorySnapshot("partial", List.of(), false,
                Map.of("scanGaps", "src/Important.java：不可读取")));
        var commands = mock(RegistryCommandRunner.class);

        assertThatThrownBy(() -> new GraphifyIncrementalUpdater(scanner, commands, new ObjectMapper(), "")
                .update(root, false)).hasMessageContaining("src/Important.java", "不可读取");
        assertThat(Files.readString(graph)).isEqualTo("original graph");
        verifyNoInteractions(commands);
    }
}
