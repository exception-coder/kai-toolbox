package com.exceptioncoder.toolbox.treesize.domain;

/**
 * 一条视频分享凭证。
 *
 * <p>与登录 token 的区别是这条记录本身就是授权范围：它只指向一个视频（scanId + path），
 * 只允许只读播放，且可以在不影响其它分享的前提下单独撤销。
 */
public record VideoShare(
        String token,
        String scanId,
        String path,
        String name,
        long size,
        long createdAt,
        long expiresAt,
        boolean revoked,
        long hitCount,
        Long lastAccessAt) {

    /** 失效 = 已撤销或已过期。两者对调用方是同一件事：链接打不开。 */
    public boolean isInvalidAt(long now) {
        return revoked || now >= expiresAt;
    }
}
