package com.exceptioncoder.toolbox.llm.observability;

/**
 * Optional lifecycle SPI for business modules that must bind an Agent trace to their
 * own durable identity. Implementations must be fast and idempotent; failures are
 * isolated from the chat result path.
 */
public interface AgentRunCompletionListener {

    void completed(String runtimeSessionId, AgentRunMetadata metadata, String traceId, long completedAt);
}
