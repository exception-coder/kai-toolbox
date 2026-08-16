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
    /** 会话引擎：claude / codex / antigravity / opencode；旧 gemini 行启动时迁移，空值按 claude。 */
    private String engine;
    /** 本会话先后用过的引擎有序列（逗号分隔，如 "claude,codex"），切 agent 时追加；空则按 engine */
    private String engines;
    /** 各引擎各自的 SDK 会话句柄映射 JSON（如 {"claude":"sid-A","codex":"sid-B"}），切 agent 持久化用 */
    private String engineSessions;
    /** 第三方 Anthropic 兼容网关 baseURL；空=走官方。仅 Claude 引擎用。 */
    private String apiBaseUrl;
    /** 第三方网关鉴权 token（ANTHROPIC_AUTH_TOKEN）；本地明文存。 */
    private String authToken;
    /** Codex 官方登录配置根目录；空值使用默认 ~/.codex。 */
    private String codexHome;
    /** 本会话选择的模型；空值表示使用引擎默认模型。 */
    private String selectedModel;
    /** Codex 推理强度；空值表示使用 SDK 默认值。 */
    private String codexReasoningEffort;
    /** Codex 速度档位：default / fast。 */
    private String codexSpeed;
    /** 服务端执行能力边界：standard / consult-readonly。 */
    private String executionPolicy;
    /** 咨询会话允许的证据系统 JSON 数组，仅包含 erp/srm/scm。 */
    private String consultEvidenceSystems;
    /** 会话所属分组名（用户自定义，如 "toolbox"）；空=未分组。后端持久化，跨端可见。 */
    private String groupName;
    /** 二级需求分组；一级 groupName 通常表示系统/项目。 */
    private String subgroupName;
    /** 是否为用户重点收藏会话。 */
    private boolean favorite;
    private SessionStatus status;
    private long startedAt;
    private long lastSeenAt;
}
