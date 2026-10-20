package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.git.GitPullOperations;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

/** 源码探索前由服务端按已授权项目同步；同一规范目录五分钟内复用检查结果。 */
@Service
public class ConsultSourceSyncService {
    private static final long CHECK_INTERVAL_MILLIS = Duration.ofMinutes(5).toMillis();
    private final ConsultSourceRoutingService routing;
    private final ObjectProvider<GitPullOperations> git;
    private final ConcurrentHashMap<Path, Check> checks = new ConcurrentHashMap<>();

    public ConsultSourceSyncService(ConsultSourceRoutingService routing, ObjectProvider<GitPullOperations> git) {
        this.routing = routing;
        this.git = git;
    }

    /** 返回的提交仅代表检查时版本；初始化索引不在这里自动重建。 */
    public record Result(String status, String message, String branch, String headAtCheck, long checkedAt) { }

    public Result synchronize(String runtimeId, String project) {
        // 每次先重验会话范围和排除策略，不因缓存命中扩大权限。
        Path root = routing.rootForRuntime(runtimeId, project);
        Check check = checks.computeIfAbsent(root, ignored -> new Check());
        synchronized (check) {
            if (check.running) {
                return result("SYNCING", "该项目正在同步，请稍后再读取源码", null, null);
            }
            if (check.result != null && System.currentTimeMillis() - check.result.checkedAt() < CHECK_INTERVAL_MILLIS) {
                return check.result;
            }
            check.running = true;
        }
        Result outcome;
        try {
            outcome = synchronize(root, runtimeId, project);
        } catch (RuntimeException error) {
            // Git错误可能带远端凭据，绝不把原异常直接返回模型。
            String message = error.getMessage() == null ? "" : error.getMessage();
            if (message.startsWith("该仓库正在检查、拉取或推送")) {
                outcome = result("SYNCING", "项目Git操作正在进行，请稍后再读取源码", null, null);
            } else if (message.startsWith("存在未提交或未跟踪文件")) {
                outcome = result("LOCAL_CHANGES", "存在未提交或未跟踪文件，未自动拉取或暂存；保留本地源码，不代表远端最新版本", null, null);
            } else {
                outcome = result("UNVERIFIED", "源码同步未完成，请在项目Git操作中核对网络、凭据及本地状态；使用本地源码，不代表远端最新版本", null, null);
            }
        }
        synchronized (check) {
            check.result = "SYNCING".equals(outcome.status()) ? null : outcome;
            check.running = false;
        }
        return outcome;
    }

    private Result synchronize(Path root, String runtimeId, String project) {
        if (!Files.exists(root.resolve(".git"))) {
            return result("LOCAL_ONLY", "此目录不是Git仓库根目录，保留本地源码，不向父仓库拉取", null, null);
        }
        var operations = git.getIfAvailable();
        if (operations == null) {
            return result("UNVERIFIED", "Git同步服务未装配，使用本地源码", null, null);
        }
        var preview = operations.prepare(root);
        if (preview.ahead() == null || preview.behind() == null) {
            return result("UNVERIFIED", "无法核实本地与上游差异，未更新源码", preview.branch(), preview.head());
        }
        if (preview.ahead() > 0) {
            return result("LOCAL_CHANGES", "本地存在未推送提交或与远端分叉，未自动更新；保留本地源码", preview.branch(), preview.head());
        }
        if (preview.behind() == 0) {
            return result("UP_TO_DATE", "检查时本地与当前分支上游一致", preview.branch(), preview.head());
        }
        if (preview.pullBlockedReason() != null && !preview.pullBlockedReason().isBlank()) {
            return result("BLOCKED", "当前仓库不满足安全快进条件，保留本地源码；请在项目Git操作中核对", preview.branch(), preview.head());
        }
        if (!root.equals(routing.rootForRuntime(runtimeId, project))) {
            throw new IllegalArgumentException("同步期间项目目录已变化，未快进");
        }
        operations.pull(root, preview.token());
        return result("UPDATED", "已安全快进到检查时的上游版本；Graphify与初始化资料可能过期，必须核对当前源码", preview.branch(), preview.upstreamHead());
    }

    private Result result(String status, String message, String branch, String head) {
        return new Result(status, message, branch, head, System.currentTimeMillis());
    }

    private static final class Check {
        private boolean running;
        private Result result;
    }
}
