package com.exceptioncoder.toolbox.treesize.domain;

/**
 * 视频处理任务状态机：
 * <pre>
 *   RUNNING ──┬── 全部处理完 ──> DONE
 *             ├── 用户取消 ───> CANCELLED
 *             └── 致命错误 ───> FAILED（如 Whisper/ffmpeg 二进制不存在）
 * </pre>
 * 启动时遗留的 RUNNING 行（应用上次崩溃留下）会被 ProcessingJobRepository.cleanupStaleRunning()
 * 一次性回填为 FAILED。
 */
public enum ProcessingJobStatus {
    RUNNING,
    DONE,
    FAILED,
    CANCELLED
}
