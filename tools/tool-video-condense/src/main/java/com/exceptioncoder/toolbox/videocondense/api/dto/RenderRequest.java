package com.exceptioncoder.toolbox.videocondense.api.dto;

import java.util.List;

/**
 * 触发渲染：jobId 须为已 ANALYZED 的作业；segments 为（可能微调过的）曲线；
 * musicPath 可选背景音乐绝对路径，省略=无声输出。
 */
public record RenderRequest(String jobId, List<SegmentView> segments, String musicPath) {}
