package com.exceptioncoder.toolbox.prdclarify.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/** 读取项目明确的 SQL schema 文件，不使用迁入 Markdown 作为当前结构。 */
@Service
@Slf4j
public class PrdDdlContextService {

    private static final int MAX_OUTPUT_CHARS = 18_000;

    public PrdDdlContextService(Environment environment) { }

    /**
     * 返回相关 DDL 片段和基线路径；基线不存在时返回 {@code null}。
     *
     * @param project         项目标识
     * @param module          模块提示
     * @param question        需求标题和描述
     * @param relatedEvidence 业务知识与代码图谱的命中结果
     * @return 有限的 DDL 结构证据，或 {@code null}
     */
    public String query(String project, String module, String question, String relatedEvidence) {
        Path baseline = resolveBaseline(project);
        if (baseline == null) {
            return null;
        }
        try {
            String content = Files.readString(baseline, StandardCharsets.UTF_8);
            return "项目SQL文件（未核验数据库部署版本）：" + baseline + "\n"
                    + content.substring(0, Math.min(content.length(), MAX_OUTPUT_CHARS))
                    + (content.length() > MAX_OUTPUT_CHARS ? "\n[已截断]" : "");
        } catch (IOException error) {
            log.debug("读取项目 DDL 基线失败: project={}, baseline={}", project, baseline, error);
            return null;
        }
    }

    /** 返回项目实际命中的 DDL 基线文件。 */
    public String traceTarget(String project) {
        Path target = resolveBaseline(project);
        return target == null ? null : target.toString();
    }

    private com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceScopeResolver scopes;
    @org.springframework.beans.factory.annotation.Autowired
    private com.exceptioncoder.toolbox.common.project.ProjectAccess projectAccess;

    @org.springframework.beans.factory.annotation.Autowired
    public void setScopes(com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceScopeResolver scopes) {
        this.scopes = scopes;
    }

    private Path resolveBaseline(String project) {
        if (scopes == null || project == null || project.isBlank()) return null;
        try {
            Path root = Path.of(scopes.resolve(project).primary().projectPath()).toRealPath();
            // Only an explicit project schema is a candidate; historical Markdown/inheritance never is.
            Path schema = root.resolve("db/schema.sql");
            return (projectAccess == null || projectAccess.allowed(schema))
                    && Files.isRegularFile(schema) && schema.toRealPath().startsWith(root)
                    && Files.size(schema) <= 2 * 1024 * 1024 ? schema : null;
        } catch (IOException | IllegalArgumentException error) { return null; }
    }

}
