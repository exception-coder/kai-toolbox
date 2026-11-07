package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SqlDdlEvidence;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
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
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/** 按会话工作目录定位项目 DDL，并为 SQL 生成和登记提供可校验的结构证据。 */
@Service
public class SqlDdlEvidenceService {

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
    private com.exceptioncoder.toolbox.common.project.ProjectCatalog projectCatalog;

    @Autowired
    public SqlDdlEvidenceService(ClaudeChatSessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository;
    }

    @Autowired
    private com.exceptioncoder.toolbox.common.project.ProjectAccess projectAccess;

    @Autowired
    public void setProjectCatalog(com.exceptioncoder.toolbox.common.project.ProjectCatalog projectCatalog) {
        this.projectCatalog = projectCatalog;
    }

    public SqlDdlEvidence prepare(String sessionId, String purpose, List<String> tables, String requestedProject) {
        ClaudeChatSession session = requireSession(sessionId);
        List<String> requestedTables = normalizeTables(tables);
        ProjectResolution resolution = resolveProject(session.getCwd(), requestedProject, requestedTables);
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
                    "当前项目没有 SQL 结构文件，可继续生成未核验草稿，执行前需人工复核。", now), null);
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
            case SqlDdlEvidence.STATUS_VERIFIED -> "已从当前项目SQL文件核对目标表；仅证明该文件结构，不证明目标数据库已部署全部迁移，请核对数据库版本。";
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
        // Re-resolve the current project and files: a prior evidence ID cannot preserve retired scope.
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
        return identified;
    }

    private ProjectResolution resolveProject(String cwdValue, String requestedProject, List<String> tables) {
        try {
            Path cwd = Path.of(cwdValue).toRealPath();
            if (projectAccess != null) projectAccess.requireAllowed(cwd);
            Path root = cwd;
            if (projectCatalog != null) {
                var matches = projectCatalog.list(false).stream()
                        .filter(entry -> entry.available() && !entry.excluded())
                        .filter(entry -> cwd.startsWith(Path.of(entry.path()).toAbsolutePath().normalize()))
                        .sorted(Comparator.comparingInt((com.exceptioncoder.toolbox.common.project.ProjectCatalog.Entry e)
                                -> Path.of(e.path()).getNameCount()).reversed()).toList();
                if (matches.isEmpty()) return ProjectResolution.failed(SqlDdlEvidence.STATUS_DDL_MISSING,
                        List.of(), "会话未匹配到可用项目目录；不回退公共知识库或其他项目。");
                root = Path.of(matches.getFirst().path()).toRealPath();
            }
            String project = root.getFileName().toString();
            if (requestedProject != null && !requestedProject.isBlank() && !project.equalsIgnoreCase(requestedProject)) {
                return ProjectResolution.failed(SqlDdlEvidence.STATUS_PROJECT_AMBIGUOUS, List.of(project),
                        "请求项目与当前会话目录不一致；请在目标项目会话核验，不采用旧继承配置。");
            }
            // Read bounded SQL source files only. Migrated Markdown is historical evidence, not a DDL baseline.
            Path checkedRoot = root;
            List<Path> candidates;
            try (Stream<Path> files = Files.walk(root, 10)) {
                List<Path> scanned = files.limit(20_001).toList();
                if (scanned.size() > 20_000) return ProjectResolution.failed(SqlDdlEvidence.STATUS_DDL_MISSING,
                        List.of(project), "项目SQL扫描达到上限，无法排除其他迁移；请定位结构文件或使用数据库元数据核验。");
                candidates = scanned.stream().filter(file -> Files.isRegularFile(file, java.nio.file.LinkOption.NOFOLLOW_LINKS))
                        .filter(file -> file.toString().endsWith(".sql"))
                        .filter(file -> projectAccess == null || projectAccess.allowed(file))
                        .filter(file -> !checkedRoot.relativize(file).toString().replace('\\', '/').matches(
                                ".*(^|/)(target|node_modules|dist|build|\\.git|graphify-out|docs/domain/impl)(/|$).*"))
                        .filter(file -> {
                            try { return file.toRealPath().startsWith(checkedRoot) && Files.size(file) <= 2 * 1024 * 1024; }
                            catch (IOException error) { return false; }
                        }).sorted().limit(201).toList();
            }
            if (candidates.size() > 200) return ProjectResolution.failed(SqlDdlEvidence.STATUS_DDL_MISSING,
                    List.of(project), "项目SQL文件超过扫描上限，请定位目标结构文件或数据库元数据。");
            List<Path> matched = new ArrayList<>();
            for (Path candidate : candidates) {
                String content = Files.readString(candidate, StandardCharsets.UTF_8);
                Matcher mutations = Pattern.compile("(?is)\\b(?:ALTER|DROP|RENAME)\\s+TABLE\\s+([^\\s(;]+)").matcher(content);
                while (mutations.find()) {
                    if (tables.contains(normalizeTable(mutations.group(1)))) return ProjectResolution.failed(
                            SqlDdlEvidence.STATUS_DDL_MISSING, List.of(project),
                            "发现目标表后续结构变更，不能只据CREATE语句认定最终结构；请核验迁移顺序或数据库元数据。来源：" + candidate);
                }
                if (!extractFragments(content, tables).isEmpty()) matched.add(candidate);
            }
            if (matched.size() == 1) return ProjectResolution.resolved(project, matched.getFirst(), List.of(project));
            return ProjectResolution.failed(SqlDdlEvidence.STATUS_DDL_MISSING, List.of(project),
                    matched.isEmpty() ? "当前项目未找到目标表的SQL结构文件；请用授权数据库元数据核验，历史Markdown不作当前DDL。"
                            : "目标表分布于多个SQL文件或迁移版本，无法自动认定最终结构；请核验迁移顺序或数据库元数据。来源：" + matched);
        } catch (IOException | IllegalArgumentException | NullPointerException error) {
            return ProjectResolution.failed(SqlDdlEvidence.STATUS_DDL_MISSING, List.of(),
                    "项目目录或SQL结构文件不可读取；不回退其他项目或公共知识库。");
        }
    }

    private Map<String, String> extractFragments(String content, List<String> tables) {
        Map<String, String> fragments = new LinkedHashMap<>();
        int total = 0;
        for (String table : tables) {
            String fragment = extractCreateTableFragment(content, table);
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
