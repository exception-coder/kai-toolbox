package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SqlDdlEvidence;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/** 按会话工作目录定位项目 DDL，并为 SQL 生成和登记提供可校验的结构证据。 */
@Service
public class SqlDdlEvidenceService {

    private static final long EVIDENCE_TTL_MS = 30 * 60 * 1000L;
    private static final int MAX_FRAGMENT_CHARS = 24 * 1024;
    private static final int MAX_TOTAL_FRAGMENT_CHARS = 96 * 1024;
    private static final Pattern MARKDOWN_HEADING = Pattern.compile("^(#{2,4})\\s+(.+?)\\s*$");
    private static final Pattern CREATE_TABLE = Pattern.compile(
            "(?is)\\bCREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+([^\\s(]+)");
    private static final Pattern SQL_TABLE = Pattern.compile(
            "(?is)\\b(?:CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?|ALTER\\s+TABLE|DROP\\s+TABLE(?:\\s+IF\\s+EXISTS)?|TRUNCATE\\s+TABLE|INSERT\\s+INTO|(?<!DO\\s)(?<!KEY\\s)UPDATE|DELETE\\s+FROM|MERGE\\s+INTO|REPLACE\\s+INTO|COMMENT\\s+ON\\s+TABLE|RENAME\\s+TABLE)\\s+([^\\s(;,]+)");
    private static final Pattern CREATE_INDEX_TABLE = Pattern.compile(
            "(?is)\\bCREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+[^\\s(;,]+\\s+ON\\s+([^\\s(;,]+)");
    private static final Pattern STALE_MARKER = Pattern.compile(
            "(?im)(?:DDL_BASELINE_STATUS\\s*:\\s*STALE|<!--\\s*ddl-status\\s*:\\s*stale\\s*-->)");

    private final ClaudeChatSessionRepository sessionRepository;
    private final Path knowledgeRoot;
    private final ObjectMapper objectMapper;
    private final Map<String, CachedEvidence> evidenceCache = new ConcurrentHashMap<>();

    @Autowired
    public SqlDdlEvidenceService(ClaudeChatSessionRepository sessionRepository) {
        this(sessionRepository, defaultKnowledgeRoot(), new ObjectMapper());
    }

    SqlDdlEvidenceService(ClaudeChatSessionRepository sessionRepository, Path knowledgeRoot) {
        this(sessionRepository, knowledgeRoot, new ObjectMapper());
    }

    SqlDdlEvidenceService(ClaudeChatSessionRepository sessionRepository, Path knowledgeRoot,
                          ObjectMapper objectMapper) {
        this.sessionRepository = sessionRepository;
        this.knowledgeRoot = knowledgeRoot.toAbsolutePath().normalize();
        this.objectMapper = objectMapper;
    }

    public SqlDdlEvidence prepare(String sessionId, String purpose, List<String> tables, String requestedProject) {
        ClaudeChatSession session = requireSession(sessionId);
        List<String> requestedTables = normalizeTables(tables);
        ProjectResolution resolution = resolveProject(session.getCwd(), requestedProject);
        long now = System.currentTimeMillis();
        if (resolution.status() != null) {
            return cache(sessionId, new SqlDdlEvidence(
                    null, resolution.status(), null, null, requestedTables, List.of(), requestedTables,
                    resolution.candidates(), Map.of(), resolution.warning(), now), null);
        }
        Path baseline = resolution.baselinePath();
        if (!Files.isRegularFile(baseline)) {
            return cache(sessionId, new SqlDdlEvidence(
                    null, SqlDdlEvidence.STATUS_DDL_MISSING, resolution.project(), baseline.toString(),
                    requestedTables, List.of(), requestedTables, resolution.candidates(), Map.of(),
                    "当前项目知识库没有 DDL 基线，可继续生成并登记未核验草稿，执行前需人工复核。", now), null);
        }
        String content;
        try {
            content = Files.readString(baseline, StandardCharsets.UTF_8);
        } catch (IOException e) {
            return cache(sessionId, new SqlDdlEvidence(
                    null, SqlDdlEvidence.STATUS_DDL_MISSING, resolution.project(), baseline.toString(),
                    requestedTables, List.of(), requestedTables, resolution.candidates(), Map.of(),
                    "DDL 基线读取失败：" + e.getMessage(), now), null);
        }
        if (requestedTables.isEmpty()) {
            return cache(sessionId, new SqlDdlEvidence(
                    null, SqlDdlEvidence.STATUS_NOT_CHECKED, resolution.project(), baseline.toString(),
                    List.of(), List.of(), List.of(), resolution.candidates(), Map.of(),
                    "尚未提供目标表，不能完成字段级 DDL 核验。", now), fingerprint(content));
        }

        Map<String, String> fragments = extractFragments(content, requestedTables);
        List<String> verified = requestedTables.stream().filter(fragments::containsKey).toList();
        List<String> missing = requestedTables.stream().filter(table -> !fragments.containsKey(table)).toList();
        boolean stale = STALE_MARKER.matcher(content).find();
        String status = stale
                ? SqlDdlEvidence.STATUS_STALE
                : missing.isEmpty() ? SqlDdlEvidence.STATUS_VERIFIED : SqlDdlEvidence.STATUS_PARTIAL;
        String warning = switch (status) {
            case SqlDdlEvidence.STATUS_VERIFIED -> "已从项目 DDL 基线核对全部目标表，请仅使用返回片段中的真实字段。";
            case SqlDdlEvidence.STATUS_STALE -> "DDL 基线已显式标记过期，可继续生成并登记待复核草稿，执行前需人工复核。";
            default -> "以下目标表未在 DDL 基线命中：" + String.join("、", missing)
                    + "。可继续生成并登记未核验草稿，请明确列出假设并在执行前人工复核。";
        };
        return cache(sessionId, new SqlDdlEvidence(
                null, status, resolution.project(), baseline.toString(), requestedTables, verified, missing,
                resolution.candidates(), fragments, warning, now), fingerprint(content));
    }

    /** 登记端不信任模型声明：重新提取 SQL 表名，并校验 evidenceId 是否覆盖当前会话和全部表。 */
    public SqlDdlEvidence verifyRegistration(String sessionId, String sqlText, String evidenceId) {
        List<String> sqlTables = new ArrayList<>(extractSqlTables(sqlText));
        CachedEvidence cached = evidenceId == null ? null : evidenceCache.get(evidenceId);
        long now = System.currentTimeMillis();
        if (!sqlTables.isEmpty() && cached != null && cached.sessionId().equals(sessionId)
                && cached.expiresAt() >= now
                && baselineUnchanged(cached)
                && cached.evidence().verifiedTables().containsAll(sqlTables)
                && SqlDdlEvidence.STATUS_VERIFIED.equals(cached.evidence().status())) {
            return cached.evidence();
        }
        return prepare(sessionId, "登记待执行 SQL", sqlTables, null);
    }

    public Set<String> extractSqlTables(String sqlText) {
        Set<String> tables = new LinkedHashSet<>();
        if (sqlText == null || sqlText.isBlank()) return tables;
        Matcher matcher = SQL_TABLE.matcher(stripSqlComments(sqlText));
        while (matcher.find()) {
            String table = normalizeTable(matcher.group(1));
            if (!table.isBlank()) tables.add(table);
        }
        Matcher indexMatcher = CREATE_INDEX_TABLE.matcher(stripSqlComments(sqlText));
        while (indexMatcher.find()) {
            String table = normalizeTable(indexMatcher.group(1));
            if (!table.isBlank()) tables.add(table);
        }
        return tables;
    }

    private SqlDdlEvidence cache(String sessionId, SqlDdlEvidence evidence, String baselineFingerprint) {
        String id = UUID.randomUUID().toString();
        SqlDdlEvidence identified = new SqlDdlEvidence(
                id, evidence.status(), evidence.project(), evidence.baselinePath(), evidence.requestedTables(),
                evidence.verifiedTables(), evidence.missingTables(), evidence.candidateProjects(),
                evidence.ddlFragments(), evidence.warning(), evidence.checkedAt());
        evidenceCache.put(id, new CachedEvidence(
                sessionId, identified, baselineFingerprint, System.currentTimeMillis() + EVIDENCE_TTL_MS));
        if (evidenceCache.size() > 512) {
            long now = System.currentTimeMillis();
            evidenceCache.entrySet().removeIf(entry -> entry.getValue().expiresAt() < now);
        }
        return identified;
    }

    private ProjectResolution resolveProject(String cwdValue, String requestedProject) {
        Map<String, String> projects = availableProjects();
        if (projects.isEmpty()) {
            return ProjectResolution.failed(SqlDdlEvidence.STATUS_DDL_MISSING, List.of(),
                    "团队项目知识库中没有可用的 DDL 基线。");
        }
        Path cwd;
        try {
            cwd = Path.of(cwdValue).toAbsolutePath().normalize();
        } catch (InvalidPathException | NullPointerException e) {
            return ProjectResolution.failed(SqlDdlEvidence.STATUS_DDL_MISSING, List.of(), "会话工作目录无效。");
        }

        String explicitProject = requestedProject == null ? null : projects.get(requestedProject.trim().toLowerCase(Locale.ROOT));
        if (explicitProject != null) {
            return resolveBaseline(explicitProject, List.of(explicitProject));
        }

        for (Path current = cwd; current != null; current = current.getParent()) {
            String name = current.getFileName() == null ? "" : current.getFileName().toString().toLowerCase(Locale.ROOT);
            if (projects.containsKey(name)) {
                String project = projects.get(name);
                return resolveBaseline(project, List.of(project));
            }
        }

        Set<String> candidates = new LinkedHashSet<>();
        if (Files.isDirectory(cwd)) {
            try (Stream<Path> children = Files.list(cwd)) {
                children.filter(Files::isDirectory).forEach(child -> {
                    String name = child.getFileName().toString().toLowerCase(Locale.ROOT);
                    if (projects.containsKey(name)) candidates.add(projects.get(name));
                });
            } catch (IOException ignored) {
                // 目录不可枚举时按无候选处理，不能猜项目。
            }
        }
        List<String> sorted = candidates.stream().sorted(String.CASE_INSENSITIVE_ORDER).toList();
        if (sorted.size() == 1) return resolveBaseline(sorted.get(0), sorted);
        if (sorted.size() > 1) {
            return ProjectResolution.failed(SqlDdlEvidence.STATUS_PROJECT_AMBIGUOUS, sorted,
                    "当前聚合工作区对应多个 DDL 项目，请从候选项目中明确选择。");
        }
        return ProjectResolution.failed(SqlDdlEvidence.STATUS_DDL_MISSING, List.of(),
                "无法从当前会话工作目录映射到项目知识库 DDL。");
    }

    private Map<String, String> availableProjects() {
        Path root = knowledgeRoot;
        if (!Files.isDirectory(root)) return Map.of();
        Map<String, String> projects = new LinkedHashMap<>();
        try (Stream<Path> entries = Files.list(root)) {
            entries.filter(Files::isDirectory)
                    .filter(path -> Files.isRegularFile(path.resolve("impl").resolve("ddl-baseline.md"))
                            || Files.isRegularFile(path.resolve("impl").resolve("project-context.json")))
                    .sorted(Comparator.comparing(path -> path.getFileName().toString(), String.CASE_INSENSITIVE_ORDER))
                    .forEach(path -> projects.put(
                            path.getFileName().toString().toLowerCase(Locale.ROOT), path.getFileName().toString()));
        } catch (IOException ignored) {
            return Map.of();
        }
        return projects;
    }

    private ProjectResolution resolveBaseline(String project, List<String> candidates) {
        Path projectDirectory = knowledgeRoot.resolve(project).normalize();
        Path contextPath = projectDirectory.resolve("impl").resolve("project-context.json");
        Path baseline = projectDirectory.resolve("impl").resolve("ddl-baseline.md");
        if (Files.isRegularFile(contextPath)) {
            try {
                JsonNode context = objectMapper.readTree(contextPath.toFile());
                validateProjectContext(project, context);
                JsonNode ddlSource = context.path("ddlSource");
                String configuredPath = ddlSource.path("path").asText("").trim();
                String sourceProject = ddlSource.path("project").asText("").trim();
                if (!configuredPath.isEmpty()) {
                    baseline = knowledgeRoot.resolve(configuredPath).normalize();
                    if (!baseline.startsWith(knowledgeRoot)) {
                        return ProjectResolution.failed(SqlDdlEvidence.STATUS_DDL_MISSING, candidates,
                                "项目知识上下文中的 DDL 路径超出知识库根目录。");
                    }
                    Set<String> effectiveProjects = new LinkedHashSet<>();
                    collectEffectiveProjects(project, effectiveProjects, new LinkedHashSet<>());
                    if (!effectiveProjects.contains(sourceProject)) {
                        return ProjectResolution.failed(SqlDdlEvidence.STATUS_DDL_MISSING, candidates,
                                "DDL 来源项目不是当前项目的有效知识来源：" + sourceProject);
                    }
                    Path sourceDirectory = knowledgeRoot.resolve(sourceProject).normalize();
                    if (!baseline.startsWith(sourceDirectory)) {
                        return ProjectResolution.failed(SqlDdlEvidence.STATUS_DDL_MISSING, candidates,
                                "DDL 来源路径不属于配置的来源项目：" + sourceProject);
                    }
                }
            } catch (IOException e) {
                return ProjectResolution.failed(SqlDdlEvidence.STATUS_DDL_MISSING, candidates,
                        "项目知识上下文读取失败：" + e.getMessage());
            } catch (IllegalArgumentException e) {
                return ProjectResolution.failed(SqlDdlEvidence.STATUS_DDL_MISSING, candidates, e.getMessage());
            }
        }
        if (!baseline.startsWith(knowledgeRoot)) {
            return ProjectResolution.failed(SqlDdlEvidence.STATUS_DDL_MISSING, candidates,
                    "项目知识上下文中的 DDL 路径超出知识库根目录。");
        }
        return ProjectResolution.resolved(project, baseline, candidates);
    }

    private void validateProjectContext(String project, JsonNode context) {
        if (!context.isObject()) {
            throw new IllegalArgumentException("项目知识上下文根节点必须是对象。");
        }
        if (context.path("schemaVersion").asInt(-1) != 1) {
            throw new IllegalArgumentException("项目知识上下文 schemaVersion 必须为 1。");
        }
        if (!project.equals(context.path("project").asText())) {
            throw new IllegalArgumentException("项目知识上下文 project 必须为 " + project + "。");
        }
        JsonNode ddlSource = context.path("ddlSource");
        if (!ddlSource.isMissingNode() && !ddlSource.isNull()) {
            if (!ddlSource.isObject()) {
                throw new IllegalArgumentException("项目知识上下文 ddlSource 必须是对象。");
            }
            for (String field : List.of("project", "guideId", "path")) {
                if (ddlSource.path(field).asText("").trim().isEmpty()) {
                    throw new IllegalArgumentException("项目知识上下文 ddlSource." + field + " 不能为空。");
                }
            }
        }
        JsonNode sources = context.path("knowledgeSources");
        if (!sources.isMissingNode() && !sources.isArray()) {
            throw new IllegalArgumentException("项目知识上下文 knowledgeSources 必须是数组。");
        }
    }

    private void collectEffectiveProjects(String project, Set<String> effectiveProjects, Set<String> stack)
            throws IOException {
        if (!stack.add(project)) {
            throw new IllegalArgumentException("项目知识上下文存在循环继承：" + String.join(" -> ", stack) + " -> " + project);
        }
        if (!effectiveProjects.add(project)) {
            stack.remove(project);
            return;
        }
        Path contextPath = knowledgeRoot.resolve(project).resolve("impl").resolve("project-context.json");
        if (Files.isRegularFile(contextPath)) {
            JsonNode context = objectMapper.readTree(contextPath.toFile());
            validateProjectContext(project, context);
            for (JsonNode source : context.path("knowledgeSources")) {
                String sourceProject = source.path("project").asText("").trim();
                if (sourceProject.isEmpty() || !Files.isDirectory(knowledgeRoot.resolve(sourceProject))) {
                    throw new IllegalArgumentException("项目知识来源不存在：" + sourceProject);
                }
                collectEffectiveProjects(sourceProject, effectiveProjects, stack);
            }
        }
        stack.remove(project);
    }

    private Map<String, String> extractFragments(String content, List<String> tables) {
        Map<String, String> fragments = new LinkedHashMap<>();
        String[] lines = content.split("\\R", -1);
        int total = 0;
        for (String table : tables) {
            String fragment = extractHeadingFragment(lines, table);
            if (fragment == null) fragment = extractCreateTableFragment(content, table);
            if (fragment == null) continue;
            fragment = fragment.length() > MAX_FRAGMENT_CHARS
                    ? fragment.substring(0, MAX_FRAGMENT_CHARS) + "\n-- DDL 片段已截断"
                    : fragment;
            if (total + fragment.length() > MAX_TOTAL_FRAGMENT_CHARS) break;
            fragments.put(table, fragment);
            total += fragment.length();
        }
        return Map.copyOf(fragments);
    }

    private String extractHeadingFragment(String[] lines, String table) {
        for (int i = 0; i < lines.length; i++) {
            Matcher heading = MARKDOWN_HEADING.matcher(lines[i]);
            if (!heading.matches() || !normalizeTable(heading.group(2)).equals(table)) continue;
            int level = heading.group(1).length();
            StringBuilder fragment = new StringBuilder(lines[i]).append('\n');
            for (int j = i + 1; j < lines.length; j++) {
                Matcher next = MARKDOWN_HEADING.matcher(lines[j]);
                if (next.matches() && next.group(1).length() <= level) break;
                fragment.append(lines[j]).append('\n');
                if (fragment.length() >= MAX_FRAGMENT_CHARS) break;
            }
            return fragment.toString().trim();
        }
        return null;
    }

    private String extractCreateTableFragment(String content, String table) {
        Matcher matcher = CREATE_TABLE.matcher(content);
        while (matcher.find()) {
            if (!normalizeTable(matcher.group(1)).equals(table)) continue;
            int end = content.indexOf(';', matcher.end());
            if (end < 0) end = Math.min(content.length(), matcher.start() + MAX_FRAGMENT_CHARS);
            return content.substring(matcher.start(), Math.min(content.length(), end + 1)).trim();
        }
        return null;
    }

    private ClaudeChatSession requireSession(String sessionId) {
        return sessionRepository.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在：" + sessionId));
    }

    private static List<String> normalizeTables(List<String> tables) {
        if (tables == null) return List.of();
        return tables.stream().map(SqlDdlEvidenceService::normalizeTable).filter(value -> !value.isBlank())
                .distinct().limit(50).toList();
    }

    private static String normalizeTable(String raw) {
        if (raw == null) return "";
        String value = raw.trim().replaceAll("^[`\\\"\\[]+|[`\\\"\\]]+$", "");
        int dot = value.lastIndexOf('.');
        if (dot >= 0) value = value.substring(dot + 1);
        return value.replaceAll("[^A-Za-z0-9_$]", "").toUpperCase(Locale.ROOT);
    }

    private static String stripSqlComments(String sql) {
        return sql.replaceAll("(?s)/\\*.*?\\*/", " ").replaceAll("(?m)--.*$", " ");
    }

    private static String fingerprint(String content) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("当前 JDK 不支持 SHA-256", e);
        }
    }

    private static boolean baselineUnchanged(CachedEvidence cached) {
        if (cached.baselineFingerprint() == null || cached.evidence().baselinePath() == null) return true;
        try {
            String content = Files.readString(Path.of(cached.evidence().baselinePath()), StandardCharsets.UTF_8);
            return cached.baselineFingerprint().equals(fingerprint(content));
        } catch (IOException | InvalidPathException e) {
            return false;
        }
    }

    private static Path defaultKnowledgeRoot() {
        return Path.of(System.getProperty("user.home"), ".kai-toolbox", "team-tools",
                "project-domain-knowledge", "knowledge");
    }

    private record CachedEvidence(String sessionId, SqlDdlEvidence evidence, String baselineFingerprint,
                                  long expiresAt) {
    }

    private record ProjectResolution(String project, Path baselinePath, String status,
                                     List<String> candidates, String warning) {
        static ProjectResolution resolved(String project, Path baselinePath, List<String> candidates) {
            return new ProjectResolution(project, baselinePath, null, candidates, null);
        }

        static ProjectResolution failed(String status, List<String> candidates, String warning) {
            return new ProjectResolution(null, null, status, candidates, warning);
        }
    }
}
