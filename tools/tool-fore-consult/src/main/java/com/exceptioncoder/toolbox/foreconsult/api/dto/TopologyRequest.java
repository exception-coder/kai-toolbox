package com.exceptioncoder.toolbox.foreconsult.api.dto;

import java.util.List;

/**
 * 系统链路分析请求：给定当前星图上可见的系统名清单，让引擎查 cross-topology 图谱找它们之间的关系。
 *
 * @param systems 参与分析的系统原名（身份键）列表
 */
public record TopologyRequest(
        List<String> systems
) {
}
