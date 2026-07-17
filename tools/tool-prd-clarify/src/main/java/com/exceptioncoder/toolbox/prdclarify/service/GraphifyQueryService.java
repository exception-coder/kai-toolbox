package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.prdclarify.config.GraphifyProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

/**
 * 直接调用 {@code graphify query} CLI 查询代码知识图谱（不经 MCP）。
 *
 * <p>背景：此前 graphify-yoooni 走 MCP（sidecar 起 {@code python -m graphify.serve} 子进程，
 * 由 Claude 在 oneShot 会话里自行决定是否调用），但 oneShot 是纯文本进出的一次性调用，
 * 工具可用性不稳定。改为 Java 侧在调 Claude 前直接跑 CLI、把查询结果当「上下文压缩」
 * 拼进 prompt——与 Claude 官方 graphify skill 推荐的用法一致：图谱负责「去哪看」，
 * 源码/实际生成仍由 Claude 完成。
 *
 * <p>graphify CLI 要求 {@code graphify-out/graph.json} 相对当前工作目录存在，因此这里先
 * 解析 project（可能是聚合了多个子项目的容器目录）实际图谱所在目录，再以该目录为 cwd 起子进程。
 */
@Slf4j
@Service
public class GraphifyQueryService {

    private static final String WORKSPACE_ROOTS_KEY = "toolbox.claude-chat.workspace.roots";

    private final GraphifyProperties props;
    private final Environment environment;

    public GraphifyQueryService(GraphifyProperties props, Environment environment) {
        this.props = props;
        this.environment = environment;
    }

    /**
     * 查询代码知识图谱。project/module 用于定位图谱所在目录，question 是自然语言查询。
     *
     * @return 查询结果文本；图谱不存在 / CLI 不可用 / 执行失败 / 总开关关闭时返回 {@code null}，
     *         调用方应静默跳过（不阻断 PRD 澄清或开发文档生成的主流程）。
     */
    public String query(String project, String module, String question) {
        if (!props.isEnabled()) {
            return null;
        }
        if (question == null || question.isBlank()) {
            return null;
        }
        Path graphDir = resolveGraphDir(project, module);
        if (graphDir == null) {
            log.debug("[graphify] 项目 '{}' 未找到 graphify-out/graph.json，跳过知识图谱查询", project);
            return null;
        }
        try {
            ProcessBuilder pb = new ProcessBuilder(
                    props.getBinary(), "query", question, "--budget", String.valueOf(props.getQueryBudget()));
            pb.directory(graphDir.toFile());
            pb.redirectErrorStream(true);
            Process process = pb.start();
            String output;
            try (var is = process.getInputStream()) {
                output = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            }
            boolean finished = process.waitFor(props.getTimeoutSeconds(), TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                log.warn("[graphify] 查询超时 project={} dir={}", project, graphDir);
                return null;
            }
            if (process.exitValue() != 0) {
                log.warn("[graphify] 查询退出码非 0 project={} dir={} output={}", project, graphDir, trim(output));
                return null;
            }
            return output.isBlank() ? null : output.trim();
        } catch (IOException e) {
            // graphify 未安装 / 不在 PATH：静默跳过，等同于「该项目暂无图谱」
            log.debug("[graphify] CLI 不可用或执行失败 project={}: {}", project, e.getMessage());
            return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        }
    }

    /**
     * 解析图谱所在目录：
     * <ol>
     *   <li>project 本身若已是存在的绝对路径，直接按它处理（兜底容错，正常来自前端下拉的是目录名）；</li>
     *   <li>否则在 {@code toolbox.claude-chat.workspace.roots} 各根下找名为 project 的一级子目录；</li>
     *   <li>该目录下若已有 {@code graphify-out/graph.json}，直接使用；</li>
     *   <li>否则视为多子项目聚合容器（如 monorepo 父目录），向下扫描一级子目录找含图谱的候选：
     *       module 非空时优先取目录名包含 module（忽略大小写）的子目录；否则按目录名排序取第一个，
     *       并在存在多个候选时记录 warn（多图谱暂不支持一次合并查询，后续如需可扩展）；</li>
     *   <li>都找不到返回 {@code null}。</li>
     * </ol>
     */
    private Path resolveGraphDir(String project, String module) {
        if (project == null || project.isBlank()) {
            return null;
        }
        Path direct = Path.of(project);
        Path root = direct.isAbsolute() && Files.isDirectory(direct) ? direct : findProjectRoot(project);
        if (root == null) {
            return null;
        }
        if (hasGraph(root)) {
            return root;
        }
        List<Path> candidates = listSubGraphDirs(root);
        if (candidates.isEmpty()) {
            return null;
        }
        if (module != null && !module.isBlank()) {
            String needle = module.toLowerCase();
            Optional<Path> matched = candidates.stream()
                    .filter(p -> p.getFileName().toString().toLowerCase().contains(needle))
                    .findFirst();
            if (matched.isPresent()) {
                return matched.get();
            }
        }
        if (candidates.size() > 1) {
            log.warn("[graphify] 项目 '{}' 下发现多个子项目图谱 {}，未匹配到 module='{}'，默认取第一个: {}",
                    project, candidates, module, candidates.get(0));
        }
        return candidates.get(0);
    }

    /** 在配置的工作区根下找名为 project 的一级子目录，找不到返回 null。 */
    private Path findProjectRoot(String project) {
        List<String> roots = Binder.get(environment)
                .bind(WORKSPACE_ROOTS_KEY, Bindable.listOf(String.class))
                .orElse(List.of());
        for (String rootSetting : roots) {
            if (rootSetting == null || rootSetting.isBlank()) continue;
            Path root = Path.of(rootSetting).toAbsolutePath().normalize();
            if (!Files.isDirectory(root)) continue;
            Path candidate = root.resolve(project);
            if (Files.isDirectory(candidate)) {
                return candidate;
            }
        }
        return null;
    }

    /** 列出 dir 一级子目录中含 graphify-out/graph.json 的候选，按目录名排序。 */
    private List<Path> listSubGraphDirs(Path dir) {
        try (Stream<Path> children = Files.list(dir)) {
            return children.filter(Files::isDirectory)
                    .filter(this::hasGraph)
                    .sorted(Comparator.comparing(p -> p.getFileName().toString(), String.CASE_INSENSITIVE_ORDER))
                    .toList();
        } catch (IOException e) {
            return List.of();
        }
    }

    private boolean hasGraph(Path dir) {
        return Files.isRegularFile(dir.resolve("graphify-out").resolve("graph.json"));
    }

    private static String trim(String s) {
        if (s == null) return "";
        return s.length() > 300 ? s.substring(0, 300) + "…" : s;
    }
}
