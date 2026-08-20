package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceDirView;
import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceListResponse;
import org.springframework.stereotype.Service;

import java.nio.file.InvalidPathException;
import java.nio.file.Path;

/**
 * 解析聊天消息中的本地路径，并将绝对路径限制在会话或项目工作台已登记项目内。
 */
@Service("claudeChatSessionLocalPathAccessService")
public class SessionLocalPathAccessService {

    private final SessionProjectDirectoryService projectDirectoryService;
    private final WorkspaceScanService workspaceScanService;

    public SessionLocalPathAccessService(SessionProjectDirectoryService projectDirectoryService,
                                         WorkspaceScanService workspaceScanService) {
        this.projectDirectoryService = projectDirectoryService;
        this.workspaceScanService = workspaceScanService;
    }

    /**
     * 解析受控本地路径。相对路径只属于主目录，绝对路径可命中已登记项目根。
     *
     * @param sessionId 当前会话 ID
     * @param primaryDirectory 当前会话主目录
     * @param linkedPath Markdown 链接中的规范化路径
     * @return 规范化后的目标路径
     * @throws IllegalArgumentException 路径非法或超出允许项目范围
     */
    public Path resolve(String sessionId, Path primaryDirectory, String linkedPath) {
        Path requested = parse(linkedPath);
        if (!requested.isAbsolute()) {
            return resolveRelative(primaryDirectory, requested);
        }

        Path target = requested.normalize();
        if (!allowedAbsolutePath(sessionId, primaryDirectory, target)) {
            throw new IllegalArgumentException("路径不属于当前会话或项目工作台");
        }
        return target;
    }

    private static Path parse(String linkedPath) {
        try {
            return Path.of(linkedPath);
        } catch (InvalidPathException exception) {
            throw new IllegalArgumentException("路径非法");
        }
    }

    private static Path resolveRelative(Path primaryDirectory, Path requested) {
        Path target = primaryDirectory.resolve(requested).normalize();
        if (!target.startsWith(primaryDirectory)) {
            throw new IllegalArgumentException("路径越界");
        }
        return target;
    }

    private boolean allowedAbsolutePath(String sessionId, Path primaryDirectory, Path target) {
        if (target.startsWith(primaryDirectory.toAbsolutePath().normalize())) {
            return true;
        }
        if (projectDirectoryService.list(sessionId).stream().anyMatch(path -> isWithin(target, path))) {
            return true;
        }
        WorkspaceListResponse workspaces = workspaceScanService.scan();
        return workspaces.roots().stream()
                .filter(WorkspaceListResponse.RootView::exists)
                .flatMap(root -> root.dirs().stream())
                .map(WorkspaceDirView::path)
                .anyMatch(path -> isWithin(target, path));
    }

    private static boolean isWithin(Path target, String root) {
        try {
            return target.startsWith(Path.of(root).toAbsolutePath().normalize());
        } catch (InvalidPathException exception) {
            return false;
        }
    }
}
