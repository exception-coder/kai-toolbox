package com.exceptioncoder.toolbox.ffmpeglab.api.dto;

import com.exceptioncoder.toolbox.ffmpeglab.domain.RunResult;

import java.util.List;

/**
 * /runs/recent 响应：当前活跃 ffmpeg 进程数 + 最近运行诊断。
 */
public record RecentRunsView(
        int activeFfmpegCount,
        List<RunItem> runs
) {
    /**
     * 诊断表单条目（比 RunResultView 少 playUrl/playKind，轮询用）。
     */
    public record RunItem(
            String runId,
            String mode,
            boolean success,
            int exitCode,
            Long firstByteMs,
            Long totalMs,
            long outputBytes,
            List<String> stderrTail,
            long timestamp
    ) {
        public static RunItem from(RunResult r) {
            return new RunItem(r.runId(), r.mode().name(), r.success(), r.exitCode(),
                    r.firstByteMs(), r.totalMs(), r.outputBytes(), r.stderrTail(), r.timestamp());
        }
    }
}
