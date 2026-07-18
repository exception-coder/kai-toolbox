package com.exceptioncoder.toolbox.knowledgegraph.model;

/** 集中式知识库有两个：业务真理仓库、跨项目拓扑仓库；两者复用同一套 bootstrap.mjs 引擎，只是仓库路径不同。 */
public enum GraphRepo {
    DOMAIN_KNOWLEDGE,
    CROSS_TOPOLOGY
}
