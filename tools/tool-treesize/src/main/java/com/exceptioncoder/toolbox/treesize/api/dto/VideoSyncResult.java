package com.exceptioncoder.toolbox.treesize.api.dto;

/**
 * POST /api/treesize/videos/sync 出参。
 * <ul>
 *   <li>{@code scannedFromNode} = treesize_node 中通过 ext + size>=30KB 过滤后扫描到的视频节点数</li>
 *   <li>{@code insertedNew} = 本次新插入到 treesize_video 的行数</li>
 *   <li>{@code skippedExisting} = path 已存在被 INSERT OR IGNORE 跳过的行数；
 *       恒等式 {@code scannedFromNode = insertedNew + skippedExisting}</li>
 *   <li>{@code skippedTooSmall} = 单独 COUNT 查询拿到的"小于 30KB 被过滤"数；
 *       让用户感知噪音规模，不参与去重</li>
 *   <li>{@code elapsedMs} = 同步耗时，毫秒</li>
 * </ul>
 */
public record VideoSyncResult(
        long scannedFromNode,
        long insertedNew,
        long skippedExisting,
        long skippedTooSmall,
        long elapsedMs
) {}
