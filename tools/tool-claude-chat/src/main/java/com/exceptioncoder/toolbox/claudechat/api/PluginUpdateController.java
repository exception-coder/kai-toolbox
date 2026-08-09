package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.PluginStatusView;
import com.exceptioncoder.toolbox.claudechat.api.dto.SuiteStatusView;
import com.exceptioncoder.toolbox.claudechat.api.dto.SkillSyncResultView;
import com.exceptioncoder.toolbox.claudechat.api.dto.TeamDependencyEnvironmentView;
import com.exceptioncoder.toolbox.claudechat.api.dto.TeamRepositoryStatusView;
import com.exceptioncoder.toolbox.claudechat.service.PluginUpdateService;
import com.exceptioncoder.toolbox.common.git.GitFileDiffResponse;
import com.exceptioncoder.toolbox.common.git.GitStatusResponse;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.UUID;

/**
 * team-standards 插件双端版本检测 + 一键更新。
 * 更新走 SSE GET（EventSource 只能 GET）:create 并返回 emitter 后再启 worker,实时回显双端 4 条命令。
 */
@RestController
@RequestMapping("/api/claude-chat/plugins")
public class PluginUpdateController {

    private final PluginUpdateService service;
    private final SseEmitterRegistry sse;

    public PluginUpdateController(PluginUpdateService service, SseEmitterRegistry sse) {
        this.service = service;
        this.sse = sse;
    }

    /** 查 team-standards 在 Claude/Codex 两端版本。 */
    @GetMapping("/status")
    public PluginStatusView status() {
        return service.readStatus();
    }

    /**
     * 列团队套件状态（3 插件 + 2 MCP）：插件带版本，MCP 带知识库 git 状态。
     * fetch=true 时先对 MCP 知识库仓 git fetch，使「落后远端」数准确（较慢，按需调用）。
     */
    @GetMapping("/suites")
    public List<SuiteStatusView> suites(
            @RequestParam(required = false) String sessionId,
            @RequestParam(defaultValue = "false") boolean fetch) {
        return service.readSuites(sessionId, fetch);
    }

    /** 检查 Git、Node.js/npm、Claude Code、Codex，并返回当前系统的官方安装指引。 */
    @GetMapping("/environment")
    public TeamDependencyEnvironmentView environment(@RequestParam(required = false) String sessionId) {
        return service.readEnvironment(sessionId);
    }

    /** 查看五个团队依赖仓库状态；fetch=true 时先刷新所选远端。 */
    @GetMapping("/repositories")
    public List<TeamRepositoryStatusView> repositories(
            @RequestParam(defaultValue = "gitee") String source,
            @RequestParam(defaultValue = "false") boolean fetch) {
        return service.readRepositoryStatuses(source, fetch);
    }

    /** 查看指定固定团队依赖仓库的未提交文件。 */
    @GetMapping("/repositories/{repository}/status")
    public GitStatusResponse repositoryStatus(@PathVariable String repository) {
        return service.readRepositoryChanges(repository);
    }

    /** 查看指定固定团队依赖仓库中单个文件相对 HEAD 的差异。 */
    @GetMapping("/repositories/{repository}/diff")
    public GitFileDiffResponse repositoryFileDiff(
            @PathVariable String repository,
            @RequestParam String filePath,
            @RequestParam(required = false, defaultValue = " ") String x) {
        return service.readRepositoryFileDiff(repository, filePath, x);
    }

    /** 将团队源码中的 yoooni-erp-auto-dev 同步到 Claude/Codex 当前插件缓存。 */
    @PostMapping("/skills/yoooni-erp-auto-dev/sync")
    public SkillSyncResultView syncYoooniErpAutoDev() {
        return service.syncYoooniErpAutoDev();
    }

    /** 校验并提交五个团队仓库的有效本地更新，后台推送至所选 Git 源。 */
    @GetMapping(value = "/repositories/push/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter pushRepositories(@RequestParam(defaultValue = "gitee") String source) {
        String taskId = UUID.randomUUID().toString();
        SseEmitter emitter = sse.create(taskId);
        service.startPushRepositories(taskId, source);
        return emitter;
    }

    /** 触发双端更新并以 SSE 实时回显输出。先 create+返回 emitter(挂 HTTP),再启 worker。 */
    @GetMapping(value = "/update/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter updateStream(@RequestParam(required = false) String sessionId,
                                   @RequestParam(defaultValue = "gitee") String source) {
        String taskId = UUID.randomUUID().toString();
        SseEmitter emitter = sse.create(taskId);
        service.startUpdate(taskId, sessionId, source);
        return emitter;
    }

    /** 拉取五个团队依赖仓库，并安装到 Claude Code 与 Codex。 */
    @GetMapping(value = "/install/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter installStream(@RequestParam(required = false) String sessionId,
                                    @RequestParam(defaultValue = "gitee") String source) {
        String taskId = UUID.randomUUID().toString();
        SseEmitter emitter = sse.create(taskId);
        service.startInstall(taskId, sessionId, source);
        return emitter;
    }
}
