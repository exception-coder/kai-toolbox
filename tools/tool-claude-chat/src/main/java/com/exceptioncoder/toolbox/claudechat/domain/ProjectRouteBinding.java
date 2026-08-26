package com.exceptioncoder.toolbox.claudechat.domain;

import java.util.List;

/**
 * 本机项目知识键与受控源码根的显式绑定。
 *
 * @param id 绑定记录 ID
 * @param projectKey 团队知识项目键
 * @param projectPath 本机受控源码根
 * @param aliases 系统或项目别名
 * @param createTime 创建时间戳
 * @param updateTime 更新时间戳
 */
public record ProjectRouteBinding(
        String id,
        String projectKey,
        String projectPath,
        List<String> aliases,
        long createTime,
        long updateTime
) {
    public ProjectRouteBinding {
        aliases = List.copyOf(aliases);
    }
}
