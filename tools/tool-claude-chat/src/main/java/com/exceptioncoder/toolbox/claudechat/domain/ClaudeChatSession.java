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
    private SessionStatus status;
    private long startedAt;
    private long lastSeenAt;
}
