package com.exceptioncoder.toolbox.knowledgegraph.service.impl;

import com.exceptioncoder.toolbox.knowledgegraph.model.GraphifyGraphState;
import com.exceptioncoder.toolbox.knowledgegraph.model.GraphifyProjectStatus;
import com.exceptioncoder.toolbox.knowledgegraph.service.GraphifyProjectStatusService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

@Slf4j
@Service
public class GraphifyProjectStatusServiceImpl implements GraphifyProjectStatusService {

    @Override
    public GraphifyProjectStatus detectStatus(String projectRootPath) {
        if (projectRootPath == null || projectRootPath.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请提供项目根路径");
        }
        Path root = Path.of(projectRootPath);
        if (!Files.isDirectory(root)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "项目目录不存在：" + projectRootPath);
        }

        Instant now = Instant.now();
        Path outDir = root.resolve("graphify-out");
        if (!Files.isDirectory(outDir)) {
            return new GraphifyProjectStatus(GraphifyGraphState.NOT_GENERATED, null, null, now);
        }

        Instant graphGeneratedAt = latestMtime(outDir);
        Instant latestCommitAt = latestCommitTime(root);

        GraphifyGraphState state;
        if (latestCommitAt == null) {
            // 非 git 仓库或 git 命令不可用：无法判断新鲜度，不强行判过时
            state = GraphifyGraphState.UP_TO_DATE;
        } else if (graphGeneratedAt == null || graphGeneratedAt.isBefore(latestCommitAt)) {
            state = GraphifyGraphState.STALE;
        } else {
            state = GraphifyGraphState.UP_TO_DATE;
        }
        return new GraphifyProjectStatus(state, graphGeneratedAt, latestCommitAt, now);
    }

    /** 遍历 graphify-out/ 下所有文件，取最新 mtime；目录为空时返回 null。 */
    private Instant latestMtime(Path dir) {
        try (Stream<Path> files = Files.walk(dir)) {
            return files.filter(Files::isRegularFile)
                    .map(p -> {
                        try {
                            return Files.getLastModifiedTime(p).toInstant();
                        } catch (IOException e) {
                            return null;
                        }
                    })
                    .filter(java.util.Objects::nonNull)
                    .max(Instant::compareTo)
                    .orElse(null);
        } catch (IOException e) {
            log.warn("扫描 graphify-out 失败：{}", e.getMessage());
            return null;
        }
    }

    /** 目标项目自身的最新 git commit 时间；非 git 仓库、git 未安装或命令失败均返回 null。 */
    private Instant latestCommitTime(Path projectRoot) {
        try {
            Process p = new ProcessBuilder("git", "-C", projectRoot.toString(), "log", "-1", "--format=%ct")
                    .redirectErrorStream(true)
                    .start();
            String out;
            try (var in = p.getInputStream()) {
                out = new String(in.readAllBytes()).trim();
            }
            boolean finished = p.waitFor(5, TimeUnit.SECONDS);
            if (!finished) {
                p.destroyForcibly();
                return null;
            }
            if (p.exitValue() != 0 || out.isEmpty()) {
                return null;
            }
            long epochSeconds = Long.parseLong(out);
            return Instant.ofEpochSecond(epochSeconds);
        } catch (IOException | InterruptedException | NumberFormatException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.debug("git log 检测失败（视为非 git 仓库或 git 不可用）：{}", e.getMessage());
            return null;
        }
    }
}
