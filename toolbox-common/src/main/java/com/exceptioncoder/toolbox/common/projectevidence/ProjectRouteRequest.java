package com.exceptioncoder.toolbox.common.projectevidence;

/**
 * 平台级项目路由请求。
 *
 * @param project 项目名、系统名、projectKey、别名或受控项目路径
 * @param module 模块 key 或名称，可为空
 * @param url 页面 URL 或路由，可为空
 */
public record ProjectRouteRequest(String project, String module, String url) {
}
