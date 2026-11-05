package com.exceptioncoder.toolbox.foreconsult.backend;

import com.exceptioncoder.toolbox.common.project.ProjectAccess;
import com.exceptioncoder.toolbox.common.project.ProjectCatalog;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;

/** Bounded explicit source references. No URL fetch, shell, recursive search, credentials or graph expansion. */
@Service
public class ConsultAnalysisEvidence {
    private final ProjectCatalog projects;
    private final ProjectAccess access;
    public record Packet(String id, String kind, String source, String text) {}

    public ConsultAnalysisEvidence(ProjectCatalog projects, ProjectAccess access) { this.projects = projects; this.access = access; }

    public List<Packet> collect(ConsultAnalysisInput input) {
        var result = new ArrayList<Packet>();
        String description = input.title() + "\n" + input.description();
        if (!input.recentContext().isEmpty()) description += "\n调用方近期上下文：\n" + String.join("\n", input.recentContext());
        if (input.classification() != null) description += "\n调用方分类：" + input.classification().decision() + "；理由：" + input.classification().reason();
        result.add(new Packet("input", "CALLER_DESCRIPTION", input.problemId(), description));
        if (input.businessContext() != null) {
            result.add(new Packet("business-context", "CALLER_BUSINESS_CONTEXT", input.problemId(), input.businessContext().toString()));
        }
        if (input.errorText() != null && !input.errorText().isBlank()) result.add(new Packet("error", "CALLER_ERROR", input.problemId(), input.errorText()));
        int number = 0;
        for (var attachment : input.attachmentTexts()) result.add(new Packet("attachment-" + ++number, "CALLER_ATTACHMENT_TEXT", attachment.id(), attachment.text()));
        var catalog = projects.list(false);
        number = 0;
        for (var ref : input.evidenceRefs()) {
            var project = catalog.stream().filter(p -> p.id().equals(ref.projectId()) && p.available() && !p.excluded()).findFirst()
                    .orElseThrow(() -> new ConsultBackendException(403, "PROJECT_NOT_ALLOWED", "证据项目当前不可用", false));
            try {
                String path = ref.path().replace('\\', '/');
                String lower = path.toLowerCase(Locale.ROOT);
                if (Path.of(path).isAbsolute() || path.contains(":") || lower.matches(".*(^|/)(\\.[^/]*|node_modules|target|dist|config|credentials|secrets)(/|$).*")
                        || lower.contains("password") || lower.contains("secret") || lower.contains("token")
                        || lower.contains("credential") || lower.contains("application.") || lower.contains("settings.")
                        || !lower.matches(".*\\.(java|ts|tsx|js|jsx|vue|md|txt|sql)$")) throw ConsultBackendException.invalid("只允许非敏感源码或文档相对路径");
                var root = Path.of(project.path()).toRealPath();
                var file = root.resolve(path).toRealPath();
                access.requireAllowed(root); access.requireAllowed(file);
                if (!file.startsWith(root) || !Files.isRegularFile(file) || Files.size(file) > 512000) throw ConsultBackendException.invalid("证据文件越界或超过 500KB");
                String text = Files.readString(file, StandardCharsets.UTF_8);
                String[] lines = text.split("\\R", -1);
                if (ref.endLine() > lines.length) throw ConsultBackendException.invalid("证据行号超出文件范围");
                String excerpt = String.join("\n", java.util.Arrays.copyOfRange(lines, ref.startLine() - 1, ref.endLine()));
                if (excerpt.length() > 8000) throw ConsultBackendException.invalid("单条源码证据超过 8000 字符");
                result.add(new Packet("source-" + ++number, "SERVER_SOURCE", project.id() + ":" + path + ":" + ref.startLine() + "-" + ref.endLine(), excerpt));
            } catch (IOException | java.nio.file.InvalidPathException error) {
                throw ConsultBackendException.invalid("证据文件不可读或编码不受支持，请提供提取文字");
            }
        }
        if (result.stream().mapToInt(p -> p.text().length()).sum() > 80000) throw ConsultBackendException.invalid("证据总量超过 80000 字符");
        return List.copyOf(result);
    }
}
