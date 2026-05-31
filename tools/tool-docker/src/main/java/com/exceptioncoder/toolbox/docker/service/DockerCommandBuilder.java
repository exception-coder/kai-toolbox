package com.exceptioncoder.toolbox.docker.service;

import com.exceptioncoder.toolbox.docker.domain.ComposeAction;
import com.exceptioncoder.toolbox.docker.domain.ComposeOptions;
import com.exceptioncoder.toolbox.hosts.service.HostSshExec;
import com.jcraft.jsch.Session;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * 远端 docker / docker compose 命令拼装。
 * 所有用户输入一律走 {@link HostSshExec#singleQuote(String)} 转义，禁字符串插值。
 */
@Component
public class DockerCommandBuilder {

    private static final Logger log = LoggerFactory.getLogger(DockerCommandBuilder.class);

    private final ConcurrentMap<String, String> composeBinCache = new ConcurrentHashMap<>();

    /** 探测 host 上可用的 compose 命令：优先 `docker compose`，回退 `docker-compose`；缓存到 hostId。 */
    public String composeBin(String hostId, Session session) {
        return composeBinCache.computeIfAbsent(hostId, k -> probe(session));
    }

    private String probe(Session session) {
        try {
            HostSshExec.Result r = HostSshExec.run(session, "docker compose version >/dev/null 2>&1 && echo v2 || echo v1");
            String trimmed = r.stdout().trim();
            if ("v2".equals(trimmed)) return "docker compose";
            return "docker-compose";
        } catch (Exception e) {
            log.warn("compose 探测失败，回退 'docker compose': {}", e.getMessage());
            return "docker compose";
        }
    }

    /** docker ps 列表（带 compose label 与 working_dir 解析所需字段）。 */
    public String dockerPs(boolean includeStopped) {
        // 用 {{json .}} 输出每行一个 JSON 对象，便于解析
        return includeStopped
                ? "docker ps -a --no-trunc --format '{{json .}}'"
                : "docker ps --no-trunc --format '{{json .}}'";
    }

    public String dockerInspectLabels(String containerId) {
        // 单独取 labels 避免 ps 行 Labels 字段在不同 docker 版本格式差异
        return "docker inspect --format '{{json .Config.Labels}}' " + HostSshExec.singleQuote(containerId);
    }

    public String dockerLogs(String cid, int tail, String since, boolean timestamps, boolean follow) {
        StringBuilder sb = new StringBuilder("docker logs");
        if (follow) sb.append(" -f");
        if (timestamps) sb.append(" --timestamps");
        if (tail > 0) sb.append(" --tail ").append(tail);
        if (since != null && !since.isBlank()) {
            sb.append(" --since ").append(HostSshExec.singleQuote(since));
        }
        sb.append(' ').append(HostSshExec.singleQuote(cid));
        sb.append(" 2>&1"); // 合并 stderr，否则 docker logs 把容器原 stderr 写到 stderr 流
        return sb.toString();
    }

    public String dockerStats() {
        return "docker stats --no-stream --format '{{json .}}'";
    }

    public String containerAction(String cliVerb, String containerId) {
        return "docker " + cliVerb + " " + HostSshExec.singleQuote(containerId);
    }

    public String compose(String composeBin, String baseDir, String composeFile,
                          ComposeAction action, ComposeOptions opts) {
        StringBuilder sb = new StringBuilder("cd ")
                .append(HostSshExec.singleQuote(baseDir))
                .append(" && ").append(composeBin)
                .append(" -f ").append(HostSshExec.singleQuote(composeFile))
                .append(' ').append(action.cli());
        switch (action) {
            case UP -> {
                if (opts.detach()) sb.append(" -d");
                if (opts.removeOrphans()) sb.append(" --remove-orphans");
                if (opts.pullPolicy() != null && !opts.pullPolicy().isBlank()) {
                    sb.append(" --pull ").append(HostSshExec.singleQuote(opts.pullPolicy()));
                }
            }
            case DOWN -> {
                if (opts.removeOrphans()) sb.append(" --remove-orphans");
            }
            case RESTART, PULL -> { /* 无额外选项 */ }
        }
        sb.append(" 2>&1");
        return sb.toString();
    }

    public String composeConfigCheck(String composeBin, String baseDir, String composeFile) {
        return "cd " + HostSshExec.singleQuote(baseDir)
                + " && " + composeBin
                + " -f " + HostSshExec.singleQuote(composeFile)
                + " config -q 2>&1";
    }

    public String find(String baseDir, int maxDepth) {
        return "find " + HostSshExec.singleQuote(baseDir)
                + " -maxdepth " + maxDepth
                + " -type f \\( -name 'docker-compose.yml' -o -name 'docker-compose.yaml'"
                + " -o -name 'compose.yml' -o -name 'compose.yaml' \\)"
                + " -printf '%h\\t%f\\n' 2>/dev/null";
    }

    public String realpath(String path) {
        return "readlink -f -- " + HostSshExec.singleQuote(path);
    }

    /**
     * 列 baseDir 一层下白名单后缀的配置文件，输出格式：path\tsize\tmtime(epoch)\n
     * 不递归，避免误把巨大的 data/volumes 目录文件列出来。
     */
    public String listConfigFiles(String baseDir) {
        // 注意：用 -printf 输出，文件名中含 tab/换行的极端情况不在第一版考虑
        return "find " + HostSshExec.singleQuote(baseDir)
                + " -maxdepth 1 -type f"
                + " \\( -name 'docker-compose.y*ml' -o -name 'compose.y*ml'"
                + " -o -iname '*.env' -o -name '.env*'"
                + " -o -name '*.conf' -o -name '*.yml' -o -name '*.yaml' -o -name '*.json' \\)"
                + " -printf '%p\\t%s\\t%T@\\n' 2>/dev/null";
    }

    public String fileStat(String path) {
        // %s = size, %Y = mtime (epoch sec)
        return "stat -c '%s\\t%Y' -- " + HostSshExec.singleQuote(path);
    }

    public String catFile(String path) {
        return "cat -- " + HostSshExec.singleQuote(path);
    }

    /** 清空缓存 hook（host 删除时可调，但当前不强耦合）。 */
    public void evictComposeBin(String hostId) {
        composeBinCache.remove(hostId);
    }
}
