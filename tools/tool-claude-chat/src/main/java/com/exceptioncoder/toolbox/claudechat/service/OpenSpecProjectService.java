package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;

/** 编排 Vibe Coding 项目的 OpenSpec 状态检测与用户授权后的初始化。 */
@Service
public class OpenSpecProjectService {

    private final ClaudeChatSessionRepository sessionRepository;
    private final WorkspaceScanService workspaceScanService;
    private final OpenSpecCliGateway cliGateway;

    public OpenSpecProjectService(ClaudeChatSessionRepository sessionRepository,
                                  WorkspaceScanService workspaceScanService,
                                  OpenSpecCliGateway cliGateway) {
        this.sessionRepository = sessionRepository;
        this.workspaceScanService = workspaceScanService;
        this.cliGateway = cliGateway;
    }

    /**
     * 只读检测目标项目是否已解析到 OpenSpec root。
     *
     * @param request 项目、会话和工具上下文
     * @return OpenSpec 项目状态
     */
    public ProjectStatus status(ProjectRequest request) {
        Path projectDirectory = resolveAllowedProject(request);
        return inspect(projectDirectory);
    }

    /**
     * 用户确认后幂等初始化目标项目，并再次执行只读检测。
     *
     * @param request 项目、会话和工具上下文
     * @return 初始化后的 OpenSpec 项目状态
     */
    public ProjectStatus initialize(ProjectRequest request) {
        Path projectDirectory = resolveAllowedProject(request);
        ProjectStatus current = inspect(projectDirectory);
        if (ProjectState.READY == current.state()) {
            return current;
        }
        if (ProjectState.NOT_INITIALIZED != current.state()) {
            return current;
        }

        String tool = normalizeTool(request.tool());
        OpenSpecCliGateway.CommandResult result = cliGateway.run(
                projectDirectory, List.of("init", ".", "--tools", tool));
        ProjectStatus failure = commandFailure(projectDirectory, result, "OpenSpec 初始化");
        if (failure != null) {
            return failure;
        }
        ProjectStatus initialized = inspect(projectDirectory);
        return ProjectState.READY == initialized.state()
                ? initialized
                : new ProjectStatus(ProjectState.ERROR, projectDirectory.toString(),
                "初始化命令已结束，但仍未解析到 OpenSpec root", initialized.detail());
    }

    /** 执行只读 OpenSpec root 探测并归一化 CLI 结果。 */
    private ProjectStatus inspect(Path projectDirectory) {
        OpenSpecCliGateway.CommandResult result = cliGateway.run(
                projectDirectory, List.of("context", "--json"));
        if (!result.started()) {
            return new ProjectStatus(ProjectState.TOOL_UNAVAILABLE, projectDirectory.toString(),
                    "未找到 OpenSpec CLI，请先安装 OpenSpec", result.output());
        }
        if (result.timedOut()) {
            return new ProjectStatus(ProjectState.ERROR, projectDirectory.toString(),
                    "OpenSpec 状态检测超时", result.output());
        }
        if (result.exitCode() == 0) {
            return new ProjectStatus(ProjectState.READY, projectDirectory.toString(),
                    "OpenSpec 已初始化", result.output());
        }
        if (result.output().contains("no_openspec_root")) {
            return new ProjectStatus(ProjectState.NOT_INITIALIZED, projectDirectory.toString(),
                    "当前项目尚未初始化 OpenSpec", result.output());
        }
        return new ProjectStatus(ProjectState.ERROR, projectDirectory.toString(),
                "OpenSpec 状态检测失败", result.output());
    }

    /** 将初始化命令失败归一化为前端可恢复状态。 */
    private ProjectStatus commandFailure(Path projectDirectory,
                                         OpenSpecCliGateway.CommandResult result,
                                         String action) {
        if (!result.started()) {
            return new ProjectStatus(ProjectState.TOOL_UNAVAILABLE, projectDirectory.toString(),
                    "未找到 OpenSpec CLI，请先安装 OpenSpec", result.output());
        }
        if (result.timedOut()) {
            return new ProjectStatus(ProjectState.ERROR, projectDirectory.toString(), action + "超时", result.output());
        }
        if (result.exitCode() != 0) {
            return new ProjectStatus(ProjectState.ERROR, projectDirectory.toString(), action + "失败", result.output());
        }
        return null;
    }

    /** 校验项目目录确实属于当前会话或平台可识别的工作区。 */
    private Path resolveAllowedProject(ProjectRequest request) {
        if (request == null || request.path() == null || request.path().isBlank()) {
            throw new IllegalArgumentException("OpenSpec 项目目录不能为空");
        }
        Path requested = Path.of(request.path()).toAbsolutePath().normalize();
        if (!Files.isDirectory(requested)) {
            throw new IllegalArgumentException("OpenSpec 项目目录不存在: " + requested);
        }
        if (matchesSessionDirectory(request.sessionId(), requested)
                || workspaceScanService.scanModules(requested.toString()).exists()) {
            return requested;
        }
        throw new IllegalArgumentException("OpenSpec 项目目录不在允许范围: " + requested);
    }

    /** 判断目标路径是否与既有 Vibe Coding 会话绑定目录一致。 */
    private boolean matchesSessionDirectory(String sessionId, Path requested) {
        if (sessionId == null || sessionId.isBlank()) {
            return false;
        }
        ClaudeChatSession session = sessionRepository.findById(sessionId).orElse(null);
        if (session == null || session.getCwd() == null || session.getCwd().isBlank()) {
            return false;
        }
        return Path.of(session.getCwd()).toAbsolutePath().normalize().equals(requested);
    }

    /** 将初始化工具限制在 OpenSpec 支持的平台工具白名单内。 */
    private String normalizeTool(String tool) {
        String normalized = tool == null ? "" : tool.trim().toLowerCase(Locale.ROOT);
        if (!"claude".equals(normalized) && !"codex".equals(normalized)) {
            throw new IllegalArgumentException("OpenSpec 初始化工具只支持 claude 或 codex");
        }
        return normalized;
    }

    /**
     * @param path 目标项目绝对路径
     * @param sessionId 可选的当前 Vibe Coding 会话 ID
     * @param tool OpenSpec 要配置的 AI 工具，仅 claude 或 codex
     */
    public record ProjectRequest(String path, String sessionId, String tool) {
    }

    /** OpenSpec 项目检测的封闭状态集合。 */
    public enum ProjectState {
        READY,
        NOT_INITIALIZED,
        TOOL_UNAVAILABLE,
        ERROR
    }

    /**
     * @param state READY、NOT_INITIALIZED、TOOL_UNAVAILABLE 或 ERROR
     * @param path 已规范化的目标项目目录
     * @param message 面向用户的状态说明
     * @param detail CLI 诊断信息
     */
    public record ProjectStatus(ProjectState state, String path, String message, String detail) {
    }
}
