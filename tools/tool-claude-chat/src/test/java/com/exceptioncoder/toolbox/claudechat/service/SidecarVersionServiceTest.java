package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.SidecarEngineVersionView;
import com.exceptioncoder.toolbox.claudechat.api.dto.SidecarVersionView;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 验证 sidecar 四种对话引擎运行包的本地版本聚合。 */
class SidecarVersionServiceTest {

    private static final List<String> PACKAGES = List.of(
            "@anthropic-ai/claude-agent-sdk",
            "@openai/codex-sdk",
            "@google/gemini-cli",
            "@opencode-ai/sdk"
    );

    @TempDir
    Path sidecarDir;

    /** 四个运行包存在时，应按稳定顺序返回各自的声明和安装版本。 */
    @Test
    void returnsAllEngineVersionsInStableOrder() throws Exception {
        writeManifest();
        for (int index = 0; index < PACKAGES.size(); index++) {
            writeInstalledPackage(PACKAGES.get(index), "1.0." + index);
        }

        SidecarVersionView result = service().read(false);

        assertThat(result.error()).isNull();
        assertThat(result.engines()).extracting(SidecarEngineVersionView::id)
                .containsExactly("claude", "codex", "gemini", "opencode");
        assertThat(result.engines()).extracting(SidecarEngineVersionView::installed)
                .containsExactly("1.0.0", "1.0.1", "1.0.2", "1.0.3");
        assertThat(result.installed()).isEqualTo("1.0.0");
    }

    /** 单个运行包缺失时，只标记对应引擎，不影响其余引擎状态。 */
    @Test
    void isolatesMissingPackageFromOtherEngines() throws Exception {
        writeManifest();
        writeInstalledPackage(PACKAGES.get(0), "1.0.0");
        writeInstalledPackage(PACKAGES.get(2), "1.0.2");
        writeInstalledPackage(PACKAGES.get(3), "1.0.3");

        SidecarVersionView result = service().read(false);

        SidecarEngineVersionView codex = result.engines().get(1);
        assertThat(codex.id()).isEqualTo("codex");
        assertThat(codex.installed()).isNull();
        assertThat(codex.error()).isNotBlank();
        assertThat(result.engines()).filteredOn(engine -> !"codex".equals(engine.id()))
                .allMatch(engine -> engine.installed() != null && engine.error() == null);
    }

    /** 使用临时 sidecar 目录创建被测服务。 */
    private SidecarVersionService service() {
        SidecarProcessRegistry registry = mock(SidecarProcessRegistry.class);
        when(registry.sidecarDir()).thenReturn(sidecarDir);
        return new SidecarVersionService(registry, new ObjectMapper());
    }

    /** 写入四引擎依赖声明。 */
    private void writeManifest() throws Exception {
        String dependencies = """
                {
                  "dependencies": {
                    "@anthropic-ai/claude-agent-sdk": "^1.0.0",
                    "@openai/codex-sdk": "^1.0.1",
                    "@google/gemini-cli": "^1.0.2",
                    "@opencode-ai/sdk": "^1.0.3"
                  }
                }
                """;
        Files.writeString(sidecarDir.resolve("package.json"), dependencies);
    }

    /** 写入指定运行包的实际版本。 */
    private void writeInstalledPackage(String packageName, String version) throws Exception {
        Path packageDir = sidecarDir.resolve("node_modules").resolve(Path.of(packageName));
        Files.createDirectories(packageDir);
        Files.writeString(packageDir.resolve("package.json"), "{\"version\":\"" + version + "\"}");
    }
}
