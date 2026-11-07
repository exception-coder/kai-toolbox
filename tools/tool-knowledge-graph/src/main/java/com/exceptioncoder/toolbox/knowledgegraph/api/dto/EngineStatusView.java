package com.exceptioncoder.toolbox.knowledgegraph.api.dto;

/**
 * 知识图谱引擎与两仓的就绪情况：供「依赖声明」标记"是否正常配置/可用"。
 * 独立拓扑引擎按需调用（非常驻服务），故只需检测「已构建(dist/server.js 存在)」，无"启动"态。
 *
 * @param domainConfigured  退役兼容字段，始终 false
 * @param domainRepoExists  退役兼容字段，始终 false
 * @param engineBuilt       旧引擎兼容字段，当前返回 false
 * @param crossConfigured   旧拓扑配置兼容字段，当前返回 false
 * @param crossRepoExists   退役兼容字段，始终 false
 */
public record EngineStatusView(
        boolean domainConfigured,
        boolean domainRepoExists,
        boolean engineBuilt,
        boolean crossConfigured,
        boolean crossRepoExists
) {
}
