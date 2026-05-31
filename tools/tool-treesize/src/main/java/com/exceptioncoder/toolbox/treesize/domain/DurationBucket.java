package com.exceptioncoder.toolbox.treesize.domain;

/**
 * 视频时长区间分类。由"视频时长区间分类"模块根据 ffprobe 的 duration_s 算出，
 * 写入 {@code treesize_video.duration_bucket}。前端可按此字段做筛选。
 *
 * <p>切分依据是消费场景而非精确数学等距：30s 卡 GIF / 短视频边界，5min 卡剧集片段 /
 * 单集教程边界，30min 卡半小时番剧 / 1 集剧集边界，90min 卡完整电影边界。
 *
 * <p>{@link #UNKNOWN} 不参与 {@link #fromSeconds} 推断，仅供 Service 在 ffprobe 失败 /
 * 文件缺失 / duration<=0 时显式写入，让前端区分"未探测"与"已探测但无人物/不可读"。
 */
public enum DurationBucket {
    MICRO("micro"),     // < 30s
    SHORT("short"),     // 30s ~ 5min
    MEDIUM("medium"),   // 5min ~ 30min
    LONG("long"),       // 30min ~ 90min
    XLONG("xlong"),     // > 90min
    UNKNOWN("unknown");

    private final String label;

    DurationBucket(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    public static DurationBucket fromSeconds(double s) {
        if (s < 30)   return MICRO;
        if (s < 300)  return SHORT;
        if (s < 1800) return MEDIUM;
        if (s < 5400) return LONG;
        return XLONG;
    }
}
