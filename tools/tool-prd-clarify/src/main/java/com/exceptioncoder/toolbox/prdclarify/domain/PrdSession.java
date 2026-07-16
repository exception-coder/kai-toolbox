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
    /** 开发文档路径（由 PRD 转换生成，存于 ~/.kai-toolbox/prd/{id}-dev.md）。 */
    private String devDocPath;
    private String model;
    /** 提需求方角色：PRODUCT（产品/开发）| BUSINESS（业务员）。决定澄清问题的深度和语言风格。 */
    private String role;
    private String errorMsg;
    private long createdAt;
    private long updatedAt;
}
