package com.exceptioncoder.toolbox.llm.spi;

import java.util.List;
import java.util.Optional;

/** 业务模块按持久会话提供可信工具装配；运行引擎仍须与安全策略取交集。 */
public interface AgentToolAssemblyProvider {
    /** @param runtimeSessionId 底层运行会话 ID @return 已冻结的配置，无绑定时为空 */
    Optional<Assembly> resolve(String runtimeSessionId);
    /** 仅使用本轮原始用户文字判断站点，不能把历史拼接或附件提示用作目标。 */
    default Optional<Assembly> resolve(String runtimeSessionId, String userText) {
        return resolve(runtimeSessionId);
    }
    /** 已核实的公开网页续点候选独立于本轮原文，只用于判断该次导航能否交给公开浏览器。 */
    default Optional<Assembly> resolve(String runtimeSessionId, String userText, String browserFollowUpTarget) {
        return resolve(runtimeSessionId, userText);
    }

    /** MCP 及工具均为已登记的逻辑名称，不携带命令、路径或凭据。 */
    record Assembly(List<String> tools, List<String> mcpServers, String instructions, String runtimeToken,
                    boolean managedWebAccount, boolean publicBrowserFollowUp) {
        public Assembly(List<String> tools, List<String> mcpServers, String instructions, String runtimeToken,
                        boolean managedWebAccount) {
            this(tools, mcpServers, instructions, runtimeToken, managedWebAccount, false);
        }
        public Assembly(List<String> tools, List<String> mcpServers, String instructions, String runtimeToken) {
            this(tools, mcpServers, instructions, runtimeToken, false);
        }
        public Assembly(List<String> tools, List<String> mcpServers, String instructions) {
            this(tools, mcpServers, instructions, null);
        }
    }
}
