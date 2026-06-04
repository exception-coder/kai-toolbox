package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * 工作目录扫描结果。每个配置根一个 {@link RootView}；scannedAt 为本次扫描时间（命中缓存则为缓存时间）。
 */
public record WorkspaceListResponse(List<RootView> roots, OffsetDateTime scannedAt) {

    /**
     * @param root   配置的根目录绝对路径
     * @param exists 根目录是否存在且可读
     * @param dirs   该根下的一级子目录（已过滤隐藏前缀、按名称升序）
     */
    public record RootView(String root, boolean exists, List<WorkspaceDirView> dirs) {
    }
}
