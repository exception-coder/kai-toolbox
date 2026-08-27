package com.exceptioncoder.toolbox.common.projectevidence;

/** 平台级项目、模块与 URL 路由端口。 */
public interface ProjectRouteContextResolver {

    /**
     * 将咨询输入解析为受控源码与知识范围。
     *
     * @param request 项目路由请求
     * @return 受控项目路由上下文
     */
    ProjectRouteContext resolve(ProjectRouteRequest request);
}
