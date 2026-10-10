package com.exceptioncoder.toolbox.claudechat.service.codexsync;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SessionStatus;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.exceptioncoder.toolbox.claudechat.service.SidecarClient;
import com.exceptioncoder.toolbox.common.project.ProjectAccess;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import com.exceptioncoder.toolbox.claudechat.service.codexsync.CodexSyncModels.Thread;
import com.exceptioncoder.toolbox.claudechat.service.codexsync.CodexSyncModels.Project;
import com.exceptioncoder.toolbox.claudechat.service.codexsync.CodexSyncModels.ProjectPage;
import com.exceptioncoder.toolbox.claudechat.service.codexsync.CodexSyncModels.ThreadPage;
import com.exceptioncoder.toolbox.claudechat.service.codexsync.CodexSyncModels.ThreadView;
import com.exceptioncoder.toolbox.claudechat.service.codexsync.CodexSyncModels.ImportRequest;
import com.exceptioncoder.toolbox.claudechat.service.codexsync.CodexSyncModels.ImportResult;
import com.exceptioncoder.toolbox.claudechat.service.codexsync.CodexSyncModels.ImportedSession;
import static org.springframework.http.HttpStatus.*;

/** Imports native metadata into existing Forge sessions without starting Codex or mutating its desktop state. */
@Service
public class CodexDesktopSyncService {
    private final SidecarClient sidecar;
    private final ObjectMapper mapper;
    private final CodexSyncHomes homes;
    private final CodexSyncPreviews previews;
    private final ClaudeChatSessionRepository sessions;
    private final ClaudeChatSessionAccessPolicy access;
    private final ProjectAccess projects;
    private final TransactionTemplate transactions;

    public CodexDesktopSyncService(SidecarClient sidecar, ObjectMapper mapper, CodexSyncHomes homes,
            CodexSyncPreviews previews, ClaudeChatSessionRepository sessions, ClaudeChatSessionAccessPolicy access,
            ProjectAccess projects, TransactionTemplate transactions) {
        this.sidecar = sidecar;
        this.mapper = mapper;
        this.homes = homes;
        this.previews = previews;
        this.sessions = sessions;
        this.access = access;
        this.projects = projects;
        this.transactions = transactions;
    }

    public ProjectPage projects(String requestedHome, String cursor) {
        String home = homes.resolve(requestedHome);
        JsonNode page = query(home, "projects", cursor, null);
        List<Project> rows = decode(page.path("data"), Project.class).stream()
                .filter(row -> row.roots().isEmpty() || row.roots().stream().anyMatch(root -> unavailable(root) == null))
                .toList();
        return new ProjectPage(home, rows, cursor(page), page.path("fetchedAt").asLong());
    }

    public ThreadPage threads(String requestedHome, String cursor, String projectId) {
        String home = homes.resolve(requestedHome);
        JsonNode page = query(home, "threads", cursor, projectId);
        List<Thread> rows = decode(page.path("data"), Thread.class);
        Project project = page.path("project").isObject() ? mapper.convertValue(page.path("project"), Project.class) : null;
        Map<String, ClaudeChatSession> imported = existing(home, rows.stream().map(Thread::id).toList());
        List<ThreadView> views = rows.stream().map(row -> new ThreadView(row,
                imported.containsKey(row.id()) && access.canAccessCurrentUser(imported.get(row.id()))
                        ? imported.get(row.id()).getId() : null,
                unavailable(row.cwd()))).toList();
        String match = page.path("projectMatch").asText(null);
        return new ThreadPage(home, previews.save(home, project, match, rows), views, cursor(page), project, match,
                page.path("fetchedAt").asLong());
    }

    /** Serialize through transaction completion; stable IDs also prevent duplicates across processes. */
    public synchronized ImportResult importThreads(ImportRequest request) {
        CodexSyncPreviews.Preview preview = previews.require(request);
        homes.resolve(preview.home());
        List<Thread> selected = preview.threads().stream().filter(row -> request.threadIds().contains(row.id())).toList();
        for (Thread row : selected) {
            String reason = unavailable(row.cwd());
            if (reason != null) throw new ResponseStatusException(BAD_REQUEST, reason);
        }
        return transactions.execute(status -> persist(preview, selected));
    }

    /** 根据导入时持久化的完整身份识别来源，不将复用的 Forge 会话误标为导入。 */
    public boolean isImportedSession(ClaudeChatSession session) {
        String nativeId = codexThreadId(session);
        if (nativeId == null || nativeId.isBlank()) {
            return false;
        }
        String home = session.getCodexHome();
        if (home == null || home.isBlank()) {
            home = Path.of(System.getProperty("user.home"), ".codex").toString();
        }
        try {
            return stableId(home, nativeId).equals(session.getId());
        } catch (java.nio.file.InvalidPathException error) {
            return false;
        }
    }

    private String codexThreadId(ClaudeChatSession session) {
        if ("codex".equals(session.getEngine()) && session.getSdkSessionId() != null) {
            return session.getSdkSessionId();
        }
        if (session.getEngineSessions() != null) {
            try {
                JsonNode mapping = mapper.readTree(session.getEngineSessions());
                if (mapping != null && mapping.path("codex").isTextual()) {
                    return mapping.path("codex").asText();
                }
            } catch (java.io.IOException error) {
                return null;
            }
        }
        return null;
    }

    private ImportResult persist(CodexSyncPreviews.Preview preview, List<Thread> selected) {
        Map<String, ClaudeChatSession> existing = existing(preview.home(), selected.stream().map(Thread::id).toList());
        // Validate the entire batch before inserting any row.
        existing.values().forEach(row -> {
            if (!access.canAccessCurrentUser(row)) throw new ResponseStatusException(FORBIDDEN, "原会话属于其他用户，无法导入");
        });
        List<ImportedSession> results = new ArrayList<>();
        int added = 0;
        for (Thread row : selected) {
            ClaudeChatSession current = existing.get(row.id());
            if (current == null) {
                current = ClaudeChatSession.builder()
                        .id(stableId(preview.home(), row.id())).userId(preview.owner())
                        .cwd(Path.of(row.cwd()).toAbsolutePath().normalize().toString()).title(row.title())
                        .sdkSessionId(row.id()).engine("codex").engines("codex").codexHome(preview.home())
                        .selectedModel(row.model()).codexReasoningEffort(row.reasoningEffort()).codexSpeed("default")
                        .permissionMode("default").executionPolicy("standard").status(SessionStatus.IDLE)
                        .startedAt(row.createdAt()).lastSeenAt(row.updatedAt()).build();
                sessions.insert(current);
                sessions.updateEngineSessions(current.getId(), mapper.createObjectNode().put("codex", row.id()).toString());
                String group = groupName(preview.home(), row, preview.project(), preview.projectMatch());
                sessions.updateGroup(current.getId(), group, null);
                added++;
            }
            results.add(new ImportedSession(current.getId(), row.id(), current.getTitle()));
        }
        return new ImportResult(added, results.size() - added, List.copyOf(results));
    }

    private Map<String, ClaudeChatSession> existing(String home, List<String> ids) {
        Map<String, ClaudeChatSession> result = new LinkedHashMap<>();
        for (ClaudeChatSession row : sessions.findByCodexThreadIds(ids)) {
            String rowHome = row.getCodexHome() == null || row.getCodexHome().isBlank()
                    ? Path.of(System.getProperty("user.home"), ".codex").toString() : row.getCodexHome();
            if (!pathKey(home).equals(pathKey(rowHome))) continue;
            String nativeId = codexThreadId(row);
            if (ids.contains(nativeId)) result.putIfAbsent(nativeId, row);
        }
        return result;
    }

    private JsonNode query(String home, String kind, String cursor, String projectId) {
        if ((cursor != null && cursor.length() > 8192) || (projectId != null && projectId.length() > 256)) {
            throw new ResponseStatusException(BAD_REQUEST, "同步查询参数过长");
        }
        JsonNode result = sidecar.queryCodexDesktop(home, kind, cursor, projectId)
                .orElseThrow(() -> new ResponseStatusException(SERVICE_UNAVAILABLE, "Codex 同步查询未完成，请检查 Sidecar 后重试"));
        if (result.hasNonNull("error") || !result.path("page").path("data").isArray()) {
            throw new ResponseStatusException(BAD_GATEWAY, "无法读取 Codex 目录，请检查授权目录和 CLI 版本后重试");
        }
        return result.path("page");
    }

    private <T> List<T> decode(JsonNode data, Class<T> type) {
        if (!data.isArray() || data.size() > 50) throw new ResponseStatusException(BAD_GATEWAY, "无效的 Codex 分页数据");
        List<T> values = new ArrayList<>();
        data.forEach(row -> values.add(mapper.convertValue(row, type)));
        return List.copyOf(values);
    }

    private String unavailable(String directory) {
        try {
            Path path = Path.of(directory);
            if (!path.isAbsolute() || !Files.isDirectory(path)) return "工作目录不存在或不在本机，无法续接";
            if (!projects.allowed(path.normalize()) || !projects.allowed(path.toRealPath())) return "项目已被全局排除，无法导入";
            return null;
        } catch (Exception error) { return "工作目录不可读取，无法导入"; }
    }

    private static String cursor(JsonNode page) { return page.path("nextCursor").asText(null); }
    private static String pathKey(String path) {
        String value = Path.of(path).toAbsolutePath().normalize().toString();
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win") ? value.toLowerCase(Locale.ROOT) : value;
    }
    static String stableId(String home, String nativeId) {
        return UUID.nameUUIDFromBytes(("codex-sync\n" + pathKey(home) + "\n" + nativeId).getBytes(StandardCharsets.UTF_8)).toString();
    }
    private static String groupName(String home, Thread thread, Project project, String match) {
        if (project != null && (project.id().equals(thread.projectId())
                || ("directory".equals(match) && thread.projectId() == null
                    && project.roots().stream().anyMatch(root -> pathKey(root).equals(pathKey(thread.cwd())))))) {
            // Native time-based UUIDs can share prefixes; include the complete identity and account.
            String identity = UUID.nameUUIDFromBytes(("codex-project\n" + pathKey(home) + "\n" + project.id())
                    .getBytes(StandardCharsets.UTF_8)).toString().substring(0, 12);
            return project.name() + " · Codex " + identity;
        }
        return Path.of(thread.cwd()).getFileName() == null ? "Codex" : Path.of(thread.cwd()).getFileName().toString();
    }
}
