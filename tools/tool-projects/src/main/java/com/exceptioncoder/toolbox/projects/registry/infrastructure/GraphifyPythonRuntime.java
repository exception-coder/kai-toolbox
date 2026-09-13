package com.exceptioncoder.toolbox.projects.registry.infrastructure;

import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;

/** 从运维配置或用户工具目录解析兼容的解释器，不信任项目内的可执行路径标记。 */
public class GraphifyPythonRuntime {
    private static final Duration PROBE_TIMEOUT = Duration.ofSeconds(15);
    private static final String PROBE = "import sys, importlib.metadata as m; "
            + "v=m.version('graphifyy'); "
            + "assert v == '0.9.16', 'Expected graphifyy 0.9.16, found '+v; "
            + "import graphify.detect, graphify.extract; print(sys.executable)";
    private static final String RECOVERY = "请在 Forge 运行账号下安装 uv 后执行 "
            + "uv tool install --python 3.12 graphifyy==0.9.16，"
            + "或设置 toolbox.projects.graphify-python 为兼容环境的 Python 绝对路径";
    private final RegistryCommandRunner commands;

    public GraphifyPythonRuntime(RegistryCommandRunner commands) {
        this.commands = commands;
    }

    /** @param configured 运维显式解释器配置，可为空 @return 已核验的解释器绝对路径。 */
    public String resolve(String configured) {
        Path home = Path.of(System.getProperty("user.home")).toAbsolutePath();
        boolean explicit = configured != null && !configured.isBlank();
        List<String> candidates = explicit ? List.of(configured.trim()) : discover(home);
        List<String> failures = new ArrayList<>();
        for (String candidate : candidates) {
            var result = commands.run(home, List.of(candidate, "-I", "-X", "utf8", "-c", PROBE), PROBE_TIMEOUT);
            if (result.exitCode() == 0) {
                try {
                    Path interpreter = Path.of(lastLine(result.output()));
                    if (interpreter.isAbsolute() && Files.isRegularFile(interpreter)) {
                        return interpreter.toString();
                    }
                } catch (InvalidPathException exception) {
                    failures.add(candidate + "：解释器返回了无效路径");
                    continue;
                }
            }
            String diagnostic = lastLine(result.output());
            failures.add(candidate + "：版本或依赖检查未通过（退出码 " + result.exitCode() + "）："
                    + diagnostic.substring(0, Math.min(500, diagnostic.length())));
        }
        throw new IllegalStateException((explicit ? "指定的" : "未找到兼容的")
                + " Graphify Python 环境。" + String.join("；", failures) + "。" + RECOVERY);
    }

    private String lastLine(String output) {
        return output.lines().filter(value -> !value.isBlank()).reduce((left, right) -> right).orElse("").trim();
    }

    private List<String> discover(Path home) {
        boolean windows = System.getProperty("os.name").toLowerCase(Locale.ROOT).startsWith("windows");
        var candidates = new LinkedHashSet<String>();
        String override = System.getenv("GRAPHIFY_PYTHON");
        if (override != null && !override.isBlank()) {
            // 环境变量是运维配置，与 Spring 配置一样不应悄悄回退。
            return List.of(override.trim());
        }
        String uvRoot = System.getenv("UV_TOOL_DIR");
        if (uvRoot != null && !uvRoot.isBlank() && Path.of(uvRoot).isAbsolute()) {
            addEnvironment(candidates, Path.of(uvRoot).resolve("graphifyy"), windows);
        }
        var uv = commands.run(home, List.of("uv", "tool", "dir"), PROBE_TIMEOUT);
        if (uv.exitCode() == 0 && !uv.output().isBlank()) {
            Path directory = Path.of(uv.output().trim());
            if (directory.isAbsolute()) {
                addEnvironment(candidates, directory.resolve("graphifyy"), windows);
            }
        }
        for (Path environment : defaultEnvironments(home, windows, System.getenv("APPDATA"),
                System.getenv("XDG_DATA_HOME"))) {
            addEnvironment(candidates, environment, windows);
        }
        candidates.add(windows ? "python" : "python3");
        candidates.add(windows ? "python3" : "python");
        return List.copyOf(candidates);
    }

    static List<Path> defaultEnvironments(Path home, boolean windows, String appData, String xdgData) {
        Path data = windows ? absoluteOrDefault(appData, home.resolve("AppData/Roaming"))
                : absoluteOrDefault(xdgData, home.resolve(".local/share"));
        return List.of(data.resolve("uv/tools/graphifyy"), home.resolve(".venvs/graphifyy"));
    }

    private static Path absoluteOrDefault(String configured, Path fallback) {
        return configured != null && !configured.isBlank() && Path.of(configured).isAbsolute()
                ? Path.of(configured) : fallback;
    }

    private void addEnvironment(LinkedHashSet<String> candidates, Path environment, boolean windows) {
        Path executable = environment.resolve(windows ? "Scripts/python.exe" : "bin/python");
        if (Files.isRegularFile(executable)) {
            candidates.add(executable.toString());
        }
    }
}
