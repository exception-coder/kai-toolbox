package com.exceptioncoder.toolbox.treesize.api.dto;

import java.util.List;

/**
 * POST /api/treesize/videos/merge 入参。
 *
 * <ul>
 *   <li>{@code paths} —— 待合并视频的绝对路径，<b>按数组顺序</b>拼接（= 前端列表显示顺序）</li>
 *   <li>{@code reencode} —— 合并策略：{@code auto}（默认，探测后能 copy 就 copy，否则重编码）
 *       / {@code copy}（强制 concat demuxer 零重编码）/ {@code force}（强制重编码统一编码）</li>
 * </ul>
 */
public record VideoMergeRequest(List<String> paths, String reencode) {
    /** 缺省策略 auto。 */
    public String reencodeOrAuto() {
        return reencode == null || reencode.isBlank() ? "auto" : reencode.trim().toLowerCase();
    }
}
