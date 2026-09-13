package com.exceptioncoder.toolbox.llm.spi;

import java.util.List;
import java.util.Optional;

/** 业务模块按持久会话提供可信工具装配；运行引擎仍须与安全策略取交集。 */
public interface AgentToolAssemblyProvider {
    /** @param runtimeSessionId 底层运行会话 ID @return 已冻结的配置，无绑定时为空 */
    Optional<Assembly> resolve(String runtimeSessionId);

    /** MCP 及工具均为已登记的逻辑名称，不携带命令、路径或凭据。 */
    record Assembly(List<String> tools, List<String> mcpServers, String instructions) { }
}
