package com.exceptioncoder.toolbox.knowledgegraph.api.dto;

/**
 * 知识图谱引擎与两仓的就绪情况：供「依赖声明」标记"是否正常配置/可用"。
 * 引擎按需以 node 跑 bootstrap.mjs（非常驻服务），故只需检测「已构建(dist/server.js 存在)」，无"启动"态。
 *
 * @param domainConfigured  domain-knowledge-repo-path 是否已配置（非空）
 * @param domainRepoExists  该仓目录是否存在
 * @param engineBuilt       引擎是否已构建（{@code <domain>/dist/server.js} 存在）；业务真理与跨项目拓扑检测都依赖它
 * @param crossConfigured   cross-topology-repo-path 是否已配置（非空）
 * @param crossRepoExists   该仓目录是否存在
 */
public record EngineStatusView(
        boolean domainConfigured,
        boolean domainRepoExists,
        boolean engineBuilt,
        boolean crossConfigured,
        boolean crossRepoExists
) {
}
