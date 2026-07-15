package com.exceptioncoder.toolbox.prdclarify.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * PRD 澄清会话：对应 prd_session 表的一行。
 * questions 字段在 Java 层以 JSON 字符串形式存储，由 Repository 负责与数据库的互转；
 * 若需操作结构化问答，在 Service 层用 ObjectMapper 解析。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PrdSession {

    private String id;
    private String title;
    private String project;
    private String module;
    private String rawInput;
    /** JSON 字符串，格式 [{id,question,answer}]，可为 null（尚未生成问题时）。 */
    private String questions;
    private String status;
    private String mdPath;
    private String model;
    private String errorMsg;
    private long createdAt;
    private long updatedAt;
}
