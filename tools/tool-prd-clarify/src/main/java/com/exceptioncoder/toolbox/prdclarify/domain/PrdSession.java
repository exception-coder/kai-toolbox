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
    private String requirementDetail;
    private String businessBackground;
    private String businessRequirementType;
    private String requirementSoftware;
    private String initiatingDepartment;
    private String requester;
    /** 业务侧提出日期，保存 ISO 日期文本（yyyy-MM-dd），避免跨时区产生日期偏移。 */
    private String requestedAt;
    /** 来源附件的名称、链接或 Markdown 文本。 */
    private String attachments;
    private String followUpRecords;
    /** JSON 字符串，格式 [{id,question,answer}]，可为 null（尚未生成问题时）。 */
    private String questions;
    /** 最近一次 PRD 批量澄清问题生成完成时间（毫秒）。 */
    private Long prdQuestionsGeneratedAt;
    /** 最近一次 PRD 文档生成完成时间（毫秒）。 */
    private Long prdGeneratedAt;
    private String status;
    /** 探索阶段初始化规格的兼容主文件路径。 */
    private String initialSpecPath;
    /** 从需求中枢进入规格探索时的来源需求 ID，用于规划结果幂等回写。 */
    private String sourceReqItemId;
    /** 一次创建操作的客户端幂等键，不进入对外会话视图。 */
    private String creationKey;
    private String mdPath;
    /** 开发文档路径（由 PRD 转换生成，存于 ~/.kai-toolbox/prd/{id}-dev.md）。 */
    private String devDocPath;
    /** 关联的 Vibe Coding（claude-chat）开发会话 ID，用于从 PRD 页面直接跳转到开发会话。 */
    private String devSessionId;
    /** 开发文档最后生成时间戳（毫秒）。devDocGeneratedAt < updatedAt 时开发文档已过期。 */
    private Long devDocGeneratedAt;
    /** 最近一次 TDD 批量澄清问题生成完成时间（毫秒）。 */
    private Long devDocQuestionsGeneratedAt;
    private String model;
    /** Agent 执行引擎：claude（默认）| codex。 */
    private String engine;
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
     * 澄清模式：progressive（渐进式，逐题追问，默认）| batch（批量，一次性生成 maxQuestions 道题，
     * 用户一次性填完再统一提交）。恢复未完成会话（status=CLARIFYING）时用这个字段决定渲染
     * 哪种澄清面板，不会中途切换模式。
     */
    private String clarifyMode;
    /**
     * 开发文档生成历史，JSON 字符串数组，格式
     * {@code [{version,mode,extraInstructions,generatedAt}]}，可为 null（尚未生成过）。
     * 用于追溯每一版开发文档是基于什么补充说明/更新澄清生成的。
     */
    private String devDocHistory;
    /** 最近一次已提交但尚未成功生成 TDD 的技术澄清问答 JSON。 */
    private String devDocQaDraft;
    /** TDD 点按作业状态，独立于 PRD status。 */
    private String devDocWorkStatus;
    private String devDocWorkError;
    /** 执行计划后台生成的当前阶段提示。 */
    private String devDocWorkProgress;
    /** 尚未落为正式产物的 Markdown 增量快照，供页面刷新后恢复。 */
    private String devDocWorkContent;
    /** 最近一次执行计划进度快照落库时间（毫秒）。 */
    private Long devDocWorkUpdatedAt;
    /**
     * AI 工时评估结果，JSON 字符串，格式
     * {@code {hoursMin,hoursMax,confidence,reasoning,breakdown:[{item,hours}],estimatedAt}}，
     * 可为 null（尚未评估过）。开发文档一定基于最新 PRD 生成，故只对应「当前」这一份开发文档，
     * 不像 devDocHistory 那样按版本存多份——重新生成/更新开发文档后旧评估仍保留在库里，
     * 但 PrdSessionView 会用 estimatedAt 早于 devDocGeneratedAt 标出「已过期」。
     */
    private String devDocEstimation;
    /**
     * 创建者：{@code auth_user.id}。由 Controller 在创建会话时从 {@code AuthContext} 解析当前登录
     * 用户后写入，用于历史列表按用户隔离（ADMIN 角色不受此限制，可见全部）。可为 null——
     * 未登录/鉴权关闭时创建的会话，或早于该功能上线的存量数据（已由启动期迁移
     * {@code PrdSessionOwnerMigration} 统一回填成 admin 账号）。
     */
    private Long createdByUserId;
    /**
     * 进度评估文档路径（{@code ~/.kai-toolbox/prd/{id}-progress.md}），非 null 表示评估过至少一次。
     * 结构对齐开发文档：按版本追加落盘，覆盖前先备份为 {@code {id}-progress-v{n}.md}，不丢历史。
     */
    private String progressPath;
    /** 最后一次进度评估时间戳（毫秒），用于跟 updatedAt/devDocGeneratedAt 比较判断是否已过期。 */
    private Long progressGeneratedAt;
    /**
     * 进度评估历史，JSON 字符串数组，格式 {@code [{version,extraContext,generatedAt}]}，
     * 可为 null（尚未评估过）。version 与磁盘上的 {id}-progress-v{n}.md 备份文件编号对应，
     * 用法完全对齐 devDocHistory。
     */
    private String progressHistory;
    /** 本地代码分析后台任务状态：IDLE | RUNNING | COMPLETED | ERROR。 */
    private String progressWorkStatus;
    private String progressWorkStage;
    private String progressWorkError;
    private Long progressWorkStartedAt;
    private Long progressWorkCompletedAt;
    private Long progressWorkUpdatedAt;
    /**
     * 父会话 ID（{@code prd_session.id}），非 null 表示这条记录是通过「需求拆分」从某个
     * 父需求下面拆出来的子需求（见
     * {@code com.exceptioncoder.toolbox.prdclarify.service.PrdRequirementSplitService#adopt}）。目前只有拆分
     * 场景会写入这个字段，普通创建/修订版记录为 null。
     */
    private String parentId;
    private String errorMsg;
    private long createdAt;
    private long updatedAt;
}
