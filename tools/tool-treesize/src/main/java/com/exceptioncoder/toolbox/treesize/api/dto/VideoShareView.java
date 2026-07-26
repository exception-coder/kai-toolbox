package com.exceptioncoder.toolbox.treesize.api.dto;

import com.exceptioncoder.toolbox.treesize.domain.VideoShare;

/**
 * 分享记录的管理视图（给签发者自己看，所以带完整路径）。
 * 匿名落地页用的是 {@code VideoShareController.SharedVideoView}，那个不含路径。
 */
public record VideoShareView(
        String token,
        String scanId,
        String path,
        String name,
        long size,
        long createdAt,
        long expiresAt,
        boolean revoked,
        boolean expired,
        long hitCount,
        Long lastAccessAt) {

    public static VideoShareView from(VideoShare s) {
        return new VideoShareView(
                s.token(), s.scanId(), s.path(), s.name(), s.size(),
                s.createdAt(), s.expiresAt(), s.revoked(),
                System.currentTimeMillis() >= s.expiresAt(),
                s.hitCount(), s.lastAccessAt());
    }
}
