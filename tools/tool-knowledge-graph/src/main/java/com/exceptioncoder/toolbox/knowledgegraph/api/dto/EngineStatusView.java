package com.exceptioncoder.toolbox.knowledgegraph.api.dto;

/**
 * 知识图谱引擎与两仓的就绪情况：供「依赖声明」标记"是否正常配置/可用"。
 * 独立拓扑引擎按需调用（非常驻服务），故只需检测「已构建(dist/server.js 存在)」，无"启动"态。
 *
 * @param domainConfigured  退役兼容字段，始终 false
 * @param domainRepoExists  退役兼容字段，始终 false
 * @param engineBuilt       独立拓扑引擎是否已构建（cross-project-topology/dist/server.js 存在）
 * @param crossConfigured   固定 cross-topology 路径是否可计算（兼容字段，通常为 true）
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
