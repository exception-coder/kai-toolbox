package com.exceptioncoder.toolbox.llm.observability;

import java.util.Optional;

/**
 * 业务模块按运行时会话 ID 提供 Trace 属性的可选 SPI，避免通用聊天模块反向依赖业务咨询。
 */
public interface AgentRunMetadataProvider {

    Optional<AgentRunMetadata> resolve(String runtimeSessionId);
}
