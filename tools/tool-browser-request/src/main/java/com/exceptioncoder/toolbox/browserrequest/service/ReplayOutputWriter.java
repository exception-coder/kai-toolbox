package com.exceptioncoder.toolbox.browserrequest.service;

import com.exceptioncoder.toolbox.browserrequest.config.BrowserRequestProperties;
import com.exceptioncoder.toolbox.browserrequest.domain.Task;
import com.exceptioncoder.toolbox.browserrequest.domain.TaskRun;
import com.exceptioncoder.toolbox.browserrequest.domain.enums.TaskRunStatus;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 增量地把一次 task replay 的「最后一步抽取变量」按 JSON 文件落盘归档。
 *
 * 用法：
 * <pre>
 *   Path runDir = writer.beginRun(task, run);            // 创建目录 + 写一份 RUNNING 状态的 _meta.json
 *   // 每次最后一步迭代成功后：
 *   writer.writeIteration(runDir, seq1based, extracted); // 立刻写 0001.json / 0002.json ...
 *   // 整 run 结束（成功 / 失败 / 中断）：
 *   writer.finalizeRun(runDir, task, run, writtenCount, finalStatus, finishedAt, lastStepIterated);
 * </pre>
 *
 * 增量写的好处：1356 次迭代不用全跑完才有数据；中途崩了已经写过的 N 个文件都保住。
 *
 * 目录布局：
 * <pre>
 *   ~/.kai-toolbox/browser-request/replay-outputs/
 *     └── {yyyy-MM-dd_HH-mm-ss}_{taskName}_{runId8}/
 *         ├── _meta.json       - 元信息（finalizeRun 后写最终态）
 *         ├── 0001.json        - 最后一步第 1 次迭代的 extracted dict
 *         └── ...
 * </pre>
 */
@Slf4j
@Component
public class ReplayOutputWriter {

    private static final DateTimeFormatter DIR_TS = DateTimeFormatter
            .ofPattern("yyyy-MM-dd_HH-mm-ss")
            .withZone(ZoneId.systemDefault());

    private final BrowserRequestProperties props;
    private final ObjectMapper mapper;

    public ReplayOutputWriter(BrowserRequestProperties props, ObjectMapper mapper) {
        this.props = props;
        this.mapper = mapper;
    }

    /** 创建本次 run 的输出目录 + 初始 _meta.json（status=RUNNING）。任何异常 swallow，返回 null。 */
    public Path beginRun(Task task, TaskRun run) {
        try {
            Path runDir = resolveOutputBaseDir().resolve(buildDirName(task, run));
            Files.createDirectories(runDir);
            writeMeta(runDir, task, run, 0, "RUNNING", null, false);
            log.info("[ReplayOutputWriter] runId={} 输出目录已创建: {}", run.id(), runDir);
            return runDir;
        } catch (Exception e) {
            log.warn("[ReplayOutputWriter] beginRun 失败 runId={}: {}",
                    run == null ? "?" : run.id(), e.getMessage());
            return null;
        }
    }

    /** 写单条迭代结果。seq1Based ≥ 1，对应文件名 0001.json / 0002.json ...
     *  传入 null 的 runDir 视为 no-op（beginRun 失败时已经放弃归档）。 */
    public void writeIteration(Path runDir, int seq1Based, Map<String, String> extracted) {
        if (runDir == null) return;
        try {
            String fname = String.format("%04d.json", seq1Based);
            Map<String, String> content = extracted == null ? Map.of() : extracted;
            mapper.writerWithDefaultPrettyPrinter()
                    .writeValue(runDir.resolve(fname).toFile(), content);
        } catch (Exception e) {
            log.warn("[ReplayOutputWriter] writeIteration #{} failed: {}", seq1Based, e.getMessage());
        }
    }

    /** 整 run 结束后，用最终态覆盖写 _meta.json。 */
    public void finalizeRun(Path runDir, Task task, TaskRun run, int writtenCount,
                            TaskRunStatus finalStatus, long finishedAt, boolean lastStepIterated) {
        if (runDir == null) return;
        try {
            TaskRun finalRun = run == null ? null : run; // 已经包含 finishedAt 的版本由调用方传 ok
            writeMeta(runDir, task, finalRun, writtenCount,
                    finalStatus == null ? "UNKNOWN" : finalStatus.name(),
                    finishedAt, lastStepIterated);
            log.info("[ReplayOutputWriter] runId={} 归档完成，{} 个输出文件 → {}",
                    run == null ? "?" : run.id(), writtenCount, runDir);
        } catch (Exception e) {
            log.warn("[ReplayOutputWriter] finalizeRun 失败 runId={}: {}",
                    run == null ? "?" : run.id(), e.getMessage());
        }
    }

    private void writeMeta(Path runDir, Task task, TaskRun run,
                           int writtenCount, String statusName,
                           Long finishedAtMs, boolean lastStepIterated) throws Exception {
        Map<String, Object> meta = new LinkedHashMap<>();
        if (task != null) {
            meta.put("taskId", task.id());
            meta.put("taskName", task.name());
            meta.put("sessionId", task.sessionId());
            meta.put("totalSteps", task.steps().size());
            int lastIdx = task.steps().size() - 1;
            meta.put("lastStepName", task.steps().isEmpty() ? null : task.steps().get(lastIdx).name());
        }
        if (run != null) {
            meta.put("runId", run.id());
            meta.put("startedAt", Instant.ofEpochMilli(run.startedAt()).toString());
        }
        meta.put("status", statusName);
        if (finishedAtMs != null) meta.put("finishedAt", Instant.ofEpochMilli(finishedAtMs).toString());
        meta.put("lastStepIterated", lastStepIterated);
        meta.put("outputFileCount", writtenCount);
        mapper.writerWithDefaultPrettyPrinter()
                .writeValue(runDir.resolve("_meta.json").toFile(), meta);
    }

    private Path resolveOutputBaseDir() {
        String configured = props.getDataDir();
        Path base = (configured == null || configured.isBlank())
                ? Paths.get(System.getProperty("user.home"), ".kai-toolbox", "browser-request")
                : Paths.get(configured);
        return base.resolve("replay-outputs");
    }

    /** 目录名：{时间}_{任务名}_{runId 前 8 位}；任务名里 Windows/Linux 都不允许的字符替换成 '_'，CJK 保留 */
    String buildDirName(Task task, TaskRun run) {
        String ts = DIR_TS.format(Instant.ofEpochMilli(run.startedAt()));
        String safeName = sanitize(task.name());
        String runShort = run.id() == null
                ? "noid"
                : run.id().substring(0, Math.min(8, run.id().length()));
        return ts + "_" + safeName + "_" + runShort;
    }

    static String sanitize(String s) {
        if (s == null || s.isBlank()) return "task";
        String cleaned = s.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (cleaned.length() > 80) cleaned = cleaned.substring(0, 80);
        return cleaned.isEmpty() ? "task" : cleaned;
    }
}
