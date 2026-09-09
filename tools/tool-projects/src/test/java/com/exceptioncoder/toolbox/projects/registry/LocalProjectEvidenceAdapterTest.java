package com.exceptioncoder.toolbox.projects.registry;

import com.exceptioncoder.toolbox.projects.registry.infrastructure.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 验证证据发现不把文件存在当成图谱、语义或验证已经通过。 */
class LocalProjectEvidenceAdapterTest {
    @TempDir Path root;
    private final RegistrySourceScanner scanner = new RegistrySourceScanner();

    @Test
    void ignoresDependenciesAndDetectsContentChangesAndDeletion() throws Exception {
        Files.createDirectories(root.resolve("node_modules/dependency"));
        Files.writeString(root.resolve("node_modules/dependency/index.ts"), "dependency");
        Files.createDirectories(root.resolve(".kai-chat-attachments/session"));
        Files.writeString(root.resolve(".kai-chat-attachments/session/capture.json"), "{\"private\":true}");
        Files.writeString(root.resolve("TokenService.java"), "class TokenService {} ");
        var before = scanner.scan(root);
        assertThat(before.files()).containsExactly("TokenService.java");
        Files.writeString(root.resolve("TokenService.java"), "class TokenService { int count; }");
        assertThat(scanner.scan(root).fingerprint()).isNotEqualTo(before.fingerprint());
        Files.delete(root.resolve("TokenService.java"));
        assertThat(scanner.scan(root).files()).isEmpty();
    }

    @Test
    void emptyOrMalformedGraphNeverBecomesReady() throws Exception {
        var evidence = adapter();
        assertThat(evidence.graph(root.toString()).usable()).isFalse();
        Files.createDirectories(root.resolve("graphify-out"));
        Files.writeString(root.resolve("graphify-out/graph.json"), "{}");
        assertThat(evidence.graph(root.toString()).usable()).isFalse();
        Files.writeString(root.resolve("graphify-out/graph.json"), "bad json");
        assertThat(evidence.graph(root.toString()).usable()).isFalse();
    }

    @Test
    void nonemptyGraphWithoutManifestIsPartial() throws Exception {
        Files.createDirectories(root.resolve("graphify-out"));
        Files.writeString(root.resolve("graphify-out/graph.json"), "{\"nodes\":[{\"id\":\"A\"}],\"links\":[]}");
        var graph = adapter().graph(root.toString());
        assertThat(graph.usable()).isTrue();
        assertThat(graph.fresh()).isFalse();
        assertThat(graph.nodes()).isEqualTo(1);
    }

    @Test
    void discoversActualPackageScriptsAndDoesNotExecuteThem() throws Exception {
        Files.writeString(root.resolve("package.json"), "{\"scripts\":{\"test\":\"some-command\"}}");
        Files.writeString(root.resolve("AGENTS.md"), "Read engineering rules.");
        var commands = mock(RegistryCommandRunner.class);
        var evidence = new LocalProjectEvidenceAdapter(scanner, commands, new ObjectMapper(), mock(GraphifyIncrementalUpdater.class), new DomainSnapshotStore(new ObjectMapper()), new DomainGraphContext(new ObjectMapper()));
        var assets = evidence.assets(root.toString(), scanner.scan(root));
        var verification = assets.stream().filter(asset -> asset.kind().equals("VERIFICATION")).findFirst().orElseThrow();
        assertThat(verification.facts()).containsEntry(".:test", "npm --prefix \".\" run test");
        assertThat(verification.facts().get("strategy")).contains("未执行");
        verifyNoInteractions(commands);
    }

    @Test
    void emptyRulesAndMissingToolAreExplicitGaps() throws Exception {
        Files.writeString(root.resolve("AGENTS.md"), " ");
        var evidence = adapter();
        assertThat(evidence.assets(root.toString(), scanner.scan(root)).stream()
                .filter(asset -> asset.kind().equals("EXECUTION")).findFirst().orElseThrow().status()).isEqualTo("MISSING");
        assertThatThrownBy(() -> evidence.buildGraph(root.toString())).hasMessageContaining("Graphify 更新失败");
        assertThatThrownBy(() -> evidence.canonicalPath("relative/path")).hasMessageContaining("绝对路径");
    }

    private LocalProjectEvidenceAdapter adapter() {
        var commands = mock(RegistryCommandRunner.class);
        when(commands.run(any(), anyList(), any())).thenReturn(new RegistryCommandRunner.Result(-1, "unavailable"));
        return new LocalProjectEvidenceAdapter(scanner, commands, new ObjectMapper(),
                new GraphifyIncrementalUpdater(scanner, commands, new ObjectMapper(), "python"), new DomainSnapshotStore(new ObjectMapper()), new DomainGraphContext(new ObjectMapper()));
    }

    @Test
    void openSpecPresenceIsSupplementalAndNeverMeansDomainsWereDiscovered() throws Exception {
        Files.createDirectories(root.resolve("openspec/specs/sample"));
        Files.writeString(root.resolve("openspec/specs/sample/spec.md"), "# 样衣规范");
        var asset = adapter().assets(root.toString(), scanner.scan(root)).stream()
                .filter(item -> "SEMANTIC".equals(item.kind())).findFirst().orElseThrow();
        assertThat(asset.status()).isEqualTo("MISSING");
        assertThat(asset.sources()).contains("openspec/specs/sample/spec.md");
        assertThat(asset.facts().get("evidence")).contains("Codex", "补充规格");
    }

    @Test
    void semanticAssetUsesSnapshotAndMarksSourceDrift() throws Exception {
        Files.writeString(root.resolve("Sample.java"), "class Sample {}");
        Files.createDirectories(root.resolve("graphify-out"));
        Files.writeString(root.resolve("graphify-out/graph.json"), "{\"nodes\":[{\"id\":\"sample\",\"source_file\":\"Sample.java\"}]}");
        var snapshotStore = new DomainSnapshotStore(new ObjectMapper());
        var draft = new com.exceptioncoder.toolbox.projects.registry.domain.DomainKnowledge.Draft("sample", "样衣", "BUSINESS", "管理样衣", "LOW",
                java.util.List.of(), java.util.List.of(), java.util.List.of(), java.util.List.of(), java.util.List.of(), java.util.List.of());
        snapshotStore.saveSnapshot(root.toString(), new com.exceptioncoder.toolbox.projects.registry.domain.DomainKnowledge.Snapshot(1, 1,
                scanner.scan(root).fingerprint(), new DomainGraphContext(new ObjectMapper()).load(root.toString()).fingerprint(),
                "codex", "", java.util.List.of(draft), java.util.List.of("未覆盖其他模块")));
        var fresh = adapter().assets(root.toString(), scanner.scan(root)).stream().filter(item -> "SEMANTIC".equals(item.kind())).findFirst().orElseThrow();
        assertThat(fresh.status()).isEqualTo("READY");
        assertThat(fresh.sources()).contains(".forge/domains/snapshot.json");
        Files.writeString(root.resolve("Sample.java"), "class Sample { int changed; }");
        var stale = adapter().assets(root.toString(), scanner.scan(root)).stream().filter(item -> "SEMANTIC".equals(item.kind())).findFirst().orElseThrow();
        assertThat(stale.status()).isEqualTo("PARTIAL");
        assertThat(stale.facts().get("evidence")).contains("重新探索");
    }
}
