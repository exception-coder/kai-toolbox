package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.prdclarify.config.DomainKnowledgeQueryProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * 直接 import project-domain-knowledge 引擎编译产物（{@code dist/knowledge.js}）查询业务知识图谱
 * （不经 MCP，原因与 {@link GraphifyQueryService} 相同：oneShot 场景下工具调用可用性不稳定，改为
 * Java 侧先查、把结果当「上下文压缩」拼进工时评估 prompt）。
 *
 * <p>该引擎本身是给 Claude Code 会话用的 MCP server（{@code dist/server.js}），但检索逻辑都在
 * 纯函数 {@code dist/knowledge.js}（{@code search}/{@code get} 等）里，与 MCP 传输层解耦，因此可以
 * 不起 MCP server、直接用一段一次性 Node ESM 脚本 import 该模块调用同样的函数——效果等价于调
 * {@code mcp__domain-knowledge__search_knowledge}，但绕开了 MCP 协议层。</p>
 */
@Slf4j
@Service
public class DomainKnowledgeQueryService {

    /** 复用 tool-knowledge-graph 模块已有的配置项，不要求用户重复填一遍仓库路径。 */
    private static final String REPO_PATH_KEY = "toolbox.knowledge-graph.domain-knowledge-repo-path";

    private final DomainKnowledgeQueryProperties props;
    private final Environment environment;
    private final ObjectMapper mapper;

    public DomainKnowledgeQueryService(DomainKnowledgeQueryProperties props, Environment environment, ObjectMapper mapper) {
        this.props = props;
        this.environment = environment;
        this.mapper = mapper;
    }

    /**
     * 查询业务知识图谱。project 非空时只在该 project 下检索，question 是自然语言查询词
     * （通常是需求标题，命中标题/标签/正文关键词即可，见引擎 {@code search()} 的打分逻辑）。
     *
     * @return 命中知识点的标题+正文拼接文本；引擎未配置/未构建/执行失败/总开关关闭/无命中时返回
     *         {@code null}，调用方应静默跳过（不阻断工时评估主流程，最多是少一份参考依据）。
     */
    public String query(String project, String question) {
        return query(project, null, question);
    }

    /**
     * 查询项目下的模块业务知识；模块无命中时自动降级为项目级检索。
     *
     * @return 命中知识点的标题和正文；证据源不可用或无命中时返回 {@code null}
     */
    public String query(String project, String module, String question) {
        if (!props.isEnabled() || question == null || question.isBlank()) {
            return null;
        }
        String repoPath = Binder.get(environment).bind(REPO_PATH_KEY, Bindable.of(String.class)).orElse(null);
        if (repoPath == null || repoPath.isBlank()) {
            return null;
        }
        Path distEntry = Path.of(repoPath, "dist", "knowledge.js");
        if (!Files.isRegularFile(distEntry)) {
            log.debug("[domain-knowledge] {} 不存在，跳过业务知识图谱查询", distEntry);
            return null;
        }
        try {
            String script = buildScript(distEntry, project, module, question);
            // Passing generated source through "node -e" is unsafe on Windows: the
            // command-line conversion can strip JSON quotes around file:// URLs.
            // Stdin preserves the ESM source byte-for-byte on every platform.
            ProcessBuilder pb = new ProcessBuilder(props.getNodeExecutable(), "--input-type=module", "-");
            pb.redirectErrorStream(true);
            Process process = pb.start();
            try (var os = process.getOutputStream()) {
                os.write(script.getBytes(StandardCharsets.UTF_8));
            }
            CompletableFuture<String> outputFuture = CompletableFuture.supplyAsync(() -> readOutput(process));
            boolean finished = process.waitFor(props.getTimeoutSeconds(), TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                outputFuture.cancel(true);
                log.warn("[domain-knowledge] 查询超时 project={}", project);
                return null;
            }
            String output = outputFuture.join();
            if (process.exitValue() != 0) {
                log.warn("[domain-knowledge] 查询退出码非 0 project={} output={}", project, trim(output));
                return null;
            }
            return output.isBlank() ? null : output.trim();
        } catch (IOException e) {
            // node 未安装/不在 PATH：静默跳过，等同于「暂无业务知识图谱」
            log.debug("[domain-knowledge] node 不可用或执行失败 project={}: {}", project, e.getMessage());
            return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        }
    }

    /** 返回业务知识查询引擎入口，未配置或未构建时返回 null。 */
    public String traceTarget() {
        String repoPath = Binder.get(environment).bind(REPO_PATH_KEY, Bindable.of(String.class)).orElse(null);
        if (repoPath == null || repoPath.isBlank()) {
            return null;
        }
        Path entry = Path.of(repoPath, "dist", "knowledge.js");
        return Files.isRegularFile(entry) ? entry.toString() : null;
    }

    /**
     * 生成一次性 Node ESM 脚本：静态 import {@code dist/knowledge.js} 的 {@code search}/{@code get}，
     * 检索命中后取正文前 600 字，避免把整篇知识点全量塞进 prompt。project/question 都以 JSON 字符串
     * 字面量形式直接拼进脚本源码（用 Jackson 转义，避免注入/换行破坏脚本语法）。
     */
    private String buildScript(Path distEntry, String project, String module, String question)
            throws com.fasterxml.jackson.core.JsonProcessingException {
        String urlLiteral = mapper.writeValueAsString(distEntry.toUri().toString());
        String questionLiteral = mapper.writeValueAsString(question);
        String modulesLiteral = mapper.writeValueAsString(normalizeModules(module));
        String projectClause = (project == null || project.isBlank())
                ? ""
                : "project: " + mapper.writeValueAsString(project) + ", ";
        return "import { search, get } from " + urlLiteral + ";\n" +
                "const modules = " + modulesLiteral + ";\n" +
                "const merged = new Map();\n" +
                "const add = items => items.forEach(item => merged.set(item.id, item));\n" +
                "for (const module of modules) {\n" +
                "  add(search({ " + projectClause + "module, query: " + questionLiteral +
                ", limit: " + props.getResultLimit() + " }));\n" +
                "}\n" +
                "if (!merged.size) add(search({ " + projectClause + "query: " + questionLiteral +
                ", limit: " + props.getResultLimit() + " }));\n" +
                "const results = [...merged.values()].slice(0, " + props.getResultLimit() + ");\n" +
                "const lines = [];\n" +
                "for (const r of results) {\n" +
                "  const full = get(r.id);\n" +
                "  const body = (full && full.content ? full.content : (r.summary || '')).slice(0, 600);\n" +
                "  lines.push(`### [${r.type}] ${r.title} (${r.project}${r.module ? '/' + r.module : ''})\\n${body}`);\n" +
                "}\n" +
                "process.stdout.write(lines.length ? lines.join('\\n\\n') : '');\n";
    }

    private static List<String> normalizeModules(String module) {
        if (module == null || module.isBlank()) {
            return List.of();
        }
        return Arrays.stream(module.split("[,，、]"))
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .distinct()
                .limit(10)
                .toList();
    }

    private static String trim(String s) {
        if (s == null) return "";
        return s.length() > 300 ? s.substring(0, 300) + "…" : s;
    }

    private static String readOutput(Process process) {
        try (var is = process.getInputStream()) {
            return new String(is.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return "";
        }
    }
}
