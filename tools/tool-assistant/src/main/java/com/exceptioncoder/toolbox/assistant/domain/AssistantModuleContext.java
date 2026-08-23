package com.exceptioncoder.toolbox.assistant.domain;

/**
 * 当前用户在一个来源系统模块上的可复用探索摘要。
 *
 * @param id 缓存记录标识
 * @param creatorUserId Forge 认证用户标识
 * @param appId 来源应用标识
 * @param moduleKey 稳定模块标识
 * @param route 最近一次写入时的页面路由
 * @param sourceRevision 宿主发布或上下文结构版本
 * @param summary 有界历史探索摘要
 * @param expiresAt 摘要失效时间
 * @param createTime 首次创建时间
 * @param updateTime 最后更新时间
 */
public record AssistantModuleContext(
        String id,
        long creatorUserId,
        String appId,
        String moduleKey,
        String route,
        String sourceRevision,
        String summary,
        long expiresAt,
        long createTime,
        long updateTime) {
}
