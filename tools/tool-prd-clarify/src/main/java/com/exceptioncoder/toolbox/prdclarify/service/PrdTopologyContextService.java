package com.exceptioncoder.toolbox.prdclarify.service;

import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;

/** 查询集中式跨项目拓扑中的真实关系文档。 */
@Service
public class PrdTopologyContextService {

    private static final String WORKSPACE_ROOTS_KEY = "toolbox.claude-chat.workspace.roots";
    private static final int MAX_HITS = 8;
    private final Environment environment;

    public PrdTopologyContextService(Environment environment) {
        this.environment = environment;
    }

    /** 返回同时提及主项目或关联项目的拓扑摘要。 */
    public String query(String primaryProject, String relatedProject, String question) {
        Path root = resolveTopologyRoot();
        if (root == null) {
            return null;
        }
        String primary = value(primaryProject).toLowerCase(Locale.ROOT);
        String related = value(relatedProject).toLowerCase(Locale.ROOT);
        try (Stream<Path> paths = Files.walk(root.resolve("knowledge"), 8)) {
            List<String> hits = paths.filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().endsWith(".md"))
                    .map(path -> readHit(path, primary, related, question))
                    .filter(hit -> !hit.isBlank())
                    .limit(MAX_HITS)
                    .toList();
            return hits.isEmpty() ? "" : String.join("\n\n", hits);
        } catch (IOException error) {
            throw new IllegalStateException("读取跨项目拓扑失败: " + root, error);
        }
    }

    public String traceTarget() {
        Path root = resolveTopologyRoot();
        return root == null ? null : root.resolve("knowledge").toString();
    }

    private String readHit(Path path, String primary, String related, String question) {
        try {
            String content = Files.readString(path, StandardCharsets.UTF_8);
            String lower = content.toLowerCase(Locale.ROOT);
            boolean projectHit = (!primary.isBlank() && lower.contains(primary))
                    || (!related.isBlank() && lower.contains(related));
            if (!projectHit) {
                return "";
            }
            String excerpt = content.substring(0, Math.min(content.length(), 1_200));
            return "来源：" + path + "\n" + excerpt;
        } catch (IOException ignored) {
            return "";
        }
    }

    private Path resolveTopologyRoot() {
        List<String> roots = Binder.get(environment)
                .bind(WORKSPACE_ROOTS_KEY, Bindable.listOf(String.class)).orElse(List.of());
        for (String configured : roots) {
            if (configured == null || configured.isBlank()) {
                continue;
            }
            Path candidate = Path.of(configured).toAbsolutePath().normalize().resolve("cross-project-topology");
            if (Files.isDirectory(candidate.resolve("knowledge"))) {
                return candidate;
            }
        }
        return null;
    }

    private static String value(String value) {
        return value == null ? "" : value;
    }
}
