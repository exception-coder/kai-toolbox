package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceListResponse;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionProjectDirectoryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** 管理会话的附加项目目录，并生成由后端控制的跨项目开发上下文。 */
@Service
public class SessionProjectDirectoryService {

    private static final int MAX_PROJECT_COUNT = 8;

    private final ClaudeChatSessionRepository sessionRepository;
    private final SessionProjectDirectoryRepository directoryRepository;
    private final WorkspaceScanService workspaceScanService;

    public SessionProjectDirectoryService(ClaudeChatSessionRepository sessionRepository,
                                          SessionProjectDirectoryRepository directoryRepository,
                                          WorkspaceScanService workspaceScanService) {
        this.sessionRepository = sessionRepository;
        this.directoryRepository = directoryRepository;
        this.workspaceScanService = workspaceScanService;
    }

    public List<String> list(String sessionId) {
        return sessionRepository.findById(sessionId).isPresent()
                ? directoryRepository.findPaths(sessionId) : List.of();
    }

    @Transactional
    public boolean replace(String sessionId, List<String> requestedPaths) {
        ClaudeChatSession session = sessionRepository.findById(sessionId).orElse(null);
        if (session == null) return false;
        if (!SessionExecutionPolicy.STANDARD.equals(SessionExecutionPolicy.normalize(session.getExecutionPolicy()))) {
            throw new IllegalArgumentException("只有开发会话可以关联附加项目目录");
        }
        List<String> normalized = normalizeAndValidate(requestedPaths, session.getCwd());
        directoryRepository.replace(sessionId, normalized, System.currentTimeMillis());
        return true;
    }

    @Transactional
    public void copy(String sourceSessionId, String targetSessionId) {
        directoryRepository.copy(sourceSessionId, targetSessionId, System.currentTimeMillis());
    }

    @Transactional
    public void clear(String sessionId) {
        directoryRepository.deleteBySessionId(sessionId);
    }

    /** 仅供标准开发会话使用；返回 null 表示无附加项目，不改变单项目会话行为。 */
    public SessionProjectContext buildContext(String sessionId, String primaryCwd, String executionPolicy) {
        if (!SessionExecutionPolicy.STANDARD.equals(SessionExecutionPolicy.normalize(executionPolicy))) return null;
        List<String> paths = directoryRepository.findPaths(sessionId).stream()
                .filter(path -> Files.isDirectory(Path.of(path)))
                .toList();
        if (paths.isEmpty()) return null;
        StringBuilder prompt = new StringBuilder("""
                【Forge 会话级多项目上下文】
                当前任务可能跨越多个代码项目。主项目目录仍是默认命令工作目录；附加项目目录不是新的主目录。
                主项目目录：
                """).append("- ").append(normalizePath(primaryCwd)).append("\n附加项目目录：");
        paths.forEach(path -> prompt.append("\n- ").append(path));
        prompt.append("""

                执行规则：
                - 先判断需求实际涉及哪些项目；涉及跨项目契约时必须核对对应目录，不要只检查主项目。
                - 对每个命令显式指定正确的工作目录，不要假设前一次目录切换会持续生效。
                - 修改前核对目标文件所属项目；提交前分别检查各 Git 仓库状态，禁止把不同仓库误当成一个仓库。
                - 不要求机械修改所有项目；只修改有证据表明确实受影响的项目。
                """);
        return new SessionProjectContext(paths, prompt.toString().trim());
    }

    private List<String> normalizeAndValidate(List<String> requestedPaths, String primaryCwd) {
        if (requestedPaths == null || requestedPaths.isEmpty()) return List.of();
        if (requestedPaths.size() > MAX_PROJECT_COUNT) {
            throw new IllegalArgumentException("每个会话最多关联 " + MAX_PROJECT_COUNT + " 个附加项目");
        }
        Map<String, String> allowed = new LinkedHashMap<>();
        WorkspaceListResponse workspaces = workspaceScanService.scan();
        workspaces.roots().stream().filter(WorkspaceListResponse.RootView::exists)
                .flatMap(root -> root.dirs().stream())
                .forEach(dir -> allowed.put(pathKey(dir.path()), normalizePath(dir.path())));
        String primaryKey = pathKey(primaryCwd);
        Map<String, String> unique = new LinkedHashMap<>();
        for (String requested : requestedPaths) {
            if (requested == null || requested.isBlank()) continue;
            String key = pathKey(requested);
            if (key.equals(primaryKey)) continue;
            String allowedPath = allowed.get(key);
            if (allowedPath == null) {
                throw new IllegalArgumentException("附加项目不在项目工作台可用目录中: " + requested);
            }
            unique.putIfAbsent(key, allowedPath);
        }
        return new ArrayList<>(unique.values());
    }

    private static String normalizePath(String path) {
        if (path == null || path.isBlank()) return "";
        return Path.of(path).toAbsolutePath().normalize().toString();
    }

    private static String pathKey(String path) {
        String normalized = normalizePath(path);
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win")
                ? normalized.toLowerCase(Locale.ROOT) : normalized;
    }

    public record SessionProjectContext(List<String> paths, String instructions) {
    }
}
