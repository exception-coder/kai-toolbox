package com.exceptioncoder.toolbox.common.projectevidence;

import java.util.List;

/**
 * 项目路由解析后的模块代码坐标。
 *
 * @param key modules.json 中的稳定模块 key
 * @param name 模块显示名
 * @param codePath 后端或主代码目录绝对路径
 * @param webPaths 前端代码目录绝对路径集合
 * @param summary 模块业务摘要
 * @param source 坐标来源，DOMAIN_KNOWLEDGE 或 BUILD_SCAN
 */
public record ProjectRouteModule(
        String key,
        String name,
        String codePath,
        List<String> webPaths,
        String summary,
        String source
) {
    public ProjectRouteModule {
        webPaths = List.copyOf(webPaths);
    }
}
