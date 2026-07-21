package com.exceptioncoder.toolbox.foreconsult.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 业务系统咨询会话：对应 consult_session 表的一行。
 * moduleNames / rawReferenceJson 在 Java 层以 JSON 字符串形式存储，由上层按需解析。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConsultSession {

    private String sessionId;
    private String userId;
    private String systemName;
    private String systemSourcePath;
    /** 所选模块名列表，JSON 数组字符串，如 {@code ["采购","退货"]}，可为 null。 */
    private String moduleNames;
    /** 变量替换后的约束提示词快照，可追溯，可为 null。 */
    private String promptSnapshot;
    /** 关联的 claude-chat 会话 id（chat.sessionId），可为 null（尚未拉起会话）。 */
    private String devSessionId;
    /** 引擎回吐的引用清单原始 JSON，容错留档，可为 null。 */
    private String rawReferenceJson;
    /** 引用清单解析状态：NONE | OK | FAILED。 */
    private String parseStatus;
    /** 归档状态：PENDING | SUCCESS | FAILED。 */
    private String archiveStatus;
    private String errorMsg;
    private long createdAt;
    /** 会话结束时间（毫秒），未结束时为 null。 */
    private Long endedAt;
}
