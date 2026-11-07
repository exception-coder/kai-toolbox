package com.exceptioncoder.toolbox.foreconsult.api.dto;

import java.util.List;

/**
 * 旧系统链路分析请求的兼容载体，当前接口返回退役状态。
 *
 * @param systems 参与分析的系统原名（身份键）列表
 * @param engine  执行引擎，仅支持 claude 或 codex；空值兼容旧客户端并使用 claude
 */
public record TopologyRequest(
        List<String> systems,
        String engine
) {
}
