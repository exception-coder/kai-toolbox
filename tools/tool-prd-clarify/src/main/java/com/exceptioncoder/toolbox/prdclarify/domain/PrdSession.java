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
    /** 关联的 Vibe Coding（claude-chat）开发会话 ID，用于从 PRD 页面直接跳转到开发会话。 */
    private String devSessionId;
    /** 开发文档最后生成时间戳（毫秒）。devDocGeneratedAt < updatedAt 时开发文档已过期。 */
    private Long devDocGeneratedAt;
    private String model;
    /** 提需求方角色：PRODUCT（产品/开发）| BUSINESS（业务员）。决定澄清问题的深度和语言风格。 */
    private String role;
    /**
     * 需求类型：BUG_FIX（缺陷修复）| MODULE_ADJUST（模块调整）| NEW_MODULE（新增模块，默认）。
     * 与 role 正交：role 决定谁在问，reqType 决定问什么、产出什么结构的文档。
     */
    private String reqType;
    /** 本次澄清最多问几轮（原硬编码 5，现由前端确认弹框按 reqType 预填、用户可调）。 */
    private int maxQuestions;
    /**
     * 开发文档生成历史，JSON 字符串数组，格式
     * {@code [{version,mode,extraInstructions,generatedAt}]}，可为 null（尚未生成过）。
     * 用于追溯每一版开发文档是基于什么补充说明/更新澄清生成的。
     */
    private String devDocHistory;
    /**
     * AI 工时评估结果，JSON 字符串，格式
     * {@code {hoursMin,hoursMax,confidence,reasoning,breakdown:[{item,hours}],estimatedAt}}，
     * 可为 null（尚未评估过）。开发文档一定基于最新 PRD 生成，故只对应「当前」这一份开发文档，
     * 不像 devDocHistory 那样按版本存多份——重新生成/更新开发文档后旧评估仍保留在库里，
     * 但 PrdSessionView 会用 estimatedAt 早于 devDocGeneratedAt 标出「已过期」。
     */
    private String devDocEstimation;
    private String errorMsg;
    private long createdAt;
    private long updatedAt;
}
