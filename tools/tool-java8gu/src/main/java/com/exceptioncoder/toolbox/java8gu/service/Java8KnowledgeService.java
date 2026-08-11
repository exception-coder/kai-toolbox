package com.exceptioncoder.toolbox.java8gu.service;

import com.exceptioncoder.toolbox.java8gu.domain.Java8Knowledge.Detail;
import com.exceptioncoder.toolbox.java8gu.domain.Java8Knowledge.Interview;
import com.exceptioncoder.toolbox.java8gu.domain.Java8Knowledge.Node;
import com.exceptioncoder.toolbox.java8gu.domain.Java8Knowledge.Relation;
import com.exceptioncoder.toolbox.java8gu.domain.Java8Knowledge.TreeNode;
import com.exceptioncoder.toolbox.java8gu.repository.Java8KnowledgeRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.DependsOn;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** 初始化并查询 Java 8 本地知识库。 */
@Service
@DependsOn("schemaInitializer")
public class Java8KnowledgeService {

    private static final Logger log = LoggerFactory.getLogger(Java8KnowledgeService.class);
    private static final List<String> CATEGORY_TITLES = List.of(
            "Java8 核心特性", "Lambda 表达式", "函数式接口", "Stream 流", "Optional",
            "日期时间 API", "接口增强", "集合增强", "并发增强", "JVM 性能", "Java8 重构实践", "面试专题");

    private final Java8KnowledgeRepository repository;
    private final PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();

    public Java8KnowledgeService(Java8KnowledgeRepository repository) {
        this.repository = repository;
    }

    /** 将 classpath Markdown 种子幂等投影到 SQLite。 */
    @PostConstruct
    public void initialize() throws IOException {
        repository.insertNodeIfAbsent(new Node("java8gu", "Java8 股", "遗留系统重构知识库与面试训练系统", "",
                "CATEGORY", 0, null, 0));
        for (int index = 0; index < CATEGORY_TITLES.size(); index++) {
            String title = CATEGORY_TITLES.get(index);
            repository.insertNodeIfAbsent(new Node(categoryId(title), title, "", "", "CATEGORY", 1,
                    "java8gu", index + 1));
        }
        Resource[] resources = resolver.getResources("classpath*:java8gu/nodes/*.md");
        for (Resource resource : resources) {
            importMarkdown(resource);
        }
        log.info("Java8 knowledge seed initialized, resources={}", resources.length);
    }

    /** 返回导航树。 */
    public List<TreeNode> categories() {
        List<Node> nodes = repository.findAllNodes();
        Map<String, List<Node>> children = new LinkedHashMap<>();
        for (Node node : nodes) {
            children.computeIfAbsent(node.parentId(), ignored -> new ArrayList<>()).add(node);
        }
        return children.getOrDefault(null, List.of()).stream().map(node -> toTree(node, children)).toList();
    }

    /** 聚合节点、案例和面试卡片。 */
    public Optional<Detail> detail(String id) {
        return repository.findNode(id)
                .map(node -> new Detail(node, repository.findExamples(id), repository.findInterviews(id)));
    }

    /** 查询双向关联。 */
    public List<Relation> relations(String id) {
        return repository.findRelations(id);
    }

    /** 查询面试卡片。 */
    public List<Interview> interviews(String nodeId) {
        return repository.findInterviews(nodeId);
    }

    private TreeNode toTree(Node node, Map<String, List<Node>> children) {
        return new TreeNode(node.id(), node.title(), node.summary(), node.nodeType(), node.level(),
                children.getOrDefault(node.id(), List.of()).stream().map(child -> toTree(child, children)).toList());
    }

    private void importMarkdown(Resource resource) throws IOException {
        String markdown = StreamUtils.copyToString(resource.getInputStream(), StandardCharsets.UTF_8);
        Seed seed = Seed.parse(markdown);
        repository.insertNodeIfAbsent(new Node(seed.value("id"), seed.value("title"), seed.value("summary"),
                seed.body(), seed.valueOrDefault("nodeType", "CONCEPT"), 2, seed.value("parentId"),
                Integer.parseInt(seed.valueOrDefault("sort", "1"))));
        if (!seed.section("beforeCode").isBlank() || !seed.section("afterCode").isBlank()) {
            repository.insertExampleIfAbsent(seed.value("id"), seed.valueOrDefault("exampleTitle", "重构对比"),
                    seed.section("beforeCode"), seed.section("afterCode"), seed.section("explanation"));
        }
        if (!seed.valueOrDefault("question", "").isBlank()) {
            repository.insertInterviewIfAbsent(seed.value("id"), seed.value("question"),
                    seed.section("shortAnswer"), seed.section("detailAnswer"), seed.section("projectAnswer"));
        }
        String related = seed.valueOrDefault("related", "");
        if (!related.isBlank()) {
            for (String relation : related.split(",")) {
                String[] parts = relation.trim().split(":", 2);
                repository.insertRelationIfAbsent(seed.value("id"), parts[0], parts.length == 2 ? parts[1] : "RELATED");
            }
        }
    }

    private String categoryId(String title) {
        return switch (title) {
            case "Java8 核心特性" -> "core";
            case "Lambda 表达式" -> "lambda";
            case "函数式接口" -> "functional-interface";
            case "Stream 流" -> "stream";
            case "Optional" -> "optional";
            case "日期时间 API" -> "datetime";
            case "接口增强" -> "interface";
            case "集合增强" -> "collection";
            case "并发增强" -> "concurrency";
            case "JVM 性能" -> "jvm";
            case "Java8 重构实践" -> "refactor";
            default -> "interview";
        };
    }

    private record Seed(Map<String, String> metadata, String body, Map<String, String> sections) {

        private static Seed parse(String markdown) {
            String normalized = markdown.replace("\r\n", "\n");
            String[] parts = normalized.split("---\n", 3);
            if (parts.length < 3) {
                throw new IllegalArgumentException("Java8 knowledge markdown requires YAML-like front matter");
            }
            Map<String, String> metadata = new LinkedHashMap<>();
            for (String line : parts[1].split("\n")) {
                int separator = line.indexOf(':');
                if (separator > 0) {
                    metadata.put(line.substring(0, separator).trim(), line.substring(separator + 1).trim());
                }
            }
            Map<String, String> sections = new LinkedHashMap<>();
            String current = null;
            StringBuilder value = new StringBuilder();
            for (String line : parts[2].split("\n")) {
                if (line.startsWith("<!-- section:") && line.endsWith(" -->")) {
                    if (current != null) {
                        sections.put(current, value.toString().trim());
                    }
                    current = line.substring(13, line.length() - 4).trim();
                    value.setLength(0);
                } else if (current != null) {
                    value.append(line).append('\n');
                }
            }
            if (current != null) {
                sections.put(current, value.toString().trim());
            }
            String body = parts[2].replaceAll("(?s)<!-- section:.*", "").trim();
            return new Seed(metadata, body, sections);
        }

        private String value(String key) {
            String value = metadata.get(key);
            if (value == null || value.isBlank()) {
                throw new IllegalArgumentException("Missing Java8 knowledge metadata: " + key);
            }
            return value;
        }

        private String valueOrDefault(String key, String fallback) {
            return metadata.getOrDefault(key, fallback);
        }

        private String section(String name) {
            return sections.getOrDefault(name, "");
        }
    }
}
