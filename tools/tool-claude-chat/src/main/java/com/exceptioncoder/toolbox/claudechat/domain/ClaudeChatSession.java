package com.exceptioncoder.toolbox.claudechat.domain;

import lombok.Builder;
import lombok.Data;

/** Claude 会话元数据，落 SQLite。完整对话不在此持久化（见 schema 注释）。 */
@Data
@Builder
public class ClaudeChatSession {
    private String id;
    private String cwd;
    private String title;
    /** SDK 侧 session_id，resume 续跑用 */
    private String sdkSessionId;
    /** 会话引擎：claude / codex，决定 sidecar 走哪条 agentic loop；旧行为空按 claude */
    private String engine;
    /** 本会话先后用过的引擎有序列（逗号分隔，如 "claude,codex"），切 agent 时追加；空则按 engine */
    private String engines;
    private SessionStatus status;
    private long startedAt;
    private long lastSeenAt;
}
