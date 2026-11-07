package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.prdclarify.config.DomainKnowledgeQueryProperties;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceScopeResolver;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.LinkOption;
import java.util.List;
import java.util.Arrays;
import java.util.Locale;
import java.util.stream.Stream;

/** 项目内业务资料，保留旧服务端接口名；不启动集中知识引擎或读取旧路径配置。 */
@Service
public class DomainKnowledgeQueryService {
    private final DomainKnowledgeQueryProperties props;
    private ProjectEvidenceScopeResolver scopes;
    @org.springframework.beans.factory.annotation.Autowired
    private com.exceptioncoder.toolbox.common.project.ProjectAccess projectAccess;

    public DomainKnowledgeQueryService(DomainKnowledgeQueryProperties props, Environment environment, ObjectMapper mapper) {
        this.props = props;
    }

    @Autowired
    public void setScopes(ProjectEvidenceScopeResolver scopes) { this.scopes = scopes; }

    public String query(String project, String question) { return query(project, null, question); }

    public String query(String project, String module, String question) {
        if (!props.isEnabled() || question == null || question.isBlank()) return null;
        Path root = resolveProject(project);
        if (root == null) return null;
        List<String> terms = Arrays.stream(question.toLowerCase(Locale.ROOT).split("\\s+"))
                .filter(term -> !term.isBlank()).limit(20).toList();
        StringBuilder result = new StringBuilder();
        int hits = 0;
        for (String location : List.of("docs/INDEX.md", "docs/domain", "openspec/specs")) {
            try (Stream<Path> paths = Files.walk(root.resolve(location), 10)) {
                for (Path file : paths.limit(3000).sorted().toList()) {
                    if (!Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)
                            || (projectAccess != null && !projectAccess.allowed(file))
                            || !file.toRealPath().startsWith(root) || Files.size(file) > 256_000
                            || !file.toString().matches(".*\\.(md|yaml|yml)$")) continue;
                    String content = Files.readString(file);
                    if (terms.stream().noneMatch(term -> content.toLowerCase(Locale.ROOT).contains(term))) continue;
                    result.append("\n来源：").append(root.relativize(file)).append("\n")
                            .append(content, 0, Math.min(content.length(), 3000))
                            .append(content.length() > 3000 ? "\n[已截断，请读取原文件后续内容]" : "");
                    if (++hits >= Math.min(10, Math.max(1, props.getResultLimit()))) return result.toString();
                }
            } catch (java.io.IOException ignored) { /* 缺失可选资料不回退旧仓库。 */ }
        }
        return result.isEmpty() ? null : result.toString();
    }

    public String traceTarget() { return null; }
    public String traceTarget(String project) {
        Path root = resolveProject(project);
        return root == null ? null : root.resolve("docs/domain").toString();
    }
    private Path resolveProject(String project) {
        if (scopes == null || project == null || project.isBlank()) return null;
        try {
            Path root = Path.of(scopes.resolve(project).primary().projectPath()).toRealPath();
            if (projectAccess != null) projectAccess.requireAllowed(root);
            return root;
        }
        catch (java.io.IOException | IllegalArgumentException error) { return null; }
    }
}
