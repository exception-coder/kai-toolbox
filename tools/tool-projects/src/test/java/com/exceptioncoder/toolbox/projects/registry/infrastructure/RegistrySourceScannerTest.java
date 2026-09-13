package com.exceptioncoder.toolbox.projects.registry.infrastructure;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/** 验证扫描覆盖、大文件内容指纹和可恢复的边界诊断。 */
class RegistrySourceScannerTest {
    @TempDir Path root;

    @Test
    void fingerprintsLargeSourcesWithoutIncludingBuildCopies() throws Exception {
        Path library = root.resolve("WebRoot/public/ECharts/echarts.js");
        Files.createDirectories(library.getParent());
        String content = "/*" + "a".repeat(2_987_094) + "*/";
        Files.writeString(library, content);
        Path generated = root.resolve("out/artifacts/web/public/echarts.js");
        Files.createDirectories(generated.getParent());
        Files.writeString(generated, content);
        var scanner = new RegistrySourceScanner();

        var before = scanner.scan(root);

        assertThat(before.complete()).isTrue();
        assertThat(before.files()).containsExactly("WebRoot/public/ECharts/echarts.js");
        Files.writeString(generated, "generated change");
        assertThat(scanner.scan(root).fingerprint()).isEqualTo(before.fingerprint());
        Files.writeString(library, content.replace('a', 'b'));
        assertThat(scanner.scan(root).fingerprint()).isNotEqualTo(before.fingerprint());
    }

    @Test
    void reportsTheDirectoryAtTheDepthBoundary() throws Exception {
        Files.createDirectories(root.resolve("nested/".repeat(33)));

        var snapshot = new RegistrySourceScanner().scan(root);

        assertThat(snapshot.complete()).isFalse();
        assertThat(snapshot.facts().get("scanGaps")).contains("nested", "32");
    }
}
