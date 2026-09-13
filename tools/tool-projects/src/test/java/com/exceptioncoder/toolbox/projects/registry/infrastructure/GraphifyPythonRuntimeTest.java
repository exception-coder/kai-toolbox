package com.exceptioncoder.toolbox.projects.registry.infrastructure;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

/** 验证平台目录规则、独立参数和显式配置失败时不切换解释器。 */
class GraphifyPythonRuntimeTest {
    @TempDir Path root;

    @Test
    void resolvesExplicitInterpreterWithSpacesUsingIsolatedUtf8Probe() throws Exception {
        Path executable = Files.createFile(root.resolve("python 中文 path.exe"));
        var commands = mock(RegistryCommandRunner.class);
        when(commands.run(any(), any(), any())).thenReturn(
                new RegistryCommandRunner.Result(0, executable + "\n"));

        assertThat(new GraphifyPythonRuntime(commands).resolve(executable.toString()))
                .isEqualTo(executable.toString());
        verify(commands).run(eq(Path.of(System.getProperty("user.home")).toAbsolutePath()),
                org.mockito.ArgumentMatchers.argThat(args -> args.getFirst().equals(executable.toString())
                        && args.subList(1, 5).equals(List.of("-I", "-X", "utf8", "-c"))), any());
    }

    @Test
    void incompatibleExplicitInterpreterDoesNotFallBack() {
        var commands = mock(RegistryCommandRunner.class);
        when(commands.run(any(), any(), any())).thenReturn(new RegistryCommandRunner.Result(1, "incompatible"));

        assertThatThrownBy(() -> new GraphifyPythonRuntime(commands).resolve("configured-python"))
                .hasMessageContaining("指定", "graphifyy==0.9.16", "退出码 1");
        verify(commands).run(any(), any(), any());
        verifyNoMoreInteractions(commands);
    }

    @Test
    void supportsWindowsAndUnixManagedDirectoriesAndOverrides() {
        assertThat(GraphifyPythonRuntime.defaultEnvironments(root, true, null, null))
                .containsExactly(root.resolve("AppData/Roaming/uv/tools/graphifyy"), root.resolve(".venvs/graphifyy"));
        assertThat(GraphifyPythonRuntime.defaultEnvironments(root, false, null, null))
                .containsExactly(root.resolve(".local/share/uv/tools/graphifyy"), root.resolve(".venvs/graphifyy"));
        assertThat(GraphifyPythonRuntime.defaultEnvironments(root, false, null, root.resolve("data").toString()))
                .contains(root.resolve("data/uv/tools/graphifyy"));
    }
}
