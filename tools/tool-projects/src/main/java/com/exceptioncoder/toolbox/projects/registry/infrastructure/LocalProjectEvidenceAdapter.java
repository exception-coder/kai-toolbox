package com.exceptioncoder.toolbox.projects.registry.infrastructure;

import com.exceptioncoder.toolbox.projects.registry.domain.ProjectEvidencePort;
import com.exceptioncoder.toolbox.projects.registry.domain.SystemProfile;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.*;

/** 本机证据适配：只读工程清单与图谱；Full Init 可调用已安装 Graphify 的 AST 提取。 */
@Component
public class LocalProjectEvidenceAdapter implements ProjectEvidencePort {
    private static final long GRAPH_SIZE_LIMIT = 128L * 1024 * 1024;
    private final RegistrySourceScanner scanner;
    private final RegistryCommandRunner commands;
    private final ObjectMapper json;
    private final GraphifyIncrementalUpdater updater;
    private final DomainSnapshotStore domains;
    private final DomainGraphContext domainGraphs;

    public LocalProjectEvidenceAdapter(RegistrySourceScanner scanner, RegistryCommandRunner commands, ObjectMapper json,
                                       GraphifyIncrementalUpdater updater, DomainSnapshotStore domains,
                                       DomainGraphContext domainGraphs) {
        this.scanner = scanner;
        this.commands = commands;
        this.json = json;
        this.updater = updater;
        this.domains = domains;
        this.domainGraphs = domainGraphs;
    }

    @Override
    public String canonicalPath(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("请选择项目本地目录");
        }
        try {
            Path path = Path.of(raw);
            if (!path.isAbsolute() || !Files.isDirectory(path)) {
                throw new IllegalArgumentException("项目目录必须是存在的绝对路径");
            }
            return path.toRealPath().toString();
        } catch (IOException exception) {
            throw new IllegalArgumentException("无法读取项目目录", exception);
        }
    }

    @Override
    public RepositorySnapshot scan(String root) {
        RepositorySnapshot source = scanner.scan(Path.of(canonicalPath(root)));
        var git = commands.run(Path.of(root), List.of("git", "rev-parse", "HEAD"), Duration.ofSeconds(5));
        var branch = commands.run(Path.of(root), List.of("git", "symbolic-ref", "--quiet", "--short", "HEAD"),
                Duration.ofSeconds(5));
        Map<String, String> facts = new LinkedHashMap<>(source.facts());
        facts.put("gitHead", git.exitCode() == 0 ? git.output().trim() : "未发现 Git 提交");
        facts.put("gitBranch", branch.exitCode() == 0 ? branch.output().trim() : "未发现分支或 detached HEAD");
        return new RepositorySnapshot(source.fingerprint() + ":" + facts.get("gitHead") + ":" + facts.get("gitBranch"), source.files(),
                source.complete(), Map.copyOf(facts));
    }

    @Override
    public GraphEvidence graph(String root) {
        Path graph = Path.of(root, "graphify-out", "graph.json");
        if (!Files.isRegularFile(graph)) {
            return new GraphEvidence(false, false, 0, "尚未生成 Graphify 图谱");
        }
        try {
            if (Files.size(graph) > GRAPH_SIZE_LIMIT) {
                return new GraphEvidence(false, false, 0, "图谱超过 128 MiB 检查上限，请使用图谱工具专项核验");
            }
            JsonNode data = json.readTree(graph.toFile());
            if (!data.path("nodes").isArray() || data.path("nodes").isEmpty()
                    || (!data.path("links").isArray() && !data.path("edges").isArray())) {
                return new GraphEvidence(false, false, 0, "Graphify 图谱为空或结构无效，请重新生成");
            }
            boolean fresh = manifestFresh(Path.of(root));
            return new GraphEvidence(true, fresh, data.path("nodes").size(),
                    fresh ? "图谱清单与已覆盖源码一致" : "图谱缺少完整的新鲜度证据，请执行 Full Init");
        } catch (IOException exception) {
            return new GraphEvidence(false, false, 0, "Graphify JSON 无法解析，请修复或重新生成");
        }
    }

    private boolean manifestFresh(Path root) throws IOException {
        Path receipt = root.resolve("graphify-out/.forge-source-fingerprint");
        if (Files.isRegularFile(receipt)) {
            String expected = scanner.scan(root).fingerprint() + ":"
                    + Files.getLastModifiedTime(root.resolve("graphify-out/graph.json")).toMillis();
            return Files.readString(receipt).trim().equals(expected);
        }
        Path manifest = root.resolve("graphify-out/manifest.json");
        if (!Files.isRegularFile(manifest) || Files.size(manifest) > GRAPH_SIZE_LIMIT) {
            return false;
        }
        JsonNode entries = json.readTree(manifest.toFile());
        if (!entries.isObject() || entries.isEmpty()) {
            return false;
        }
        var names = entries.fieldNames();
        while (names.hasNext()) {
            String name = names.next();
            if (isCode(name) && !Files.isRegularFile(root.resolve(name))) {
                return false;
            }
        }
        RepositorySnapshot snapshot = scanner.scan(root);
        if (!snapshot.complete()) {
            return false;
        }
        for (String file : snapshot.files()) {
            if (!isCode(file)) {
                continue;
            }
            JsonNode entry = entries.path(file);
            double recorded = entry.path("mtime").asDouble(-1);
            double actual = Files.getLastModifiedTime(root.resolve(file)).toMillis() / 1000.0;
            if (Math.abs(recorded - actual) > 0.01) {
                return false;
            }
        }
        return !snapshot.files().isEmpty();
    }

    private boolean isCode(String file) {
        return file.matches(".*\\.(java|tsx?|jsx?|mjs|py|dart|go|rs|vue)$");
    }

    @Override
    public String buildGraph(String root) {
        return updater.update(Path.of(root), false);
    }

    @Override
    public String syncGraph(String root) {
        return updater.update(Path.of(root), true);
    }

    @Override
    public List<SystemProfile.Asset> assets(String root, RepositorySnapshot snapshot) {
        List<String> files = snapshot.files();
        List<String> manifests = files.stream().filter(file -> file.endsWith("pom.xml")
                || file.endsWith("package.json") || file.endsWith("pyproject.toml") || file.endsWith("pubspec.yaml")
                || file.endsWith("Cargo.toml") || file.endsWith("build.gradle")).toList();
        List<String> rules = files.stream().filter(file -> file.equals("AGENTS.md") || file.equals("CLAUDE.md")
                || file.startsWith("docs/engineering/") || file.equals("openspec/config.yaml")).toList();
        List<String> semantics = files.stream().filter(file -> file.startsWith("openspec/specs/")
                || file.startsWith("docs/domain/")).toList();
        Map<String, String> projectFacts = new LinkedHashMap<>(snapshot.facts());
        projectFacts.put("stack", stack(manifests));
        projectFacts.put("environment", "仅发现工程配置，未运行构建或探测运行实例");
        projectFacts.put("hostRuntime", System.getProperty("os.name") + " · Java " + System.getProperty("java.version"));
        GraphEvidence graph = graph(root);
        Map<String, String> verification = verificationCommands(root, manifests);
        boolean verificationReady = verification.keySet().stream().anyMatch(key -> !key.endsWith(":gap"));
        boolean rulesReady = rules.stream().anyMatch(file -> (file.equals("AGENTS.md") || file.equals("CLAUDE.md"))
                && nonempty(Path.of(root, file)));
        SystemProfile.Asset semanticAsset = semanticAsset(root, snapshot.fingerprint(), semantics);
        return List.of(
                new SystemProfile.Asset("PROJECT", "Project Profile", snapshot.complete() ? "READY" : "PARTIAL",
                        manifests, Map.copyOf(projectFacts)),
                new SystemProfile.Asset("CODE", "Code Intelligence", graph.fresh() && graph.usable() ? "READY" : "PARTIAL",
                        graph.usable() ? List.of("graphify-out/graph.json") : List.of(),
                        Map.of("nodes", String.valueOf(graph.nodes()), "evidence", graph.message())),
                semanticAsset,
                new SystemProfile.Asset("EXECUTION", "Execution Profile", rulesReady ? "READY" : "MISSING",
                        rules, Map.of("strategy", "遵循项目规则，按需读取 OpenSpec 与 Graphify，不覆盖已有规则")),
                new SystemProfile.Asset("VERIFICATION", "Verification Profile", verificationReady ? "READY" : "MISSING",
                        manifests, Map.copyOf(verification)));
    }

    private SystemProfile.Asset semanticAsset(String root, String fingerprint, List<String> supplemental) {
        List<String> sources = new ArrayList<>(supplemental);
        try {
            var snapshot = domains.snapshot(root);
            if (snapshot == null || snapshot.domains().isEmpty()) {
                return new SystemProfile.Asset("SEMANTIC", "Semantic Registry", "MISSING", sources,
                        Map.of("evidence", "尚无代码领域快照，请在业务域页选择 Codex 或 Claude Code 探索；OpenSpec 仅为补充规格"));
            }
            sources.addFirst(".forge/domains/snapshot.json");
            boolean fresh = fingerprint.equals(snapshot.sourceFingerprint())
                    && snapshot.graphFingerprint().equals(domainGraphs.load(root).fingerprint());
            return new SystemProfile.Asset("SEMANTIC", "Semantic Registry", fresh ? "READY" : "PARTIAL", sources,
                    Map.of("domains", String.valueOf(snapshot.domains().size()), "version", String.valueOf(snapshot.version()),
                            "evidence", fresh ? "已引用代码探索领域草稿；源码引用已核对，业务含义仍为推断，覆盖范围见领域页"
                                    : "领域快照对应的源码或图谱已变化，请在业务域页重新探索"));
        } catch (RuntimeException exception) {
            return new SystemProfile.Asset("SEMANTIC", "Semantic Registry", "PARTIAL", sources,
                    Map.of("evidence", "领域快照或图谱无法读取，请在业务域页检查后重新探索"));
        }
    }

    private boolean nonempty(Path path) {
        try {
            return Files.isRegularFile(path) && !Files.readString(path).isBlank();
        } catch (IOException exception) {
            return false;
        }
    }

    private String stack(List<String> manifests) {
        Set<String> stack = new LinkedHashSet<>();
        for (String file : manifests) {
            if (file.endsWith("pom.xml")) { stack.add("Java · Maven"); }
            if (file.endsWith("package.json")) { stack.add("JavaScript / TypeScript · npm"); }
            if (file.endsWith("pyproject.toml")) { stack.add("Python"); }
            if (file.endsWith("pubspec.yaml")) { stack.add("Dart / Flutter"); }
            if (file.endsWith("Cargo.toml")) { stack.add("Rust"); }
            if (file.endsWith("build.gradle")) { stack.add("Gradle"); }
        }
        return stack.isEmpty() ? "待识别" : String.join(" · ", stack);
    }

    private Map<String, String> verificationCommands(String root, List<String> manifests) {
        Map<String, String> result = new LinkedHashMap<>();
        for (String file : manifests) {
            if (file.equals("pom.xml")) {
                result.put("backend", Files.exists(Path.of(root, "mvnw.cmd")) ? ".\\mvnw.cmd test" : "mvn test");
            }
            if (file.endsWith("package.json")) {
                readPackageScripts(Path.of(root), file, result);
            }
        }
        if (result.keySet().stream().anyMatch(key -> !key.endsWith(":gap"))) {
            result.put("strategy", "targeted；以下命令仅发现，未执行；高风险变更再扩大验证范围");
        }
        return result;
    }

    private void readPackageScripts(Path root, String file, Map<String, String> result) {
        try {
            JsonNode scripts = json.readTree(root.resolve(file).toFile()).path("scripts");
            String directory = Optional.ofNullable(Path.of(file).getParent()).map(Path::toString).orElse(".");
            for (String name : List.of("test", "typecheck", "build")) {
                if (scripts.path(name).isTextual()) {
                    result.put(directory + ":" + name, "npm --prefix \"" + directory + "\" run " + name);
                }
            }
        } catch (IOException exception) {
            result.put(file + ":gap", "package.json 无法解析，验证命令未确认");
        }
    }
}
