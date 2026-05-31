package com.exceptioncoder.toolbox.treesize.domain;

/**
 * 视频处理任务类型。每种类型同一时间只允许一个 RUNNING（VideoProcessingJobService 强制）。
 * 各任务的领域逻辑分别由：
 * <ul>
 *   <li>{@link #LANGUAGE_DETECT} — VideoLanguageDetectionService（whisper -dl）</li>
 *   <li>{@link #THUMBNAIL_GRID}  — VideoThumbnailGridService（ffmpeg tile=3x3）</li>
 *   <li>{@link #DURATION_PROBE} — VideoDurationProbeService（ffprobe）</li>
 *   <li>{@link #NAME_GROUPING}  — VideoNameGroupingService（纯正则）</li>
 *   <li>{@link #PERSON_AGE_DETECT} — VideoPersonAgeService（ai-vision MiVOLO）</li>
 *   <li>{@link #VISUAL_EMBED}   — VideoVisualEmbedService（ai-vision DINOv2）</li>
 *   <li>{@link #VISUAL_CLUSTER} — VideoVisualClusterService（ai-vision HDBSCAN）</li>
 * </ul>
 */
public enum ProcessingJobType {
    LANGUAGE_DETECT,
    THUMBNAIL_GRID,
    DURATION_PROBE,
    NAME_GROUPING,
    PERSON_AGE_DETECT,
    VISUAL_EMBED,
    VISUAL_CLUSTER
}
