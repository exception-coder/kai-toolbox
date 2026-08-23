package com.exceptioncoder.toolbox.prdclarify.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/** 从项目知识库 DDL 基线中筛选与当前需求最相关的结构证据。 */
@Service
@Slf4j
public class PrdDdlContextService {

    private static final String REPO_PATH_KEY = "toolbox.knowledge-graph.domain-knowledge-repo-path";
    private static final String DDL_RELATIVE_PATH = "impl/ddl-baseline.md";
    private static final int MAX_SECTIONS = 6;
    private static final int MAX_OUTPUT_CHARS = 18_000;
    private static final int MAX_PREAMBLE_CHARS = 1_500;
    private static final Pattern SECOND_LEVEL_HEADING = Pattern.compile("^##\\s+(.+?)\\s*$");
    private static final Pattern SEARCH_TERM = Pattern.compile("[\\p{L}\\p{N}_$-]{3,}");
    private static final Set<String> IGNORED_TERMS = Set.of(
            "service", "module", "project", "需求", "功能", "系统", "模块", "用户", "代码", "业务");

    private final Environment environment;

    public PrdDdlContextService(Environment environment) {
        this.environment = environment;
    }

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
            return selectRelevantContent(baseline, content, module, question, relatedEvidence);
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

    private Path resolveBaseline(String project) {
        if (project == null || project.isBlank()) {
            return null;
        }
        Path root = resolveKnowledgeRoot();
        if (!Files.isDirectory(root)) {
            return null;
        }
        try (Stream<Path> projects = Files.list(root)) {
            return projects.filter(Files::isDirectory)
                    .filter(path -> path.getFileName().toString().equalsIgnoreCase(project.trim()))
                    .map(path -> path.resolve(DDL_RELATIVE_PATH))
                    .filter(Files::isRegularFile)
                    .findFirst()
                    .orElse(null);
        } catch (IOException error) {
            log.debug("定位项目 DDL 基线失败: project={}, root={}", project, root, error);
            return null;
        }
    }

    private Path resolveKnowledgeRoot() {
        String repoPath = Binder.get(environment).bind(REPO_PATH_KEY, Bindable.of(String.class)).orElse(null);
        if (repoPath != null && !repoPath.isBlank()) {
            return Path.of(repoPath).resolve("knowledge");
        }
        return Path.of(System.getProperty("user.home"), ".kai-toolbox", "team-tools",
                "project-domain-knowledge", "knowledge");
    }

    private String selectRelevantContent(Path baseline, String content, String module, String question,
                                         String relatedEvidence) {
        ParsedBaseline parsed = parseBaseline(content);
        Set<String> terms = collectTerms(module, question, relatedEvidence);
        List<ScoredSection> selected = parsed.sections().stream()
                .map(section -> new ScoredSection(section, score(section, terms)))
                .filter(section -> section.score() > 0)
                .sorted(Comparator.comparingInt(ScoredSection::score).reversed())
                .limit(MAX_SECTIONS)
                .toList();
        if (selected.isEmpty()) {
            return "DDL 基线：" + baseline + "\n"
                    + "已找到项目 DDL 基线，但未从当前需求和图谱证据中匹配到关键表；不得据此推断表结构。";
        }
        StringBuilder result = new StringBuilder("DDL 基线：").append(baseline).append('\n');
        appendWithinLimit(result, parsed.preamble(), MAX_PREAMBLE_CHARS);
        for (ScoredSection section : selected) {
            appendWithinLimit(result, "\n\n" + section.section().content(), MAX_OUTPUT_CHARS);
        }
        return result.toString();
    }

    private static ParsedBaseline parseBaseline(String content) {
        StringBuilder preamble = new StringBuilder();
        List<DdlSection> sections = new ArrayList<>();
        String title = null;
        StringBuilder body = new StringBuilder();
        for (String line : content.split("\\R", -1)) {
            Matcher heading = SECOND_LEVEL_HEADING.matcher(line);
            if (heading.matches()) {
                if (title == null) {
                    preamble.append(body);
                } else {
                    sections.add(new DdlSection(title, body.toString().trim()));
                }
                title = heading.group(1).trim();
                body = new StringBuilder(line).append('\n');
            } else {
                body.append(line).append('\n');
            }
        }
        if (title == null) {
            preamble.append(body);
        } else {
            sections.add(new DdlSection(title, body.toString().trim()));
        }
        return new ParsedBaseline(preamble.toString().trim(), List.copyOf(sections));
    }

    private static Set<String> collectTerms(String... sources) {
        Set<String> terms = new HashSet<>();
        for (String source : sources) {
            if (source == null || source.isBlank()) {
                continue;
            }
            Matcher matcher = SEARCH_TERM.matcher(source.toLowerCase(Locale.ROOT));
            while (matcher.find() && terms.size() < 300) {
                String term = matcher.group();
                if (!IGNORED_TERMS.contains(term)) {
                    terms.add(term);
                }
            }
        }
        return terms;
    }

    private static int score(DdlSection section, Set<String> terms) {
        String title = section.title().toLowerCase(Locale.ROOT);
        String content = section.content().toLowerCase(Locale.ROOT);
        int score = 0;
        for (String term : terms) {
            if (title.contains(term) || term.contains(title)) {
                score += 12;
            } else if (content.contains(term)) {
                score += 1;
            }
        }
        return score;
    }

    private static void appendWithinLimit(StringBuilder target, String value, int limit) {
        int remaining = limit - target.length();
        if (remaining <= 0 || value == null || value.isBlank()) {
            return;
        }
        target.append(value, 0, Math.min(value.length(), remaining));
    }

    /**
     * @param title   DDL 二级标题，通常对应表或主题
     * @param content 标题及其正文
     */
    private record DdlSection(String title, String content) {
    }

    /**
     * @param section DDL 片段
     * @param score   与需求证据的相关度分数
     */
    private record ScoredSection(DdlSection section, int score) {
    }

    /**
     * @param preamble DDL 文档前言
     * @param sections 按二级标题切分的片段
     */
    private record ParsedBaseline(String preamble, List<DdlSection> sections) {
    }
}
