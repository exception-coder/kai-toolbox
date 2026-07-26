package com.exceptioncoder.toolbox.foreconsult.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 咨询中自动登记的 BUG/数据问题档案：对应 consult_bug 表的一行。
 * AI 判定为缺陷时结构化留存，默认 status=NEW（待人工核实）。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConsultBug {

    private String bugId;
    private String dedupKey;
    private String consultSessionId;
    private String devSessionId;
    private String systemName;
    private String module;
    private String role;
    private String userId;
    private String title;
    /** FUNCTION_BUG | DATA_ISSUE | CONFIG | PERMISSION | OTHER。 */
    private String type;
    /** LOW | MEDIUM | HIGH | CRITICAL。 */
    private String severity;
    private String reproduce;
    private String expected;
    private String actual;
    private String suspectArea;
    /** 证据（附件路径等），JSON 字符串。 */
    private String evidence;
    private String question;
    private String answer;
    private Integer aiConfidence;
    /** AI 依据的图谱/知识引用，JSON 字符串。 */
    private String refsJson;
    /** NEW | CONFIRMED | DUPLICATE | FIXED | WONTFIX | REJECTED。 */
    private String status;
    private int occurrenceCount;
    private long firstSeenAt;
    private long lastSeenAt;
    private long createdAt;
    private long updatedAt;
}
