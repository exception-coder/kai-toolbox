package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.SidecarEngineVersionView;
import com.exceptioncoder.toolbox.claudechat.api.dto.SidecarVersionView;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 验证 Sidecar 内置运行包与外部 Antigravity CLI 的本地版本聚合。 */
class SidecarVersionServiceTest {

    private static final List<String> PACKAGES = List.of(
            "@anthropic-ai/claude-agent-sdk",
            "@openai/codex-sdk",
            "@opencode-ai/sdk"
    );

    @TempDir
    Path sidecarDir;

    /** 生产构造器必须保持为 Spring 的显式注入入口。 */
    @Test
    void marksProductionConstructorAsSpringInjectionPoint() throws Exception {
        var constructor = SidecarVersionService.class.getConstructor(
                SidecarProcessRegistry.class, ObjectMapper.class);

        assertThat(constructor.isAnnotationPresent(Autowired.class)).isTrue();
    }

    /** 运行时依赖存在时，应按稳定顺序返回各自的安装版本。 */
    @Test
    void returnsAllEngineVersionsInStableOrder() throws Exception {
        writeManifest();
        for (int index = 0; index < PACKAGES.size(); index++) {
            writeInstalledPackage(PACKAGES.get(index), "1.0." + index);
        }

        SidecarVersionView result = service().read(false);

        assertThat(result.error()).isNull();
        assertThat(result.engines()).extracting(SidecarEngineVersionView::id)
                .containsExactly("claude", "codex", "antigravity", "opencode");
        assertThat(result.engines()).extracting(SidecarEngineVersionView::installed)
                .containsExactly("1.0.0", "1.0.1", "1.1.13", "1.0.2");
        assertThat(result.installed()).isEqualTo("1.0.0");
    }

    /** 单个运行包缺失时，只标记对应引擎，不影响其余引擎状态。 */
    @Test
    void isolatesMissingPackageFromOtherEngines() throws Exception {
        writeManifest();
        writeInstalledPackage(PACKAGES.get(0), "1.0.0");
        writeInstalledPackage(PACKAGES.get(2), "1.0.2");

        SidecarVersionView result = service().read(false);

        SidecarEngineVersionView codex = result.engines().get(1);
        assertThat(codex.id()).isEqualTo("codex");
        assertThat(codex.installed()).isNull();
        assertThat(codex.error()).isNotBlank();
        assertThat(result.engines()).filteredOn(engine -> !"codex".equals(engine.id()))
                .allMatch(engine -> engine.installed() != null && engine.error() == null);
    }

    /** 外部 CLI 缺失时只标记 Antigravity，不影响 npm 引擎状态。 */
    @Test
    void isolatesMissingAntigravityCliFromNpmEngines() throws Exception {
        writeManifest();
        for (int index = 0; index < PACKAGES.size(); index++) {
            writeInstalledPackage(PACKAGES.get(index), "1.0." + index);
        }

        SidecarVersionView result = service(command -> null).read(false);

        SidecarEngineVersionView antigravity = result.engines().get(2);
        assertThat(antigravity.id()).isEqualTo("antigravity");
        assertThat(antigravity.installed()).isNull();
        assertThat(antigravity.error()).contains("agy");
        assertThat(result.engines()).filteredOn(engine -> !"antigravity".equals(engine.id()))
                .allMatch(engine -> engine.installed() != null && engine.error() == null);
    }

    /** 使用临时 sidecar 目录创建被测服务。 */
    private SidecarVersionService service() {
        return service(command -> "1.1.13");
    }

    private SidecarVersionService service(java.util.function.Function<String, String> cliVersionReader) {
        SidecarProcessRegistry registry = mock(SidecarProcessRegistry.class);
        when(registry.sidecarDir()).thenReturn(sidecarDir);
        return new SidecarVersionService(registry, new ObjectMapper(), cliVersionReader);
    }

    /** 写入内置 npm 引擎依赖声明。 */
    private void writeManifest() throws Exception {
        String dependencies = """
                {
                  "dependencies": {
                    "@anthropic-ai/claude-agent-sdk": "^1.0.0",
                    "@openai/codex-sdk": "^1.0.1",
                    "@opencode-ai/sdk": "^1.0.2"
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
