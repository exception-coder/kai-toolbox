package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.llm.spi.LocalProjectResolver;
import com.exceptioncoder.toolbox.prdclarify.api.dto.DevDocVersionSummary;
import com.exceptioncoder.toolbox.prdclarify.api.dto.ProgressVersionSummary;
import com.exceptioncoder.toolbox.prdclarify.api.dto.QaPairRequest;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdBusinessFields;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.domain.DocumentProfile;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.ObjectProvider;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * PRD 澄清核心服务。
 *
 * <p>两阶段流程：
 * <ol>
 *   <li><b>澄清阶段</b>（{@link #clarify}）：调 Claude 生成澄清问题（JSON），流式推 SSE，落库。</li>
 *   <li><b>生成阶段</b>（{@link #generate}）：读出问答，调 Claude 生成 PRD Markdown，流式推 SSE，落盘。</li>
 * </ol>
 *
 * <p>SSE 事件命名与 resume 模块一致：{@code chunk}（文本增量）、{@code done}（完成）、{@code error}（失败）。
 */
@Slf4j
@Service
public class PrdClarifyService {

    // ───── 需求类型：与 role 正交的第二个维度，决定「问什么」和「产出什么结构的文档」 ─────
    // BUG_FIX（缺陷修复）| MODULE_ADJUST（模块调整）| NEW_MODULE（新增模块，默认，兼容历史数据）。
    private static final String REQ_TYPE_BUG_FIX = "BUG_FIX";

    /**
     * 各需求类型对应的默认澄清轮数（用户可在「开始澄清」确认弹框里覆盖）：
     * Bug 修复通常复现步骤+期望行为一次就能问清楚，2 轮足够；新增模块涉及业务目标/边界/验收
     * 标准，需要更多轮次兜底复杂场景。createSession() 未显式传 maxQuestions 时按此表兜底。
     */
    private static final Map<String, Integer> DEFAULT_MAX_QUESTIONS = Map.of(
            REQ_TYPE_BUG_FIX, 2,
            "MODULE_ADJUST", 5,
            "NEW_MODULE", 8
    );

    /**
     * 需求类型自动判定 prompt：仅在 reqType 未显式提供时使用（典型场景：业务员角色不展示
     * StartClarifyDialog 技术分类弹框——业务员分不清 Bug 修复/模块调整/新增模块，也判断不出
     * 该问几轮，这类判断改由这里做一次轻量 LLM 分类，而不是甩给用户或死死写死默认值）。
     * 严格要求单行 JSON 输出，便于确定性解析；调用异常或解析失败时上层兜底 NEW_MODULE。
     */
    private static final String REQ_TYPE_CLASSIFY_SYSTEM = """
            你是需求分诊助手。根据用户提供的标题和描述，判断这是哪种类型的开发需求，
            并给出建议的最大澄清轮数。

            三种类型：
            - BUG_FIX：现有功能出错/行为不符合预期。描述里通常有"应该是…但实际是…""不对""报错""失败"
              这类落差表述，或直接描述了一段有问题的逻辑/代码行为
            - MODULE_ADJUST：调整/优化现有功能的行为、界面、规则——功能本身已经存在，只是要改
            - NEW_MODULE：全新的功能/模块，之前完全不存在

            【严格输出要求】只输出一行 JSON，不加任何说明、前言、结语或 markdown 围栏：
            {"reqType":"BUG_FIX 或 MODULE_ADJUST 或 NEW_MODULE 三选一","maxQuestions":数字}

            maxQuestions 参考：BUG_FIX 给 1-2，MODULE_ADJUST 给 3-5，NEW_MODULE 给 5-8；
            描述已经很清楚具体时取区间下限，描述简略/信息不足时取区间上限。
            """;

    private static final int MAX_SUGGESTED_TITLE_CODE_POINTS = 40;
    private static final String TITLE_SUGGESTION_SYSTEM = """
            你是软件需求命名助手。根据系统、模块、需求描述和图片，提炼一个准确的中文业务短标题。
            只输出短标题，不要包含系统名、模块名、序号、引号、句号、解释或 Markdown。
            标题使用“动作 + 对象”或“对象 + 能力”结构，最多 20 个汉字，避免“需求”“功能优化”等空泛表述。
            """;

    // ───── 多轮渐进式需求澄清 System Prompt ─────

    /**
     * 产品/开发角色的需求澄清提示词。
     *
     * <p>通过精准提问消除需求歧义，为后续 PRD 和开发文档生成提供充分的上下文。
     * 提问前 Java 层已直接调 graphify CLI 查过代码知识图谱（不经 MCP），结果作为
     * 【代码知识图谱查询结果】区块拼进 user prompt，使问题可以直接引用现有代码实体。
     */
    private static final String ASK_SYSTEM_PRODUCT = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            本次执行平台统一的需求澄清流程，每轮只输出 1 个精准澄清问题
            （或 [CLARIFICATION_COMPLETE]），不进入其他流程。
            不得依赖某个引擎专属的命令、skill 或 plugin。

            你正在执行 PRD 生成前的需求澄清（产品/开发视角）：
            只确认业务目标、范围和规则，为 PRD 文档生成收集充足信息。技术设计留到 TDD 澄清。

            【提问前置：结合下方知识图谱背景】

            第一层 — 代码知识（见 user prompt 中的【代码知识图谱查询结果】区块，已由系统直接调用
            graphify CLI 查询得到，非 MCP 工具调用）：
            - 若该区块非空，其中是真实的 Java 类、Service 方法、数据库字段
            - 目的：避免问出"现有表有哪些字段"这种已有答案的废话问题
            - 若为空，说明该项目暂无图谱或未匹配到相关内容，忽略即可，不要假装看到了内容

            第二层 — 业务语义（mcp__domain-knowledge__search_knowledge，若可用）：
            - search_knowledge(query=..., project=..., module=...)
            - get_knowledge(id) 获取状态机/流程/规则
            - 目的：问题能引用已有业务状态名/枚举值

            提问规则（严格执行）：
            - 只问如果不明确就无法确定产品目标、业务范围、业务规则或验收口径的问题
            - 可问：业务目标、用户与场景、功能边界、业务流程、业务规则与例外、验收标准
            - 禁止询问：数据库/字段/API/类/方法、框架选型、代码结构、部署方案等实现细节
            - 代码与业务知识图谱只用于识别现有业务行为、避免重复提问；向用户提问时转成业务语言，
              不暴露表名、字段名、类名或方法名
            - 基于上一个回答动态追问，最多 5 轮
            - 只有开发者/产品负责人必须作出明确业务决策时才提问；可从上下文确定、可由实现阶段
              自行选择、或不影响 PRD 完成的问题不要问
            - 信息充足时立即输出：[CLARIFICATION_COMPLETE]
            - 只输出问题本身（或 [CLARIFICATION_COMPLETE]），不加序号、前缀或解释
            """;

    /**
     * 业务员角色的需求澄清提示词。
     *
     * <p>与产品角色采用相同的渐进澄清方式，但面向非技术业务人员：只问业务关键问题，
     * 知识图谱背景转换为业务语言呈现，不暴露技术细节。
     */
    private static final String ASK_SYSTEM_BUSINESS = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            本次执行平台统一的需求澄清流程，每轮只输出 1 个业务澄清问题
            （或 [CLARIFICATION_COMPLETE]），不进入其他流程。
            不得依赖某个引擎专属的命令、skill 或 plugin。

            你正在执行需求澄清（业务人员视角）：
            帮助非技术背景的业务人员把业务痛点转化为清晰的需求描述。

            【提问前置：先了解现有业务背景，用业务语言表述（不讲技术）】
            1. mcp__domain-knowledge__search_knowledge（若可用）：搜索现有业务流程和规则
               → 提问时用"现有流程是…，这个需求要在哪一步生效？"等业务语言
            2. user prompt 中的【代码知识图谱查询结果】区块（系统已直接调用 graphify CLI 查询，
               非 MCP 工具调用）：包含现有功能结构
               → 转换成业务行为描述，不用类名/字段名；区块为空则忽略

            提问规则（业务版）：
            - 每次只问 1 个如果不明确就无法完成 PRD 的业务决策，聚焦业务本质
            - 可问：业务目标、使用场景、关键数据、业务规则与例外、验收标准
            - 不问：界面细节、数据库/接口、框架选型等技术问题
            - 例外：若界面直接影响业务流程，可以问
            - 语言通俗，避免技术术语，最多 5 轮
            - 信息充足时立即输出：[CLARIFICATION_COMPLETE]
            - 只输出问题本身（或 [CLARIFICATION_COMPLETE]），不加序号或解释
            """;

    /**
     * Bug 修复类型 — 极简澄清路径。
     *
     * <p>跟 ASK_SYSTEM_PRODUCT/BUSINESS 是完全不同的问题清单，不是"一样的流程只是问少一点"：
     * Bug 需要的是复现条件和期望/实际行为的落差，不是业务目标/使用场景这类大而全的问题。
     * 对齐 team-standards:bug-doc-required 的问法，默认轮数少（见 DEFAULT_MAX_QUESTIONS），
     * 很多时候第 0 轮信息已经足够，直接输出 [CLARIFICATION_COMPLETE]。
     */
    private static final String ASK_SYSTEM_BUG = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            本次是缺陷修复的极简澄清路径，每轮只输出 1 个问题（或 [CLARIFICATION_COMPLETE]）。

            你正在澄清一个 Bug 修复需求，目标是快速补全「复现条件」和「期望 vs 实际行为」的落差，
            不是完整的产品需求分析——不问业务目标、使用场景、验收标准这类大而全的问题。

            【可参考 user prompt 中的【代码知识图谱查询结果】区块（系统已直接调用 graphify CLI
            查询得到，非 MCP 工具调用），若非空可用其中的真实类名/方法名让问题更精确；为空则忽略】

            提问规则（严格执行）：
            - 只问以下几类：复现步骤、期望行为 vs 实际行为、影响范围（哪些场景/用户会触发）、
              是否是最近改动引入的回归、是否有报错日志/堆栈
            - 若用户描述已经包含"复现条件 + 期望行为"（如一段具体的 if/else 逻辑判断反了），
              信息通常已经足够，直接输出 [CLARIFICATION_COMPLETE]，不要为了凑轮数硬问
            - 每次只问 1 个当前最缺失的信息点，不加序号、前缀或解释
            """;

    // ───── 批量澄清模式：一次性生成 N 个问题（N = session.maxQuestions），用户一次性填完 ─────
    // 跟 ASK_SYSTEM_PRODUCT/BUSINESS/BUG 是并列的两种模式，不是谁取代谁：渐进模式题目之间有
    // 依赖（基于上一题答案动态追问），批量模式题目互相独立（一次性问完，不能动态调整）。

    /**
     * 批量澄清 system prompt：题量由 user prompt 明确指定（{@link #buildClarifyPrompt}
     * 按 session.maxQuestions 拼入），提问重点按需求类型/角色区分，逻辑对齐渐进模式的
     * ASK_SYSTEM_PRODUCT/BUSINESS/BUG，只是从"每轮 1 题动态追问"改成"一次性给全部独立问题"。
     */
    private static final String CLARIFY_SYSTEM = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            本次是批量澄清模式，一次性输出 user prompt 指定数量的澄清问题，不进入其他流程。

            【严格输出要求】
            直接输出 JSON 数组，不加任何说明、前言、结语或 Markdown 围栏（禁止 ```json，直接以 [ 开头）。
            每个元素格式：{"question": "问题内容"}

            问题要求：
            - 数量严格等于 user prompt 指定的题数，不多不少
            - 每题聚焦一个独立的歧义点，互相不重复、不递进依赖——因为是一次性问完，不能像
              渐进模式那样根据上一题答案动态调整下一题，每题都要能独立作答
            - 每题简洁具体，一句话内可回答
            - 严格按 user prompt 里的"提问重点"作答（不同需求类型/角色侧重不同）
            - 这是 PRD 生成前的业务澄清：只问业务目标、用户场景、范围、业务规则/例外和验收口径
            - 禁止询问数据库、字段、API、类、方法、框架、代码结构或部署方案等技术实现细节
            - 知识图谱只用于理解现有行为和避免已有答案的问题，提问必须转成业务语言
            - 每个问题都必须是产品/开发负责人不明确回答就无法完成 PRD 的关键决策
            """;

    /**
     * 「一次性回答」拆分归位提示词：把用户写成一整段的回答按题归位，只做归类，不做作答。
     *
     * <p>刻意压得很死：不许编、不许补、不许润色，原文没覆盖的题必须留空——因为这些答案会直接
     * 进 PRD 生成，模型顺手"合理推断"出来的内容会被用户当成自己说过的话，比留空危险得多。
     */
    private static final String DISTRIBUTE_ANSWER_SYSTEM = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            你的唯一工作是把用户写成一整段的回答，按题号拆分归位到对应的澄清问题上。

            【严格输出要求】
            直接输出 JSON 对象，不加任何说明、前言、结语或 Markdown 围栏（禁止 ```json，直接以 { 开头）。
            格式：{"answers": [{"index": 题号(从1开始的整数), "answer": "该题的答案原文"}], "leftover": "没能归到任何一题的内容"}

            归位规则（严格执行）：
            - 只做归类和摘录，禁止编造、补全、推断、润色。answer 必须来自用户原文（可做最小限度的
              裁剪和语序整理，使其能独立成句），不得加入原文没有的信息
            - 用户原文没有涉及的问题，直接不要出现在 answers 数组里（留空让用户自己补），
              严禁用"未提及""待确认"或你推断的合理答案去填
            - 一段话同时回答了多题时，拆开分别归位；多段话都在回答同一题时，合并成一条
            - 用户原文里显式写了题号/序号时，优先按他标的题号归位，不要自行改判
            - 与所有问题都无关、或属于额外补充说明的内容，原样放进 leftover（不要丢掉）；
              全部内容都已归位时 leftover 给空串
            """;

    /**
     * PRD 生成提示词。
     *
     * <p>输入来自平台统一的需求发现与澄清流程：
     * <ul>
     *   <li>需求发现 — 已通过原始需求描述完成
     *   <li>需求澄清 — 已通过多轮 AI 渐进澄清完成
     * </ul>
     * 本步骤将上述产出汇总为符合平台固定章节契约的正式 PRD 文档。
     */
    private static final String GENERATE_SYSTEM = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            本次是需求发现与澄清完成后的文档化步骤，直接输出 PRD 文档，不进入交互。

            已完成的前置工作：
            - 需求发现：原始需求描述已提供
            - 需求澄清：多轮澄清问答已完成
            基于以上产出生成正式 PRD 文档。不得依赖某个引擎专属的命令、skill 或 plugin。

            文档使用 Markdown 格式，必须包含以下章节（顺序不变，内容可根据实际情况扩展）：

            # [功能名称]

            ## 1. 文档概述
            ## 2. 业务背景与目标
            ## 3. 目标用户与使用场景
            ## 4. 功能范围（Scope）
            ### 4.1 本期包含
            ### 4.2 本期不包含
            ## 5. 功能需求详述
            ## 6. 非功能性需求
            ## 7. 数据模型影响
            ## 8. 验收标准
            ## 9. 开放问题与风险

            直接输出 Markdown，不加代码块，不加多余解释。内容具体可落地，让工程师无需追问即可开始设计。
            """;

    private static final String GENERATE_SYSTEM_SPEC_DRIVEN = """
            ⚠️ 直接输出任务：根据原始需求与已确认的澄清问答，生成一份可持续演进的核心规格。
            直接输出 Markdown，不进入交互，不调用任何额外流程。

            文档必须使用以下稳定结构：
            # [功能名称] · 核心规格
            ## 1. 规格元信息
            ## 2. 目标与成功信号
            ## 3. 范围与边界
            ## 4. 需求与业务规则
            ## 5. 场景
            ## 6. 验收标准
            ## 7. 约束
            ## 8. 决策记录
            ## 9. 开放问题

            每个可独立追踪的条目必须带稳定 ID，格式分别为 GOAL-001、REQ-001、RULE-001、
            SCN-001、AC-001、CONSTRAINT-001、DECISION-001、OPEN-001。条目之间用 ID 显式引用，
            验收标准必须引用对应 REQ/RULE/SCN。未知事实写入 OPEN，不得编造。
            这是持续更新的事实来源，不写排期、负责人或代码实现任务。
            """;

    private static final String GENERATE_SYSTEM_SPEC_DRIVEN_UPDATE = """
            ⚠️ 直接输出任务：更新已有核心规格并返回完整 Markdown，不进入交互。
            保留未变更条目的稳定 ID；新增条目使用下一个可用序号；废弃条目保留并标记 Deprecated，
            不得通过重排编号伪造新规格。将新证据合并为目标、范围、需求、规则、场景、验收标准、
            约束、决策或开放问题，并在“决策记录”说明本次规格变化及依据。
            输出仍须符合核心规格的固定章节和 ID 契约。
            """;

    /**
     * 修订版 PRD 的生成 System Prompt：在标准章节基础上，
     * 强制添加「实现状态」章节，标注每个功能点是「已实现/本次新增/本次修改」，
     * 避免 AI 在后续「开始开发」时重复实现已完成的功能。
     */
    private static final String GENERATE_SYSTEM_REVISION = """
            你是一名资深产品经理，正在对现有 PRD 进行修订，生成新版本文档。

            rawInput 中包含：
            1. 原版 PRD 全文（=== 原版 PRD 内容 === 区域）
            2. 本次修订说明（=== 本次修订说明 === 区域）

            请根据以上信息生成修订版 PRD，必须包含以下章节（顺序不变）：

            # [功能名称]（修订版 vX）

            ## 0. 实现状态（【重要】供 AI 开发使用，避免重复实现）
            按每个功能点标注当前状态：
            - ✅ 已实现 — [功能点描述]（已完成，勿重新实现）
            - 🆕 本版新增 — [功能点描述]（需要实现）
            - 🔄 本版修改 — [功能点描述]（原有实现需要更新，说明改动点）

            ## 1. 文档概述（含版本历史）
            ## 2. 业务背景与目标（修订原因）
            ## 3. 目标用户与使用场景
            ## 4. 功能范围（Scope）
            ### 4.1 本期包含
            ### 4.2 本期不包含
            ## 5. 功能需求详述
            ## 6. 非功能性需求
            ## 7. 数据模型影响
            ## 8. 验收标准
            ## 9. 开放问题与风险

            第 0 章「实现状态」是最重要的章节，务必准确标注，内容直接决定后续 AI 开发的实现范围。
            直接输出 Markdown，不加代码块，不加多余解释。
            """;

    /**
     * Bug 修复类型的产出物：「缺陷修复说明」，不是标准 9 节 PRD。
     *
     * <p>标准 PRD 的"业务背景与目标/目标用户与使用场景"等章节对 Bug 修复没有意义——Bug 不需要
     * 论证"为什么要做"，只需要说清楚"现在错在哪、该怎么修、怎么验证"。章节结构对齐
     * team-standards:bug-doc-required 的分析文档骨架，供开发者直接定位代码并修复。
     */
    private static final String GENERATE_SYSTEM_BUG = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            本次是缺陷修复说明的最终产出，直接输出文档，不进入交互。

            基于原始需求描述和澄清问答（复现步骤/期望-实际行为/影响范围），生成「缺陷修复说明」。

            文档使用 Markdown 格式，必须包含以下章节（顺序不变，没有对应信息的章节如实标注
            "未提供"，不要编造）：

            # [Bug 标题]

            ## 1. 问题描述
            简述现象，一段话说清楚"哪里、什么情况下、发生了什么"。
            ## 2. 复现步骤
            有序列表，具体到操作/输入。
            ## 3. 期望行为 vs 实际行为
            两栏对比或分点列出。
            ## 4. 根因分析
            若澄清中已定位到代码层面原因（如具体 if/else 分支、条件判断），直接引用；
            未定位到则基于现象给出最可能的假设，并标注"待开发者代码确认"。
            ## 5. 修复方案
            具体到修改点：改哪个条件判断/哪个方法，怎么改。
            ## 6. 影响范围
            哪些场景/接口/用户会受影响，是否需要数据修复。
            ## 7. 验收标准
            修复后如何验证：具体的输入 → 预期输出。

            直接输出 Markdown，不加代码块围栏，不加多余解释。内容具体可落地，
            让工程师无需追问即可定位代码并动手修复。
            """;

    // ─────────────────────────

    private final AgentOneShotRunner agentRunner;
    private final PrdSessionRepository repo;
    private final PrdFileStore fileStore;
    private final ObjectMapper mapper;
    private final GraphifyQueryService graphifyQuery;
    private final DomainKnowledgeQueryService domainKnowledgeQuery;
    private final ImageAttachmentStorageService imageAttachmentStorage;
    private final ObjectProvider<LocalProjectResolver> localProjectResolver;

    /**
     * 多轮澄清（最多 5 轮）会话内的图谱查询结果缓存：question（session 标题）在各轮间不变，
     * 避免每轮都重新起一次 graphify CLI 子进程。key=sessionId，value 用 Optional 包装以区分
     * 「查过但无结果」与「尚未查过」。会话删除时同步清理，避免内存无界增长。
     */
    private final Map<String, Optional<String>> graphifyAskCache = new ConcurrentHashMap<>();
    /** 防止同一需求被重复提交多个后台工时评估；任务本身由虚拟线程执行。 */
    private final Set<String> activeEffortEstimations = ConcurrentHashMap.newKeySet();

    public PrdClarifyService(AgentOneShotRunner agentRunner,
                             PrdSessionRepository repo,
                             PrdFileStore fileStore,
                             ObjectMapper mapper,
                             GraphifyQueryService graphifyQuery,
                             DomainKnowledgeQueryService domainKnowledgeQuery,
                             ImageAttachmentStorageService imageAttachmentStorage,
                             ObjectProvider<LocalProjectResolver> localProjectResolver) {
        this.agentRunner = agentRunner;
        this.repo = repo;
        this.fileStore = fileStore;
        this.mapper = mapper;
        this.graphifyQuery = graphifyQuery;
        this.domainKnowledgeQuery = domainKnowledgeQuery;
        this.imageAttachmentStorage = imageAttachmentStorage;
        this.localProjectResolver = localProjectResolver;
    }

    /** 创建会话并持久化，返回新建的会话对象。 */
    public PrdSession createSession(String title, String rawInput,
                                    String project, String module, String model, String role) {
        return createSession(title, rawInput, project, module, model, "claude", role,
                null, null, null, null, PrdBusinessFields.empty(), null, DocumentProfile.CLASSIC.name());
    }

    /**
     * 创建会话并持久化，返回新建的会话对象。
     *
     * @param reqType         需求类型：BUG_FIX | MODULE_ADJUST | NEW_MODULE。null/空/未识别时说明
     *                        前端没有展示分类弹框（典型：业务员角色），转为调用 LLM 自动判定
     *                        （{@link #classifyReqType}），而不是静默按 NEW_MODULE 处理。
     * @param maxQuestions    本次澄清最多问几轮，null 或非正数时按 reqType 从 {@link #DEFAULT_MAX_QUESTIONS}
     *                        兜底（reqType 走自动判定分支时此参数被忽略，以判定结果为准）
     * @param createdByUserId 创建者（当前登录用户 auth_user.id），由 Controller 从 AuthContext 解析后传入；
     *                        未登录/鉴权关闭时为 null（历史列表退回旧的「全部按时间倒序」行为，不做用户过滤）
     * @param clarifyMode     澄清模式：progressive（渐进式，默认）| batch（批量一次性生成全部问题）；
     *                        null/未识别一律归一化成 progressive
     */
    public PrdSession createSession(String title, String rawInput,
                                    String project, String module, String model, String engine, String role,
                                    String reqType, Integer maxQuestions, Long createdByUserId,
                                    String clarifyMode, PrdBusinessFields businessFields, String parentId,
                                    String documentProfile) {
        long now = System.currentTimeMillis();
        PrdBusinessFields fields = businessFields == null ? PrdBusinessFields.empty() : businessFields;
        String effectiveRole = (role != null && "BUSINESS".equalsIgnoreCase(role)) ? "BUSINESS" : "PRODUCT";
        String effectiveEngine = normalizeEngine(engine);
        String effectiveParentId = parentId == null || parentId.isBlank() ? null : parentId.trim();
        if (effectiveParentId != null && repo.findById(effectiveParentId).isEmpty()) {
            throw new IllegalArgumentException("父 PRD 会话不存在: " + effectiveParentId);
        }
        ReqTypeClassification classification = resolveReqType(title, rawInput, model, effectiveEngine, reqType, maxQuestions);
        String effectiveClarifyMode = "batch".equals(clarifyMode) ? "batch" : "progressive";

        PrdSession session = PrdSession.builder()
                .id(UUID.randomUUID().toString())
                .title(title)
                .rawInput(rawInput)
                .project(project)
                .module(module)
                .requirementDetail(fields.requirementDetail())
                .businessBackground(fields.businessBackground())
                .businessRequirementType(fields.businessRequirementType())
                .requirementSoftware(fields.requirementSoftware())
                .initiatingDepartment(fields.initiatingDepartment())
                .requester(fields.requester())
                .requestedAt(fields.requestedAt())
                .attachments(fields.attachments())
                .followUpRecords(fields.followUpRecords())
                .model(model)
                .engine(effectiveEngine)
                .role(effectiveRole)
                .reqType(classification.reqType())
                .maxQuestions(classification.maxQuestions())
                .clarifyMode(effectiveClarifyMode)
                .documentProfile(DocumentProfile.normalize(documentProfile))
                .status("CLARIFYING")
                .createdByUserId(createdByUserId)
                .parentId(effectiveParentId)
                .createdAt(now)
                .updatedAt(now)
                .build();
        repo.insert(session);
        return session;
    }

    /**
     * 保存草稿：只落盘标题/需求描述/关联项目模块，不判定需求类型/澄清深度/澄清模式——那些要等
     * 用户真正点「开始澄清」（{@link #startClarifyFromDraft}）时才需要决定，草稿阶段还没到那一步。
     * role/reqType/maxQuestions/clarifyMode 落成跟数据库列默认值一致的占位值，转正式时会被覆盖。
     *
     * @param rawInput 需求描述，草稿允许暂时空着（只想先占个标题/项目/模块的位）；null 归一化为空串
     *                 （raw_input 列 NOT NULL，不能真塞 null）
     */
    public PrdSession saveDraft(String title, String rawInput, String project, String module, Long createdByUserId,
                                PrdBusinessFields businessFields, String documentProfile) {
        long now = System.currentTimeMillis();
        PrdBusinessFields fields = businessFields == null ? PrdBusinessFields.empty() : businessFields;
        PrdSession session = PrdSession.builder()
                .id(UUID.randomUUID().toString())
                .title(title)
                .rawInput(rawInput == null ? "" : rawInput)
                .project(project)
                .module(module)
                .requirementDetail(fields.requirementDetail())
                .businessBackground(fields.businessBackground())
                .businessRequirementType(fields.businessRequirementType())
                .requirementSoftware(fields.requirementSoftware())
                .initiatingDepartment(fields.initiatingDepartment())
                .requester(fields.requester())
                .requestedAt(fields.requestedAt())
                .attachments(fields.attachments())
                .followUpRecords(fields.followUpRecords())
                .role("PRODUCT")
                .reqType("NEW_MODULE")
                .maxQuestions(DEFAULT_MAX_QUESTIONS.get("NEW_MODULE"))
                .clarifyMode("progressive")
                .documentProfile(DocumentProfile.normalize(documentProfile))
                .status("DRAFT")
                .createdByUserId(createdByUserId)
                .createdAt(now)
                .updatedAt(now)
                .build();
        repo.insert(session);
        return session;
    }

    /** 再次保存草稿（覆盖字段，状态保持 DRAFT）。会话必须仍处于 DRAFT 状态，否则说明前端页面状态过期。 */
    public PrdSession updateDraft(String sessionId, String title, String rawInput, String project, String module,
                                  PrdBusinessFields businessFields, String documentProfile) {
        PrdSession existing = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        if (!"DRAFT".equals(existing.getStatus())) {
            throw new IllegalStateException("当前状态 " + existing.getStatus() + " 不是草稿，无法这样保存");
        }
        String effectiveDocumentProfile = documentProfile == null
                ? existing.getDocumentProfile() : documentProfile;
        repo.updateDraftFields(sessionId, title, rawInput == null ? "" : rawInput, project, module, businessFields,
                effectiveDocumentProfile);
        return repo.findById(sessionId).orElseThrow();
    }

    /**
     * 草稿转正式：发起澄清。复用 {@link #createSession} 同一套需求类型自动判定逻辑
     * （{@link #resolveReqType}），区别只是不新插入一条记录，而是原地更新已存在的草稿行
     * （草稿和后续的澄清/生成是同一条需求记录的同一个生命周期，不应该产生两条历史记录）。
     */
    public PrdSession startClarifyFromDraft(String sessionId, String title, String rawInput,
                                             String project, String module, String model, String engine, String role,
                                             String reqType, Integer maxQuestions, String clarifyMode,
                                             PrdBusinessFields businessFields, String documentProfile) {
        PrdSession existing = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        if (!"DRAFT".equals(existing.getStatus())) {
            throw new IllegalStateException("当前状态 " + existing.getStatus() + " 不是草稿，不能重复发起澄清");
        }
        String effectiveRole = (role != null && "BUSINESS".equalsIgnoreCase(role)) ? "BUSINESS" : "PRODUCT";
        String effectiveEngine = normalizeEngine(engine);
        ReqTypeClassification classification = resolveReqType(title, rawInput, model, effectiveEngine, reqType, maxQuestions);
        String effectiveClarifyMode = "batch".equals(clarifyMode) ? "batch" : "progressive";
        String effectiveDocumentProfile = documentProfile == null
                ? existing.getDocumentProfile() : documentProfile;
        repo.startClarifyFromDraft(sessionId, title, rawInput, project, module, model, effectiveEngine,
                effectiveRole, classification.reqType(), classification.maxQuestions(), effectiveClarifyMode,
                businessFields, effectiveDocumentProfile);
        return repo.findById(sessionId).orElseThrow();
    }

    /**
     * 需求类型 + 澄清轮数解析：显式提供（StartClarifyDialog 里用户手选，或 API 直接指定）时直接采用，
     * 否则走 LLM 自动判定（{@link #classifyReqType}，典型场景：业务员角色不弹分类弹框）。
     * {@link #createSession} 和 {@link #startClarifyFromDraft} 共用同一套逻辑，避免两处判定标准分叉。
     */
    private ReqTypeClassification resolveReqType(String title, String rawInput, String model, String engine,
                                                  String reqType, Integer maxQuestions) {
        if (reqType != null && DEFAULT_MAX_QUESTIONS.containsKey(reqType)) {
            int effectiveMaxQuestions = (maxQuestions != null && maxQuestions > 0)
                    ? maxQuestions
                    : DEFAULT_MAX_QUESTIONS.get(reqType);
            return new ReqTypeClassification(reqType, effectiveMaxQuestions);
        }
        ReqTypeClassification classification = classifyReqType(title, rawInput, model, engine);
        log.info("[prd-clarify] 需求类型自动判定 title='{}' -> reqType={} maxQuestions={}",
                title, classification.reqType(), classification.maxQuestions());
        return classification;
    }

    /** 需求类型自动判定结果：reqType 三选一 + 建议澄清轮数。 */
    private record ReqTypeClassification(String reqType, int maxQuestions) {
    }

    /** AI 标题建议，完整标题由代码按固定格式拼接。 */
    public record TitleSuggestion(String shortTitle, String title) {
    }

    /**
     * 从需求文本和图片提炼业务短标题；模型异常时使用描述首行降级。
     *
     * @param project  系统或项目名称
     * @param module   业务模块名称
     * @param rawInput 需求描述及附件引用
     * @return 确定性格式化后的标题建议
     */
    public TitleSuggestion suggestTitle(String project, String module, String rawInput) {
        String normalizedProject = requireTitlePart(project, "系统");
        String normalizedModule = requireTitlePart(module, "模块");
        String fallback = fallbackShortTitle(rawInput);
        String candidate = fallback;
        try {
            String prompt = "系统：" + normalizedProject + "\n模块：" + normalizedModule + "\n需求描述：\n" + rawInput;
            List<AgentOneShotRunner.ImageInput> images = extractImagesFromRawInput(rawInput);
            candidate = agentRunner.runOnce(
                    TITLE_SUGGESTION_SYSTEM, prompt, null, AgentOneShotRunner.DEFAULT_ENGINE, images);
        } catch (Exception e) {
            log.warn("[prd-clarify] 标题建议生成失败，使用描述摘要: {}", e.getMessage());
        }
        String shortTitle = normalizeShortTitle(candidate, normalizedProject, normalizedModule, fallback);
        return new TitleSuggestion(shortTitle, String.join("-", normalizedProject, normalizedModule, shortTitle));
    }

    /**
     * 需求类型自动判定：调一次轻量 oneShot LLM 分类（{@link #REQ_TYPE_CLASSIFY_SYSTEM}），
     * 解析失败或调用异常时兜底 NEW_MODULE——分类是「体验优化」，不能因为它失败就把整个
     * 创建会话流程搞挂，兜底值本身也是合理默认（新增模块走最完整的标准澄清流程）。
     */
    private ReqTypeClassification classifyReqType(String title, String rawInput, String model, String engine) {
        try {
            String userPrompt = "标题：" + title + "\n描述：" + rawInput;
            String raw = agentRunner.runOnce(REQ_TYPE_CLASSIFY_SYSTEM, userPrompt, model, engine);
            JsonNode node = mapper.readTree(stripFence(raw == null ? "" : raw.trim()));
            String type = node.path("reqType").asText("");
            if (!DEFAULT_MAX_QUESTIONS.containsKey(type)) {
                type = "NEW_MODULE";
            }
            int qs = node.path("maxQuestions").asInt(0);
            if (qs <= 0) {
                qs = DEFAULT_MAX_QUESTIONS.get(type);
            }
            qs = Math.max(1, Math.min(10, qs));
            return new ReqTypeClassification(type, qs);
        } catch (Exception e) {
            log.warn("[prd-clarify] 需求类型自动判定失败，兜底 NEW_MODULE: {}", e.getMessage());
            return new ReqTypeClassification("NEW_MODULE", DEFAULT_MAX_QUESTIONS.get("NEW_MODULE"));
        }
    }

    private static String normalizeEngine(String engine) {
        if (engine == null || engine.isBlank() || "claude".equalsIgnoreCase(engine)) return "claude";
        if ("codex".equalsIgnoreCase(engine)) return "codex";
        throw new IllegalArgumentException("不支持的 Agent 引擎: " + engine);
    }

    private static String requireTitlePart(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(fieldName + "不能为空");
        }
        return value.trim().replaceAll("\\s*-\\s*", "-");
    }

    private static String normalizeShortTitle(String value, String project, String module, String fallback) {
        String title = stripFence(value == null ? "" : value.trim())
                .lines()
                .filter(line -> !line.isBlank())
                .findFirst()
                .orElse(fallback)
                .trim()
                .replaceFirst("^(标题|短标题)\\s*[:：]\\s*", "")
                .replaceFirst("^#{1,6}\\s*", "")
                .replaceFirst("^[-*]\\s+", "")
                .replaceAll("^[\"'“”‘’《》]+|[\"'“”‘’《》。！？!?；;]+$", "");
        String combinedPrefix = project + "-" + module + "-";
        if (title.startsWith(combinedPrefix)) {
            title = title.substring(combinedPrefix.length()).trim();
        } else {
            title = removeTitlePrefix(removeTitlePrefix(title, project), module);
        }
        if (title.isBlank()) {
            title = fallback;
        }
        return truncateCodePoints(title, MAX_SUGGESTED_TITLE_CODE_POINTS);
    }

    private static String removeTitlePrefix(String title, String prefix) {
        if (!title.startsWith(prefix)) {
            return title;
        }
        return title.substring(prefix.length()).replaceFirst("^\\s*[-—:：]\\s*", "").trim();
    }

    private static String fallbackShortTitle(String rawInput) {
        if (rawInput == null) {
            return "新需求";
        }
        return rawInput.lines()
                .map(String::trim)
                .filter(line -> !line.isBlank())
                .filter(line -> !line.startsWith("![") && !line.startsWith("[📎"))
                .map(line -> line.replaceFirst("^#{1,6}\\s*", "").replaceFirst("^[-*]\\s*", ""))
                .filter(line -> !line.isBlank())
                .findFirst()
                .map(line -> truncateCodePoints(line, MAX_SUGGESTED_TITLE_CODE_POINTS))
                .orElse("新需求");
    }

    private static String truncateCodePoints(String value, int maxCodePoints) {
        int count = value.codePointCount(0, value.length());
        if (count <= maxCodePoints) {
            return value;
        }
        return value.substring(0, value.offsetByCodePoints(0, maxCodePoints));
    }

    /**
     * 一次性回答的自动分配结果。
     *
     * @param answers          与 session.questions 等长、按题序对齐的答案数组（未匹配到内容的位置为空串）
     * @param matchedCount     实际分配到内容的题数
     * @param unmatchedNumbers 没分到内容的题号（1 起，供前端提示用户手动补充）
     * @param leftover         整段回答里没能归到任何一题的内容（可能是补充说明，也可能是模型漏分，
     *                         原样回给前端展示，避免用户粘贴的内容被静默吞掉）
     */
    public record AnswerDistribution(List<String> answers, int matchedCount,
                                     List<Integer> unmatchedNumbers, String leftover) {
    }

    /**
     * 批量澄清模式的「一次性回答」：用户把对全部问题的回答写/粘成一整段，这里调一次 oneShot LLM
     * 把它拆分归位到每一题，返回按题序对齐的答案数组，由前端填进各题输入框后仍可人工修改。
     *
     * <p>定位是「省去逐题复制粘贴的体力活」，不是替用户作答——所以：
     * <ul>
     *   <li>LLM 只负责「这段话里哪句在回答第几题」这个模糊判断，不允许它编造、补全、润色答案，
     *       原文没提到的题一律留空（宁可留空让用户补，也不能拿编的内容去生成 PRD）；</li>
     *   <li>LLM 的输出当不可信入参：题号越界/重复/非数字一律丢弃，答案 trim 后为空视为没答，
     *       最终数组长度由服务端按 questions 实际题数固定，不由模型说了算；</li>
     *   <li>没归到任何一题的内容作为 leftover 原样回传，不静默丢弃。</li>
     * </ul>
     *
     * @param rawAnswer 用户一次性写下的整段回答
     * @throws IllegalStateException 会话还没有澄清问题，或 LLM 返回无法解析（这是用户主动点的动作，
     *                               失败要如实报错让他改用逐题填写，不能兜个空结果假装成功）
     */
    public AnswerDistribution distributeBatchAnswer(String sessionId, String rawAnswer) {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));

        List<String> questionTexts = parseQuestionTexts(session.getQuestions());
        if (questionTexts.isEmpty()) {
            throw new IllegalStateException("当前会话还没有澄清问题，无法分配回答");
        }

        StringBuilder userPrompt = new StringBuilder("【澄清问题清单】\n");
        for (int i = 0; i < questionTexts.size(); i++) {
            userPrompt.append(i + 1).append(". ").append(questionTexts.get(i)).append('\n');
        }
        userPrompt.append("\n【用户一次性写下的回答原文】\n").append(rawAnswer);

        String raw = agentRunner.runOnce(DISTRIBUTE_ANSWER_SYSTEM, userPrompt.toString(),
                session.getModel(), normalizeEngine(session.getEngine()));
        JsonNode node;
        try {
            node = mapper.readTree(stripFence(raw == null ? "" : raw.trim()));
        } catch (Exception e) {
            log.warn("[prd-clarify] 一次性回答分配结果解析失败 sessionId={}: {}", sessionId, e.getMessage());
            throw new IllegalStateException("AI 整理结果解析失败，请改用逐题填写", e);
        }

        // 模型给的题号一律当不可信入参校验：越界丢弃、重复保留首次、空答案视为没答
        String[] slots = new String[questionTexts.size()];
        for (JsonNode item : node.path("answers")) {
            int number = item.path("index").asInt(0);
            if (number < 1 || number > slots.length) {
                log.debug("[prd-clarify] 丢弃越界题号 {}（共 {} 题）", number, slots.length);
                continue;
            }
            String answer = item.path("answer").asText("").trim();
            if (answer.isEmpty() || slots[number - 1] != null) {
                continue;
            }
            slots[number - 1] = answer;
        }

        List<String> answers = new ArrayList<>(slots.length);
        List<Integer> unmatched = new ArrayList<>();
        int matched = 0;
        for (int i = 0; i < slots.length; i++) {
            if (slots[i] == null) {
                answers.add("");
                unmatched.add(i + 1);
            } else {
                answers.add(slots[i]);
                matched++;
            }
        }
        log.info("[prd-clarify] 一次性回答分配 sessionId={} 命中 {}/{} 题", sessionId, matched, slots.length);
        return new AnswerDistribution(answers, matched, unmatched, node.path("leftover").asText("").trim());
    }

    /** 从 questions JSON 里取出题目文本列表（顺序即题序）；解析失败/无问题时返回空列表。 */
    private List<String> parseQuestionTexts(String questionsJson) {
        if (questionsJson == null || questionsJson.isBlank()) {
            return List.of();
        }
        try {
            List<String> texts = new ArrayList<>();
            for (JsonNode node : mapper.readTree(questionsJson)) {
                texts.add(node.path("question").asText(""));
            }
            return texts;
        } catch (Exception e) {
            log.warn("[prd-clarify] questions JSON 解析失败: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * 批量澄清阶段：调 Claude 一次性生成 session.maxQuestions 个澄清问题（JSON），通过 SSE
     * 流式推出，完成后更新库。跟渐进模式（{@link #askNextQuestion}）并列的两种澄清方式，
     * 由前端在「开始澄清前确认」弹框里选。在虚拟线程中调用；Controller 直接返回 SseEmitter。
     */
    public void clarify(String sessionId, SseEmitter emitter) {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));

        // ERROR 会话允许从澄清阶段重试；开始执行时立即恢复状态并清掉上次错误。
        repo.updateStatus(sessionId, "CLARIFYING");
        repo.clearPrdQuestionsGeneratedAt(sessionId);

        Thread.ofVirtual().name("prd-clarify-").start(() -> {
            try {
                StringBuilder full = new StringBuilder();
                agentRunner.stream(
                        CLARIFY_SYSTEM,
                        buildClarifyPrompt(session),
                        session.getModel(),
                        normalizeEngine(session.getEngine()),
                        delta -> {
                            full.append(delta);
                            sendChunk(emitter, delta);
                        },
                        extractImagesFromRawInput(session.getRawInput()));

                // 解析 JSON，写回库
                String questionsJson = parseAndBuildQuestionsJson(full.toString());
                repo.updateGeneratedQuestions(sessionId, questionsJson);

                sendDone(emitter);
            } catch (Exception e) {
                log.warn("[prd-clarify] 澄清阶段失败 sessionId={}", sessionId, e);
                repo.updateError(sessionId, e.getMessage());
                sendError(emitter, e);
            }
        });
    }

    /**
     * 提交用户答案：将答案写入 questions JSON 后更新库。
     *
     * @param sessionId 会话 ID
     * @param answers   按问题序号（0-based）排列的答案列表
     */
    public PrdSession submitAnswers(String sessionId, List<String> answers) {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));

        if (!"CLARIFYING".equals(session.getStatus())) {
            throw new IllegalStateException("当前状态 " + session.getStatus() + " 不允许提交答案");
        }

        String updatedJson = mergeAnswers(session.getQuestions(), answers);
        repo.updateQuestions(sessionId, updatedJson);

        // 重新加载最新记录返回
        return repo.findById(sessionId).orElse(session);
    }

    // ═══════════════════════════════════════════════════
    // 多轮渐进式澄清：每题单独调 Claude，基于历史动态追问
    // ═══════════════════════════════════════════════════

    /**
     * 多轮澄清——请求下一个问题。
     *
     * <p>Claude 接收原始需求 + 已完成的问答历史，输出下一个最关键的澄清问题；
     * 若信息已足够，输出 {@code [CLARIFICATION_COMPLETE]}。
     * 前端收到 {@code done} 事件后根据文本内容决定继续问还是跳转生成 PRD。
     *
     * @param sessionId     会话 ID
     * @param questionIndex 当前是第几轮（0-based），用于告知 Claude 剩余轮数
     * @param history       已完成的问答历史
     * @param emitter       SSE 发射器（chunk/done/error）
     */
    public void askNextQuestion(String sessionId, int questionIndex,
                                List<QaPairRequest> history, SseEmitter emitter) {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));

        // 超过本会话设定的最大轮数（reqType 预填、用户可在开始澄清时调整）直接完成
        int maxQuestions = session.getMaxQuestions() > 0 ? session.getMaxQuestions() : 5;
        if (questionIndex >= maxQuestions) {
            try {
                emitter.send(SseEmitter.event().name("chunk")
                        .data(Map.of("content", "[CLARIFICATION_COMPLETE]")));
                emitter.send(SseEmitter.event().name("done").data("{}"));
                emitter.complete();
            } catch (Exception e) {
                emitter.completeWithError(e);
            }
            return;
        }

        // 需求类型优先于角色决定提问重点：Bug 修复走极简专用问题清单；
        // 其余类型（模块调整/新增模块）按角色（产品/业务）选择现有清单。
        String askSystem = REQ_TYPE_BUG_FIX.equals(session.getReqType())
                ? ASK_SYSTEM_BUG
                : "BUSINESS".equals(session.getRole()) ? ASK_SYSTEM_BUSINESS : ASK_SYSTEM_PRODUCT;

        Thread.ofVirtual().name("prd-ask-").start(() -> {
            try {
                agentRunner.stream(
                        askSystem,
                        buildAskUserPrompt(session, questionIndex, history),
                        session.getModel(),
                        normalizeEngine(session.getEngine()),
                        delta -> sendChunk(emitter, delta),
                        extractImagesFromRawInput(session.getRawInput()));
                sendDone(emitter);
            } catch (Exception e) {
                log.warn("[prd-clarify] askNextQuestion failed sessionId={}", sessionId, e);
                sendError(emitter, e);
            }
        });
    }

    /**
     * 多轮澄清完成后，将完整问答历史持久化到 {@code questions} 字段，以便 {@link #generate} 读取。
     */
    public PrdSession saveQaHistory(String sessionId, List<QaPairRequest> history) {
        repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));

        String questionsJson = buildQuestionsJson(history);
        repo.updateQuestions(sessionId, questionsJson);

        return repo.findById(sessionId).orElseThrow();
    }

    /**
     * 已进入生成/编辑阶段后回到需求澄清。保留现有 PRD 文件和问答历史，只恢复生命周期状态；
     * 这样误跳过澄清的会话无需删除重建，完成补充澄清后可在同一会话重新生成。
     */
    public PrdSession returnToClarify(String sessionId) {
        repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        repo.updateStatus(sessionId, "CLARIFYING");
        return repo.findById(sessionId).orElseThrow();
    }

    // ─────────────────────────────────────────────────

    /**
     * 生成/更新阶段：调 Claude 生成或增量更新 PRD Markdown，通过 SSE 流式推出，落盘后更新库。
     * 在虚拟线程中调用；Controller 直接返回 SseEmitter。
     *
     * @param extraInstructions update=true 时用户补充的本次更新说明（可选，null/空表示不追加）。
     * @param updateExisting    true = 基于当前已有 PRD 内容做增量更新——复用「生成修订版」
     *                          （PrdClarifyPage.tsx#handleReviseConfirm）同一套 GENERATE_SYSTEM_REVISION
     *                          system prompt 和 === 原版 PRD 内容 === / === 本次修订说明 === 输入格式
     *                          约定，区别是不新建会话、不走多轮澄清，原地覆盖同一份文件（旧版本先备份
     *                          为 {id}-v{n}.md，语义是"检出新版本"而不是静默覆盖）。当前无 PRD 内容
     *                          时退回从零生成，避免直接报错卡住用户。
     *                          false/null = 原有行为：按原始需求描述+澄清问答从零生成/覆盖。
     */
    public void generate(String sessionId, String extraInstructions, Boolean updateExisting, SseEmitter emitter) {
        generate(sessionId, extraInstructions, updateExisting, false, emitter);
    }

    /** 后台 PRD 生成：客户端断开后继续模型调用、版本备份和落盘。 */
    public void generate(String sessionId, String extraInstructions, Boolean updateExisting,
                         boolean continueOnDisconnect, SseEmitter emitter) {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));

        repo.updateStatus(sessionId, "GENERATING");
        boolean update = Boolean.TRUE.equals(updateExisting);

        Thread.ofVirtual().name("prd-generate-").start(() -> {
            AtomicBoolean clientConnected = new AtomicBoolean(true);
            try {
                String generateSystem;
                String prompt;
                String currentPrd = update ? fileStore.read(sessionId) : null;
                if (update && currentPrd != null && !currentPrd.isBlank()) {
                    generateSystem = isSpecDriven(session)
                            ? GENERATE_SYSTEM_SPEC_DRIVEN_UPDATE : GENERATE_SYSTEM_REVISION;
                    prompt = buildPrdUpdatePrompt(session, currentPrd, extraInstructions);
                } else {
                    if (update) {
                        log.info("[prd-clarify] 更新模式但当前无 PRD 内容，退回从零生成 sessionId={}", sessionId);
                    }
                    generateSystem = pickFreshGenerateSystem(session);
                    prompt = buildGeneratePrompt(session);
                    if (extraInstructions != null && !extraInstructions.isBlank()) {
                        prompt += "\n\n【用户在生成前补充的信息——请重点参考并纳入 PRD】\n"
                                + extraInstructions.trim();
                    }
                }

                StringBuilder full = new StringBuilder();
                agentRunner.stream(
                        generateSystem,
                        prompt,
                        session.getModel(),
                        normalizeEngine(session.getEngine()),
                        delta -> {
                            full.append(delta);
                            if (continueOnDisconnect) sendChunkBestEffort(emitter, delta, clientConnected);
                            else sendChunk(emitter, delta);
                        },
                        extractImagesFromRawInput((session.getRawInput() == null ? "" : session.getRawInput())
                                + "\n" + (extraInstructions == null ? "" : extraInstructions)));

                String prdContent = full.toString();
                java.nio.file.Path mdPath = fileStore.pathFor(sessionId);
                if (update) {
                    backupPrdIfExists(mdPath);
                }
                fileStore.write(sessionId, prdContent);
                repo.updateDone(sessionId, mdPath.toString());

                if (continueOnDisconnect) sendDoneBestEffort(emitter, clientConnected); else sendDone(emitter);
            } catch (Exception e) {
                log.warn("[prd-clarify] 生成阶段失败 sessionId={}", sessionId, e);
                repo.updateError(sessionId, e.getMessage());
                if (!continueOnDisconnect || clientConnected.get()) sendError(emitter, e);
            }
        });
    }

    /** 需求类型优先：Bug 修复固定走「缺陷修复说明」模板；否则按是否修订版（rawInput 以
     *  「【修订版 PRD」开头）选择——从零生成/覆盖场景（非增量更新）用。 */
    private String pickFreshGenerateSystem(PrdSession session) {
        if (isSpecDriven(session)) {
            return GENERATE_SYSTEM_SPEC_DRIVEN;
        }
        boolean isRevision = session.getRawInput() != null
                && session.getRawInput().startsWith("【修订版 PRD");
        return REQ_TYPE_BUG_FIX.equals(session.getReqType())
                ? GENERATE_SYSTEM_BUG
                : isRevision ? GENERATE_SYSTEM_REVISION : GENERATE_SYSTEM;
    }

    private boolean isSpecDriven(PrdSession session) {
        return DocumentProfile.SPEC_DRIVEN.name().equals(
                DocumentProfile.normalize(session.getDocumentProfile()));
    }

    /**
     * 「一键更新 PRD」的增量更新 prompt：跟「生成修订版」走同一套输入格式约定（=== 原版 PRD
     * 内容 === / === 本次修订说明 ===），配合 GENERATE_SYSTEM_REVISION 复用即可，不用再写一套
     * 新 system prompt。
     */
    private String buildPrdUpdatePrompt(PrdSession s, String currentPrd, String extraInstructions) {
        StringBuilder sb = new StringBuilder();
        sb.append("功能标题：").append(s.getTitle()).append("\n\n");
        sb.append("=== 原版 PRD 内容 ===\n").append(currentPrd).append("\n\n");
        sb.append("=== 本次修订说明 ===\n");
        sb.append(extraInstructions != null && !extraInstructions.isBlank()
                ? extraInstructions.trim()
                : "（未提供具体说明，请基于当前内容审视并适度完善，在「实现状态」章节标注哪些是本次调整）");
        sb.append('\n');
        return sb.toString();
    }

    /**
     * 覆盖 PRD 前，若旧版本已存在则备份为 {id}-v{n}.md（n 从已有备份中取最大值 + 1），
     * 跟开发文档 {@link #backupDevDocIfExists} 同一套命名/递增策略——「一键更新」在语义上是
     * "检出新版本"，不是静默覆盖丢失旧内容。备份失败只记警告，不阻断本次更新。
     */
    private void backupPrdIfExists(java.nio.file.Path mdPath) {
        if (!java.nio.file.Files.isRegularFile(mdPath)) {
            return;
        }
        try {
            String fileName = mdPath.getFileName().toString(); // {id}.md
            String baseName = fileName.substring(0, fileName.length() - 3); // {id}
            java.nio.file.Path dir = mdPath.getParent();
            List<Integer> backups = scanPrdBackupVersions(dir, baseName);
            int nextVersion = (backups.isEmpty() ? 0 : backups.get(backups.size() - 1)) + 1;
            java.nio.file.Path backupPath = mdPath.resolveSibling(baseName + "-v" + nextVersion + ".md");
            java.nio.file.Files.copy(mdPath, backupPath, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            log.info("[prd-clarify] PRD 旧版本已备份 path={}", backupPath);
        } catch (Exception e) {
            log.warn("[prd-clarify] PRD 备份失败（不阻断本次更新）: {}", e.getMessage());
        }
    }

    private List<Integer> scanPrdBackupVersions(java.nio.file.Path dir, String baseName) {
        if (dir == null || !java.nio.file.Files.isDirectory(dir)) {
            return List.of();
        }
        java.util.regex.Pattern versionPattern =
                java.util.regex.Pattern.compile(java.util.regex.Pattern.quote(baseName) + "-v(\\d+)\\.md");
        try (var files = java.nio.file.Files.list(dir)) {
            return files
                    .map(p -> versionPattern.matcher(p.getFileName().toString()))
                    .filter(java.util.regex.Matcher::matches)
                    .map(m -> Integer.parseInt(m.group(1)))
                    .sorted()
                    .toList();
        } catch (Exception e) {
            log.debug("[prd-clarify] 扫描 PRD 备份版本失败: {}", e.getMessage());
            return List.of();
        }
    }

    // ═══════════════════════════════════════════════════
    // 开发文档：由 PRD 转换生成的技术开发方案文档
    // ═══════════════════════════════════════════════════

    /**
     * 开发文档生成提示词。
     *
     * <p>执行平台统一的技术方案生成流程：
     * <ul>
     *   <li>代码库探索 — 探索相关代码库，读取现有实现
     *   <li>架构设计 — 设计技术实现方案，输出架构决策
     * </ul>
     * 本步骤将探索和设计产出汇总为符合平台固定章节契约的技术开发方案文档。
     */
    private static final String DEV_DOC_SYSTEM = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程，禁止进入交互）：
            本次执行代码库探索与架构设计，直接输出技术开发方案文档后结束。
            不得依赖某个引擎专属的命令、skill 或 plugin。

            ════════════════════════════════════════════════
            阶段一 — Codebase Exploration（代码库探索）
            ════════════════════════════════════════════════
            必须结合以下上下文理解现有代码库，再基于真实代码事实生成方案：

            1. mcp__domain-knowledge__search_knowledge（若可用）：
               → search_knowledge(query=需求关键词, project=项目名, module=模块名)
               → get_knowledge(id) 获取状态机/业务规则详情
               → 目的：确保方案与现有业务逻辑一致

            2. user prompt 中的【代码知识图谱查询结果】区块：系统已在调用你之前直接执行
               graphify CLI（`graphify query`，非 MCP 工具调用）查询该项目的代码知识图谱，
               区块内是真实 Java 类名、Service 方法、数据库表名
               → 目的：引用真实代码实体而非推测；区块为空说明该项目暂无图谱，忽略即可

            3. mcp__cross-topology__search_knowledge（若可用）：
               → search_knowledge(query=枚举值/接口路径关键词)
               → 获取枚举取值、API 路径约定
               → 目的：DDL/API 与现有规范保持一致

            以上上下文均缺失时：仅基于 PRD 生成，在文档中注明"未完成代码库探索"。

            ════════════════════════════════════════════════
            阶段二 — Architecture Design（架构设计）→ 输出技术开发方案文档
            ════════════════════════════════════════════════
            基于代码库探索结果和 PRD，直接输出 Markdown 技术开发方案文档：

            ## 技术方案概述
            分析实现路径，引用代码库探索获取的真实类名/接口/表名说明集成点。

            ## 数据库变更
            精确的 DDL/ALTER 语句（基于知识图谱确认的真实表名）：
            - 新建表用 CREATE TABLE IF NOT EXISTS（含注释）
            - 新增字段用 ALTER TABLE ADD COLUMN（幂等）

            ## API 接口设计
            新增或修改的 RESTful 接口，含请求/响应结构。

            ## 实现步骤（有序任务清单）
            具体到方法/类/组件级别（引用代码库探索获取的真实类名）：
            - [ ] 后端 — [ServiceName] 新增/修改 [methodName]：做什么
            - [ ] 前端 — [ComponentName]：做什么
            - [ ] 测试：关键验收点

            直接输出 Markdown，不加代码块围栏，不加解释前言。
            """;

    /**
     * 开发文档「更新」模式提示词：跟 {@link #DEV_DOC_SYSTEM}（从 PRD 从零生成）不同，
     * 这里是基于已存在的开发文档做增量更新——保留原文档已确认的结构和内容，
     * 只把用户描述的变更点合并进去，并标注每项状态，避免后续开发重复或遗漏改动。
     */
    private static final String DEV_DOC_SYSTEM_UPDATE = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程，禁止进入交互）：
            本次是基于已有开发文档的更新，直接输出更新后的完整技术开发方案文档后结束。

            你正在更新一份已存在的技术开发方案文档，不是从零生成。user prompt 会给你：
            1. 当前最新的 PRD 内容
            2. 当前已存在的开发文档全文（=== 当前开发文档 === 区域）
            3. 本次更新说明（=== 本次更新说明 === 区域，用户希望做的改动；可能为空，
               为空时结合 PRD 与当前开发文档的差异自行判断需要更新的地方）

            更新规则（严格执行）：
            - 章节结构与当前开发文档保持一致（技术方案概述/数据库变更/API接口设计/实现步骤），
              不要推倒重来，能沿用的内容原样保留
            - 「实现步骤」章节每一项标注状态前缀，让开发者一眼看出哪些已经不用管：
              ✅ 已完成 — 沿用原文档，本次不涉及
              🔄 需调整 — 原有步骤因本次更新需要修改，说明具体改动点
              🆕 新增 — 本次更新说明引入的新步骤
            - 若本次改动涉及新的代码事实，可参考 user prompt 中的【代码知识图谱查询结果】
              区块（系统已直接调用 graphify CLI 查询，非 MCP 工具调用），为空则忽略

            直接输出 Markdown，不加代码块围栏，不加多余解释。
            """;

    private static final String EXECUTION_PLAN_SYSTEM = """
            ⚠️ 直接输出任务：基于核心规格与真实代码上下文生成执行计划 Markdown，不进入交互。
            不得改写核心规格，也不得把推测当成代码事实。

            固定章节：
            # [功能名称] · 执行计划
            ## 1. 计划元信息
            ## 2. 规格追踪矩阵
            ## 3. 实现策略
            ## 4. 执行步骤
            ## 5. 验证计划
            ## 6. 风险与回退

            每个步骤使用稳定 ID PLAN-001 起，并用 specRefs 显式引用 GOAL/REQ/RULE/SCN/AC/
            CONSTRAINT ID；同时列出预计修改的真实类、接口、表或组件，以及可验证完成的证据。
            无法由代码图谱确认的位置标记“待定位”，禁止编造文件名。
            """;

    private static final String EXECUTION_PLAN_SYSTEM_UPDATE = """
            ⚠️ 直接输出任务：基于最新核心规格、当前执行计划与新证据，增量更新完整执行计划 Markdown。
            保留未变更 PLAN ID；同步新增或变化的 specRefs；已完成步骤保留并标记完成，失效步骤标记
            Superseded 且说明替代项。不得修改核心规格内容，不得编造代码位置。
            输出仍须符合执行计划的固定章节、PLAN ID 与 specRefs 契约。
            """;

    /** TDD 生成/更新前的澄清多轮上限，跟 PRD 澄清的 maxQuestions 是两个独立的概念。 */
    private static final int DEV_DOC_UPDATE_MAX_QUESTIONS = 5;

    /**
     * 首次/重新生成 TDD 前的技术澄清。PRD 已经确定业务目标，这里只核对编码前必须由开发者
     * 明确的关键技术决策；可以从代码或知识图谱确定、或开发者可自行安全选择的问题不得提问。
     */
    private static final String DEV_DOC_INITIAL_ASK_SYSTEM = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            本次是 TDD 生成前的技术澄清，每轮只输出 1 个精准问题（或 [CLARIFICATION_COMPLETE]）。

            user prompt 会提供正式 PRD、代码知识图谱、业务知识图谱、用户补充约束和历史问答。
            先用这些事实自行消除疑问，只把“若不由开发者明确，TDD 会产生不同实现结果或带来
            兼容/数据/安全风险”的内容做成问题卡片。

            可提问范围：
            - 既有 API/事件/数据结构的兼容策略与迁移方式
            - 数据一致性、幂等、事务边界、并发冲突和失败补偿
            - 权限、安全、审计、性能容量等会改变实现方案的硬约束
            - 多种实现路径会影响现有代码边界时，需要开发者选择的关键方案

            禁止提问：
            - PRD 已确认的业务目标、范围、流程或验收口径
            - 代码/知识图谱里已有明确答案的问题
            - 命名、目录、普通类拆分、局部写法等开发者可以自行决定的细枝末节
            - “是否还有补充”“想用什么技术”等宽泛问题

            提问规则（严格执行）：
            - 每次只问 1 个问题，并给出从 PRD/图谱发现的具体冲突或选择背景
            - 问题必须让开发者能给出明确选项、规则或数值，不能泛泛讨论
            - 若编码关键细节都能从现有事实确定，直接输出 [CLARIFICATION_COMPLETE]
            - 最多 5 轮；不要为了凑轮数硬问
            - 只输出问题本身（或 [CLARIFICATION_COMPLETE]），不加序号、前缀或解释
            """;

    /**
     * 已有 TDD 增量更新前的技术澄清。
     */
    private static final String DEV_DOC_UPDATE_ASK_SYSTEM = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            本次是已有 TDD 更新前的技术澄清，每轮只输出 1 个精准问题（或 [CLARIFICATION_COMPLETE]）。

            user prompt 会给出当前 TDD、最新 PRD、代码/业务知识图谱、更新说明和历史问答。
            找出本次更新相对当前 TDD 会导致实现分歧，且必须由开发者明确的关键技术决策，例如：
            兼容旧调用方、字段迁移/默认值、事务与幂等、异常补偿、权限与性能硬约束。

            提问规则（严格执行）：
            - 每次只问 1 个问题，具体引用当前 TDD 或图谱中的真实接口、表、方法或约束
            - 不问已有答案、跟本次更新无关、或开发者可自行安全决定的普通实现细节
            - 若更新说明已经足够明确且不会产生关键实现分歧，
              直接输出 [CLARIFICATION_COMPLETE]，不要为了凑轮数硬问
            - 最多 5 轮
            - 只输出问题本身（或 [CLARIFICATION_COMPLETE]），不加序号、前缀或解释
            """;

    /** TDD 技术澄清批量模式：一次生成全部问题，供卡片表单集中回答。 */
    private static final String DEV_DOC_BATCH_ASK_SYSTEM = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            本次是 TDD 生成或更新前的批量技术澄清。一次性找出全部必须由开发者明确的关键技术决策，
            最多 5 个；不要逐题追问，也不要为了凑数量制造问题。

            user prompt 会提供正式 PRD、代码知识图谱、业务知识图谱，以及在更新模式下的当前 TDD。
            先使用已有事实自行消除疑问。只有缺少答案会导致不同实现结果，或带来兼容、数据、
            安全、事务、幂等、性能风险时才提问。

            可提问范围：
            - 既有 API、事件、数据结构的兼容与迁移策略
            - 数据一致性、事务边界、并发冲突、幂等及失败补偿
            - 权限、安全、审计、容量和性能方面的硬约束
            - 会实质改变现有代码边界的关键实现方案选择

            禁止提问：
            - PRD 已确认的业务目标、范围、流程或验收口径
            - 代码或知识图谱已有明确答案的事实
            - 命名、目录、普通类拆分、局部写法等可安全自行决定的细节
            - “是否还有补充”“想用什么技术”等宽泛问题

            严格只输出 JSON 数组，不加 Markdown 围栏、前言或解释：
            [{"id":1,"question":"问题文本"},{"id":2,"question":"问题文本"}]
            每个问题必须包含具体背景，并能用明确选项、规则或数值回答。按风险和阻塞程度排序。
            如果现有信息已经足够，输出空数组 []。
            """;

    /**
     * 工时评估系统 prompt：基于 PRD + 开发文档（+ 可选的代码/业务知识图谱查询结果）估算开发工时。
     * 严格要求单行/纯 JSON 输出，便于确定性解析；解析失败时上层直接报错让用户重试（不像
     * {@link #classifyReqType} 那样静默兜底——这是用户主动点按钮触发的动作，兜底出一个随意数字
     * 反而会误导，不如明确告知失败）。
     */
    private static final String EFFORT_ESTIMATE_SYSTEM = """
            你是熟练使用 Codex / Claude Code 的资深工程师，需要基于 PRD、TDD 和现有代码，
            评估「由所选 Code Agent 主导编码」完成这个需求所需的有效人机协作工时，单位统一用「小时」。

            评估依据（按优先级）：
            1. 开发文档里列出的改动范围——新增/调整的模块、接口、表结构、前后端工作量，是主要依据
            2. 若提供了【代码知识图谱查询结果】：参考其中揭示的既有代码复杂度/依赖广度，
               依赖越广、既有实现越复杂，估时应适当上浮
            3. 若提供了【业务知识图谱查询结果】：参考其中沉淀的业务规则复杂度（如涉及的计价公式、
               状态机、跨系统一致性要求），规则越复杂，估时应适当上浮
            4. 若提供了【补充上下文】（如团队人力、技术栈熟悉度）：按其调整整体估时
            5. 若允许读取本地项目：只读搜索最相关的 3-8 个关键文件，核对既有模式、测试和改动边界后立即估算；
               不要为了穷尽仓库而大范围遍历。严禁修改文件、执行写命令或访问网络

            估算口径：
            - Code Agent 负责方案落地、主要代码编写、测试代码生成和常规修复；人负责下达任务、业务判断、
              运行验证、审查与必要纠偏。不要按人工逐行编码或传统人日口径估算
            - 包含 Agent 编码等待、提示与纠偏、单元/集成测试、联调、自测、Code Review 修正的有效协作工时
            - 不包含排队等待、发布窗口等纯日历等待时间
            - 对成熟项目中的既有模式和组件复用应显著降低编码时间；数据迁移、外部系统联调、
              难以自动验证的业务规则仍需保留风险缓冲
            - 默认是一名熟悉 Code Agent 工作流的工程师操作，不要乘以团队人数

            输出要求（严格执行）：
            - 只输出一个 JSON 对象，不要 markdown 代码块围栏、不要任何解释性文字
            - 给出区间 hoursMin ~ hoursMax（而非单一数字），区间宽度反映不确定性，
              不确定性越高区间越宽
            - confidence 取 LOW/MEDIUM/HIGH，反映你对这次估算的信心
              （PRD/开发文档信息越完整、图谱命中越多，信心越高）
            - breakdown 按开发文档里的功能点/模块拆解，3-8 项为宜，不要拆得过细，
              每项给出预估小时数（单一数字，不需要再给区间）
            - reasoning 用 2-4 句话说明整体评估依据
            - inspectedFiles 只列出本次真正读取/搜索命中的关键相对路径，最多 8 个；未读取代码则为空数组
            - codeEvidenceSummary 用一句话概括代码核查证据；未找到项目或未命中时必须如实说明
            - assumptions 与 risks 各列 0-5 条会显著影响估算的事实

            JSON 结构：
            {"hoursMin":数字,"hoursMax":数字,"confidence":"LOW|MEDIUM|HIGH","reasoning":"...","breakdown":[{"item":"...","hours":数字}],"inspectedFiles":["..."],"codeEvidenceSummary":"...","assumptions":["..."],"risks":["..."]}
            """;

    /** 仅在Code Agent最终输出仍没有可提取JSON时使用，不重新估算，只整理已有结果。 */
    private static final String EFFORT_JSON_REPAIR_SYSTEM = """
            你是 JSON 格式整理器。用户会提供一段 Code Agent 的工时评估输出，其中可能混有工具调用说明、
            分析文字或 Markdown 围栏。只提取已有的最终工时结论并整理为一个 JSON 对象；不得重新估算、
            不得修改数字或添加新事实。只输出 JSON，不要解释。必须包含 hoursMin、hoursMax、confidence、
            reasoning、breakdown、inspectedFiles、codeEvidenceSummary、assumptions、risks。
            """;

    private static final String CODE_EVIDENCE_VERIFIED = "<!-- CODE_EVIDENCE_STATUS: VERIFIED -->";
    private static final String CODE_EVIDENCE_INSUFFICIENT = "<!-- CODE_EVIDENCE_STATUS: INSUFFICIENT -->";

    /**
     * 进度评估系统 prompt：基于 PRD + 开发文档（业务/技术事实来源，不改写、不复制），通过
     * 标准 URL、Graphify 和源码读取链路核对真实实现，产出固定大纲的 Markdown 进度报告。
     * "平台文档管理事实来源、评估报告是可重复生成的派生产物"这个分工——报告本身按版本追加
     * 落盘（见 {@link #evaluateProgress}），不覆盖旧报告。
     */
    private static final String PROGRESS_EVAL_SYSTEM = """
            你是资深技术负责人，需要基于 PRD 和开发文档，核对代码库的实际实现进度，
            产出一份大纲固定的进度评估报告。

            评估依据（按优先级）：
            1. 开发文档列出的改动范围/任务清单，是核对进度的基准——文档里每一项都要给出结论
            2. 必须先调用 source_context，使用需求中的 URL、项目模块和完整问题执行 URL 路由定位与
               Graphify 收敛；随后对候选文件调用 source_read，核对页面、接口、业务逻辑、数据访问和测试
            3. 从源码发现新的类名、方法名或 SQL ID 后，再调用 source_context 反问图谱；只有候选证据仍
               不足时，才允许在明确子目录调用 source_search，禁止从项目根目录搜索
            4. Graphify 只用于结构导航，不能单独证明功能已实现；已完成、部分完成和未完成都必须以
               source_read 读到的真实文件内容为依据
            5. 若提供了【业务知识图谱查询结果】：核对业务规则/状态机是否与代码一致
            6. 若提供了【补充上下文】（如"重点核对xxx"）：按其调整核对重点

            证据保护：
            - 成功读取与需求相关的源码后，在报告标题下输出系统指定的“已核查”证据标记
            - source_context/source_read 不可用、未定位到相关源码或只得到公共库噪声时，输出系统指定的
              “证据不足”标记；此时保留三个进度章节但不要添加任何清单项，在“文档与代码差异”中说明
              待校准，禁止把证据不足判定为未完成或 0%

            输出要求（严格执行，章节标题和顺序不变，用 {功能名称} 替换成需求标题）：

            # {功能名称} 开发进度评估

            ## 文档版本
            简要说明本次评估基于的 PRD/开发文档现状（如"开发文档已是最新版本"或"PRD 有更新但
            开发文档尚未同步"），不需要精确版本号。

            ## 已完成
            每项格式：
            - [x] 功能点描述
              - 证据：类名.方法名 / 文件路径（必须引用 source_read 实际读取过的文件）

            ## 部分完成
            每项格式：
            - [~] 功能点描述
              - 已实现：...
              - 缺失：...

            ## 未完成
            每项格式：
            - [ ] 功能点描述
              - 开发文档要求：...
              - 当前代码：经 source_read 核对后的实际现状

            ## 文档与代码差异
            用 Markdown 表格：| 需求 | 文档要求 | 当前代码 | 状态 |

            绝不能编造不存在的类名、方法名或文件路径。直接输出 Markdown，不加代码块围栏，不加多余解释。
            """;

    /** TDD 生成/更新前的多轮技术澄清——请求下一个必须由开发者明确的问题。 */
    public void askNextDevDocQuestion(String sessionId, int questionIndex,
                                       List<QaPairRequest> history, String updateNotes,
                                       String mode,
                                       SseEmitter emitter) {
        List<QaPairRequest> effectiveHistory = history == null ? List.of() : history;
        if (questionIndex >= DEV_DOC_UPDATE_MAX_QUESTIONS) {
            try {
                emitter.send(SseEmitter.event().name("chunk")
                        .data(Map.of("content", "[CLARIFICATION_COMPLETE]")));
                emitter.send(SseEmitter.event().name("done").data("{}"));
                emitter.complete();
            } catch (Exception e) {
                emitter.completeWithError(e);
            }
            return;
        }

        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));

        Thread.ofVirtual().name("prd-dev-doc-ask-").start(() -> {
            try {
                boolean update = "update".equalsIgnoreCase(mode);
                String prdContent = fileStore.read(sessionId);
                if (prdContent == null || prdContent.isBlank()) {
                    throw new IllegalStateException("PRD 内容为空，请先完成 PRD");
                }
                String currentDevDoc = update ? readDevDocContent(sessionId) : null;
                if (update && (currentDevDoc == null || currentDevDoc.isBlank())) {
                    throw new IllegalStateException("当前 TDD 内容为空，无法执行增量更新澄清");
                }
                String userPrompt = buildDevDocAskPrompt(
                        session, prdContent, currentDevDoc, updateNotes, questionIndex, effectiveHistory, update);
                String systemPrompt = update ? DEV_DOC_UPDATE_ASK_SYSTEM : DEV_DOC_INITIAL_ASK_SYSTEM;
                agentRunner.stream(systemPrompt, userPrompt, session.getModel(),
                        normalizeEngine(session.getEngine()),
                        delta -> sendChunk(emitter, delta));
                sendDone(emitter);
            } catch (Exception e) {
                log.warn("[prd-clarify] askNextDevDocQuestion failed sessionId={}", sessionId, e);
                sendError(emitter, e);
            }
        });
    }

    /** TDD 生成/更新前的批量技术澄清——一次模型调用生成全部问题。 */
    public void generateDevDocQuestions(String sessionId, String updateNotes, String mode,
                                        Boolean background, SseEmitter emitter) {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        boolean continueOnDisconnect = Boolean.TRUE.equals(background);
        repo.updateDevDocQaDraft(sessionId, null);
        repo.updateDevDocQuestionsGeneratedAt(sessionId, null);
        repo.updateDevDocWorkStatus(sessionId, "BUILDING_QUESTIONS", null);

        Thread.ofVirtual().name("prd-dev-doc-questions-").start(() -> {
            AtomicBoolean clientConnected = new AtomicBoolean(true);
            try {
                boolean update = "update".equalsIgnoreCase(mode);
                String prdContent = fileStore.read(sessionId);
                if (prdContent == null || prdContent.isBlank()) {
                    throw new IllegalStateException("PRD 内容为空，请先完成 PRD");
                }
                String currentDevDoc = update ? readDevDocContent(sessionId) : null;
                if (update && (currentDevDoc == null || currentDevDoc.isBlank())) {
                    throw new IllegalStateException("当前 TDD 内容为空，无法执行增量更新澄清");
                }
                String userPrompt = buildDevDocContextPrompt(
                        session, prdContent, currentDevDoc, updateNotes, List.of(), update)
                        .append("请一次性输出全部关键技术澄清问题（最多 ")
                        .append(DEV_DOC_UPDATE_MAX_QUESTIONS)
                        .append(" 个），没有问题时输出 []。")
                        .toString();
                StringBuilder full = new StringBuilder();
                agentRunner.stream(DEV_DOC_BATCH_ASK_SYSTEM, userPrompt, session.getModel(),
                        normalizeEngine(session.getEngine()),
                        delta -> {
                            full.append(delta);
                            if (continueOnDisconnect) sendChunkBestEffort(emitter, delta, clientConnected);
                            else sendChunk(emitter, delta);
                        });
                String questionsJson = parseDevDocQuestionsJson(full.toString());
                repo.updateDevDocQaDraft(sessionId, questionsJson);
                repo.updateDevDocQuestionsGeneratedAt(sessionId, System.currentTimeMillis());
                repo.updateDevDocWorkStatus(sessionId, "AWAITING_ANSWERS", null);
                if (continueOnDisconnect) sendDoneBestEffort(emitter, clientConnected); else sendDone(emitter);
            } catch (Exception e) {
                log.warn("[prd-clarify] generateDevDocQuestions failed sessionId={}", sessionId, e);
                repo.updateDevDocWorkStatus(sessionId, "ERROR", e.getMessage());
                if (!continueOnDisconnect || clientConnected.get()) sendError(emitter, e);
            }
        });
    }

    /** 构建 TDD 技术澄清上下文：PRD + 图谱事实 + 可选当前 TDD/补充约束 + 历史问答。 */
    private String buildDevDocAskPrompt(PrdSession session, String prdContent, String currentDevDoc,
                                         String updateNotes, int questionIndex,
                                         List<QaPairRequest> history, boolean update) {
        StringBuilder sb = buildDevDocContextPrompt(
                session, prdContent, currentDevDoc, updateNotes, history, update);
        int remaining = DEV_DOC_UPDATE_MAX_QUESTIONS - questionIndex;
        sb.append("这是第 ").append(questionIndex + 1).append(" 个问题（最多 ")
                .append(DEV_DOC_UPDATE_MAX_QUESTIONS).append(" 轮，还可以最多再问 ")
                .append(remaining - 1).append(" 个）。\n");
        sb.append("请提出下一个最关键的澄清问题，或输出 [CLARIFICATION_COMPLETE]：");
        return sb.toString();
    }

    private StringBuilder buildDevDocContextPrompt(PrdSession session, String prdContent,
                                                     String currentDevDoc, String updateNotes,
                                                     List<QaPairRequest> history, boolean update) {
        StringBuilder sb = new StringBuilder();
        sb.append("需求标题：").append(session.getTitle()).append("\n");
        appendGraphContext(sb, queryGraphContext(session.getProject(), session.getModule(), session.getTitle()));
        appendDomainContext(sb, queryDomainContext(session.getProject(), session.getTitle()));
        sb.append("\n=== 已确认 PRD ===\n\n").append(prdContent).append("\n\n");
        if (update) {
            sb.append("=== 当前 TDD ===\n\n").append(currentDevDoc).append("\n\n");
        }
        sb.append(update ? "=== 本次更新说明 ===\n\n" : "=== 开发者补充约束 ===\n\n");
        sb.append((updateNotes == null || updateNotes.isBlank()) ? "（未填写）" : updateNotes.trim());
        sb.append("\n\n");

        if (!history.isEmpty()) {
            sb.append("已完成的澄清问答（").append(history.size()).append("轮）：\n");
            for (var qa : history) {
                sb.append("问：").append(qa.question()).append("\n");
                sb.append("答：").append(qa.answer()).append("\n\n");
            }
        }
        return sb;
    }

    /**
     * 生成/更新开发文档。
     * 通过 SSE 流式推出，完成后落盘到 {id}-dev.md（若已有旧版本，落盘前先备份为
     * {id}-dev-v{n}.md，"检出新版本"不会丢掉上一版内容）。
     *
     * @param extraInstructions 用户在弹框里补充的开发约束/更新说明（可选，null/空则不追加）。
     * @param updateExisting    true = 基于当前已有开发文档做增量更新（{@link #DEV_DOC_SYSTEM_UPDATE}）；
     *                          false/null = 从 PRD 从零生成/覆盖（{@link #DEV_DOC_SYSTEM}，原有行为）
     * @param qaHistory         本次 TDD 生成/更新前的技术澄清问答，结构化持久化进生成记录，
     *                          与 PRD 业务澄清（session.questions）分开。
     * @param clarificationCompleted 是否已经走完 TDD 澄清关卡；即使 AI 判断无需提问也必须为 true
     */
    public void generateDevDoc(String sessionId, String extraInstructions, Boolean updateExisting,
                                List<QaPairRequest> qaHistory, Boolean clarificationCompleted,
                                Boolean background,
                                SseEmitter emitter) {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        if (!Boolean.TRUE.equals(clarificationCompleted)) {
            throw new IllegalStateException("请先完成 TDD 技术澄清，再生成开发文档");
        }
        boolean update = Boolean.TRUE.equals(updateExisting);
        boolean continueOnDisconnect = Boolean.TRUE.equals(background);
        List<QaPairRequest> effectiveQaHistory = qaHistory == null ? List.of() : qaHistory;
        // 用户点击提交时立即暂存。生成失败、浏览器刷新或网络断开后仍能恢复，不再把答案绑在成功落盘上。
        repo.updateDevDocQaDraft(sessionId, buildQuestionsJson(effectiveQaHistory));
        repo.updateDevDocWorkStatus(sessionId, "GENERATING", null);
        // mode 用于追溯历史记录：generate=首次生成，regenerate=从最新 PRD 从零覆盖，
        // update=基于当前开发文档增量更新
        boolean hadExistingDoc = session.getDevDocPath() != null && !session.getDevDocPath().isBlank();
        String mode = update ? "update" : (hadExistingDoc ? "regenerate" : "generate");

        Thread.ofVirtual().name("prd-dev-doc-").start(() -> {
            AtomicBoolean clientConnected = new AtomicBoolean(true);
            try {
                sendDevDocProgress(emitter, "正在准备 PRD、技术澄清与知识图谱上下文",
                        continueOnDisconnect, clientConnected);
                // 读取已有 PRD 内容作为输入
                String prdContent = fileStore.read(sessionId);
                if (prdContent == null || prdContent.isBlank()) {
                    repo.updateDevDocWorkStatus(sessionId, "ERROR", "PRD 内容为空，请先生成 PRD");
                    sendError(emitter, new IllegalStateException("PRD 内容为空，请先生成 PRD"));
                    return;
                }

                String devDocSystem;
                String userPrompt;
                if (update) {
                    String currentDevDoc = readDevDocContent(sessionId);
                    if (currentDevDoc == null || currentDevDoc.isBlank()) {
                        // 没有可更新的基础，退回从零生成，避免直接报错卡住用户
                        log.info("[prd-clarify] 更新模式但当前无开发文档，退回从零生成 sessionId={}", sessionId);
                        devDocSystem = isSpecDriven(session) ? EXECUTION_PLAN_SYSTEM : DEV_DOC_SYSTEM;
                        userPrompt = buildDevDocPrompt(
                                session, prdContent, extraInstructions, effectiveQaHistory);
                    } else {
                        devDocSystem = isSpecDriven(session)
                                ? EXECUTION_PLAN_SYSTEM_UPDATE : DEV_DOC_SYSTEM_UPDATE;
                        userPrompt = buildDevDocUpdatePrompt(session, prdContent, currentDevDoc, extraInstructions, effectiveQaHistory);
                    }
                } else {
                    devDocSystem = isSpecDriven(session) ? EXECUTION_PLAN_SYSTEM : DEV_DOC_SYSTEM;
                    userPrompt = buildDevDocPrompt(
                            session, prdContent, extraInstructions, effectiveQaHistory);
                }

                StringBuilder full = new StringBuilder();
                sendDevDocProgress(emitter, "codex".equalsIgnoreCase(session.getEngine())
                        ? "Codex 正在生成开发文档，首段内容可能需要稍候"
                        : "Claude 正在生成开发文档", continueOnDisconnect, clientConnected);
                agentRunner.stream(devDocSystem, userPrompt, session.getModel(),
                        normalizeEngine(session.getEngine()), delta -> {
                    full.append(delta);
                    if (continueOnDisconnect) {
                        sendChunkBestEffort(emitter, delta, clientConnected);
                    } else {
                        sendChunk(emitter, delta);
                    }
                }, extractImagesFromRawInput((session.getRawInput() == null ? "" : session.getRawInput())
                        + "\n" + (extraInstructions == null ? "" : extraInstructions)));

                // 落盘到 ~/.kai-toolbox/prd/{id}-dev.md（与 PRD 文件同目录，由系统统一管理）。
                sendDevDocProgress(emitter, "内容生成完成，正在保存开发文档",
                        continueOnDisconnect, clientConnected);
                // 覆盖前若旧版本已存在，先备份为 {id}-dev-v{n}.md——"检出新版本"不丢旧内容。
                String devDocContent = full.toString();
                java.nio.file.Path devDocPath = java.nio.file.Path.of(
                        fileStore.pathFor(sessionId).toString().replace(".md", "-dev.md"));
                backupDevDocIfExists(devDocPath);
                java.nio.file.Files.writeString(
                        devDocPath, devDocContent,
                        java.nio.charset.StandardCharsets.UTF_8,
                        java.nio.file.StandardOpenOption.CREATE,
                        java.nio.file.StandardOpenOption.TRUNCATE_EXISTING);
                repo.updateDevDocPath(sessionId, devDocPath.toString());
                repo.updateDevDocGeneratedAt(sessionId, System.currentTimeMillis());
                recordDevDocHistory(
                        sessionId, session.getDevDocHistory(), mode, extraInstructions, effectiveQaHistory, true);
                repo.updateDevDocQaDraft(sessionId, null);
                repo.updateDevDocWorkStatus(sessionId, "DONE", null);
                log.info("[prd-clarify] 开发文档已保存 path={} mode={}", devDocPath, mode);

                if (continueOnDisconnect) sendDoneBestEffort(emitter, clientConnected); else sendDone(emitter);
            } catch (Exception e) {
                log.warn("[prd-clarify] 开发文档生成失败 sessionId={}", sessionId, e);
                repo.updateDevDocWorkStatus(sessionId, "ERROR", e.getMessage());
                if (!continueOnDisconnect || clientConnected.get()) sendError(emitter, e);
            }
        });
    }

    /**
     * 追加一条开发文档生成历史记录（JSON 数组整体读出、追加、写回）。version 从 1 递增，
     * 与磁盘上 {@link #backupDevDocIfExists} 备份出的 {id}-dev-v{version}.md 大致对应
     * （两者独立维护、都从各自的起点递增，正常使用下天然保持一致；仅历史记录本身失败时
     * 只记警告，不影响本次生成已经成功落盘的结果）。
     */
    private void recordDevDocHistory(String sessionId, String existingHistoryJson, String mode,
                                      String extraInstructions, List<QaPairRequest> qaHistory,
                                      boolean clarificationCompleted) {
        try {
            ArrayNode arr;
            JsonNode existing = (existingHistoryJson == null || existingHistoryJson.isBlank())
                    ? null : mapper.readTree(existingHistoryJson);
            arr = (existing instanceof ArrayNode existingArr) ? existingArr : mapper.createArrayNode();

            ObjectNode entry = mapper.createObjectNode();
            entry.put("version", arr.size() + 1);
            entry.put("mode", mode);
            entry.put("extraInstructions", extraInstructions == null ? "" : extraInstructions);
            entry.put("generatedAt", System.currentTimeMillis());
            entry.put("clarificationCompleted", clarificationCompleted);
            ArrayNode qaArr = mapper.createArrayNode();
            for (QaPairRequest qa : qaHistory) {
                ObjectNode qaNode = mapper.createObjectNode();
                qaNode.put("question", qa.question());
                qaNode.put("answer", qa.answer());
                qaArr.add(qaNode);
            }
            entry.set("qaHistory", qaArr);
            arr.add(entry);

            repo.updateDevDocHistory(sessionId, mapper.writeValueAsString(arr));
        } catch (Exception e) {
            log.warn("[prd-clarify] 记录开发文档生成历史失败（不影响本次生成结果）: {}", e.getMessage());
        }
    }

    /** 读取开发文档内容。 */
    public String readDevDocContent(String sessionId) throws java.io.IOException {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        if (session.getDevDocPath() == null || session.getDevDocPath().isBlank()) {
            return "";
        }
        java.nio.file.Path path = java.nio.file.Path.of(session.getDevDocPath());
        if (!java.nio.file.Files.exists(path)) return "";
        return java.nio.file.Files.readString(path, java.nio.charset.StandardCharsets.UTF_8);
    }

    /**
     * 读取开发文档某个历史版本的内容。version 对应磁盘上实际存在的版本号（见
     * {@link #listDevDocVersions}）：等于当前版本号时读当前 {id}-dev.md，
     * 否则读磁盘上备份的 {id}-dev-v{version}.md（由 {@link #backupDevDocIfExists} 在每次
     * 覆盖前生成）。版本号非法或备份文件缺失时返回空字符串，不抛异常，前端据此提示不可查看。
     */
    public String readDevDocVersionContent(String sessionId, int version) throws java.io.IOException {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        if (version <= 0) {
            return "";
        }
        DevDocLocation loc = resolveDevDocLocation(session);
        if (loc == null) {
            return "";
        }
        List<Integer> backups = scanDevDocBackupVersions(loc);
        int currentVersion = (backups.isEmpty() ? 0 : backups.get(backups.size() - 1)) + 1;
        if (version == currentVersion) {
            return readDevDocContent(sessionId);
        }
        if (!backups.contains(version)) {
            return "";
        }
        java.nio.file.Path backupPath = loc.dir().resolve(loc.baseName() + "-v" + version + ".md");
        if (!java.nio.file.Files.exists(backupPath)) {
            return "";
        }
        return java.nio.file.Files.readString(backupPath, java.nio.charset.StandardCharsets.UTF_8);
    }

    /**
     * 列出该会话开发文档的所有版本摘要，供「生成记录」抽屉展示。
     *
     * <p>以磁盘上实际存在的备份文件为准（而非 {@code dev_doc_history} JSON，见
     * {@link DevDocVersionSummary} 类注释解释为什么）——JSON 记录只是用来给扫出的版本
     * 补充 mode/补充说明/生成时间，缺失时该版本仍会出现在列表里，只是这几项为 null。</p>
     */
    public List<DevDocVersionSummary> listDevDocVersions(String sessionId) {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        DevDocLocation loc = resolveDevDocLocation(session);
        if (loc == null) {
            return List.of();
        }
        List<Integer> backups = scanDevDocBackupVersions(loc);
        int currentVersion = (backups.isEmpty() ? 0 : backups.get(backups.size() - 1)) + 1;

        Map<Integer, JsonNode> historyByVersion = new java.util.HashMap<>();
        try {
            String historyJson = session.getDevDocHistory();
            if (historyJson != null && !historyJson.isBlank()) {
                JsonNode arr = mapper.readTree(historyJson);
                if (arr.isArray()) {
                    for (JsonNode node : arr) {
                        historyByVersion.put(node.path("version").asInt(-1), node);
                    }
                }
            }
        } catch (Exception e) {
            log.debug("[prd-clarify] 解析 devDocHistory 失败（不影响版本列表展示）: {}", e.getMessage());
        }

        List<Integer> allVersions = new ArrayList<>(backups);
        allVersions.add(currentVersion);

        List<DevDocVersionSummary> result = new ArrayList<>();
        for (int v : allVersions) {
            JsonNode h = historyByVersion.get(v);
            Long generatedAt = h != null ? h.path("generatedAt").asLong()
                    : (v == currentVersion ? session.getDevDocGeneratedAt() : null);
            List<QaPairRequest> qaHistory = List.of();
            if (h != null && h.path("qaHistory").isArray()) {
                List<QaPairRequest> parsed = new ArrayList<>();
                for (JsonNode qaNode : h.path("qaHistory")) {
                    parsed.add(new QaPairRequest(qaNode.path("question").asText(""), qaNode.path("answer").asText("")));
                }
                qaHistory = parsed;
            }
            result.add(new DevDocVersionSummary(
                    v,
                    v == currentVersion,
                    h != null ? h.path("mode").asText(null) : null,
                    h != null ? h.path("extraInstructions").asText("") : null,
                    generatedAt,
                    qaHistory));
        }
        result.sort(java.util.Comparator.comparingInt(DevDocVersionSummary::version).reversed());
        return result;
    }

    /** 开发文档所在目录 + 文件名前缀（{id}-dev），供备份/版本枚举/读取共用。 */
    private record DevDocLocation(java.nio.file.Path dir, String baseName) {}

    /** 解析当前会话开发文档的存放位置；尚未生成过开发文档时返回 null。 */
    private DevDocLocation resolveDevDocLocation(PrdSession session) {
        if (session.getDevDocPath() == null || session.getDevDocPath().isBlank()) {
            return null;
        }
        java.nio.file.Path currentPath = java.nio.file.Path.of(session.getDevDocPath());
        String fileName = currentPath.getFileName().toString(); // {id}-dev.md
        String baseName = fileName.substring(0, fileName.length() - 3); // {id}-dev
        java.nio.file.Path dir = currentPath.getParent();
        return dir == null ? null : new DevDocLocation(dir, baseName);
    }

    /** 扫描磁盘，返回该会话开发文档所有已存在的备份版本号（不含当前版本），从小到大排序。 */
    private List<Integer> scanDevDocBackupVersions(DevDocLocation loc) {
        if (loc == null || !java.nio.file.Files.isDirectory(loc.dir())) {
            return List.of();
        }
        java.util.regex.Pattern versionPattern =
                java.util.regex.Pattern.compile(java.util.regex.Pattern.quote(loc.baseName()) + "-v(\\d+)\\.md");
        try (var files = java.nio.file.Files.list(loc.dir())) {
            return files
                    .map(p -> versionPattern.matcher(p.getFileName().toString()))
                    .filter(java.util.regex.Matcher::matches)
                    .map(m -> Integer.parseInt(m.group(1)))
                    .sorted()
                    .toList();
        } catch (Exception e) {
            log.debug("[prd-clarify] 扫描开发文档备份版本失败: {}", e.getMessage());
            return List.of();
        }
    }

    /** 保存开发文档（用户编辑后）。 */
    public void saveDevDocContent(String sessionId, String content) throws java.io.IOException {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        String devDocPath = session.getDevDocPath();
        if (devDocPath == null || devDocPath.isBlank()) {
            // 首次保存时自动创建路径
            devDocPath = fileStore.pathFor(sessionId).toString().replace(".md", "-dev.md");
            repo.updateDevDocPath(sessionId, devDocPath);
        }
        backupDevDocIfExists(java.nio.file.Path.of(devDocPath));
        java.nio.file.Files.writeString(
                java.nio.file.Path.of(devDocPath), content,
                java.nio.charset.StandardCharsets.UTF_8,
                java.nio.file.StandardOpenOption.CREATE,
                java.nio.file.StandardOpenOption.TRUNCATE_EXISTING);
        // 手动编辑保存也更新生成时间，确保过期判断正确
        repo.updateDevDocGeneratedAt(sessionId, System.currentTimeMillis());
    }

    // ───── 工时评估 ─────

    /**
     * AI 工时评估：基于当前 PRD + 当前开发文档（开发文档一定基于最新 PRD 生成，见
     * {@link #generateDevDoc}，因此只需读这两份当前内容，不需要额外关联版本），结合代码/业务
     * 知识图谱查询结果，调一次 oneShot LLM 给出工时区间估算，落库到 {@code dev_doc_estimation}。
     *
     * <p>与 {@link #classifyReqType} 的兜底策略不同：这是用户主动点按钮触发的动作，LLM 输出
     * 解析失败时直接抛异常让请求报错，不用随意兜底值掩盖失败（兜底出的数字反而会误导决策）。</p>
     *
     * @param extraContext 用户在确认弹框里补充的上下文（如团队人力、技术栈熟悉度），可为空
     * @throws IllegalStateException 尚未生成开发文档，或 LLM 输出解析失败
     */
    public PrdSession estimateDevDocEffort(String sessionId, String extraContext) {
        return estimateDevDocEffort(sessionId, extraContext, null);
    }

    public PrdSession estimateDevDocEffort(String sessionId, String extraContext, String requestedEngine) {
        return estimateDevDocEffort(sessionId, extraContext, requestedEngine, System.currentTimeMillis());
    }

    /** 启动真正的后台评估；HTTP 请求只负责登记任务，关闭弹框/页面不会中断 Code Agent。 */
    public PrdSession startEstimateDevDocEffort(String sessionId, String extraContext, String requestedEngine) {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        if (!activeEffortEstimations.add(sessionId)) {
            return session;
        }
        String engine = normalizeEngine(requestedEngine == null || requestedEngine.isBlank()
                ? session.getEngine() : requestedEngine);
        long startedAt = System.currentTimeMillis();
        updateEstimationWorkState(sessionId, "RUNNING", "", engine, startedAt);
        Thread.ofVirtual().name("prd-effort-estimate-" + sessionId + "-").start(() -> {
            try {
                estimateDevDocEffort(sessionId, extraContext, engine, startedAt);
            } catch (Exception e) {
                log.warn("[prd-clarify] 后台 AI 工时评估失败 sessionId={}", sessionId, e);
                updateEstimationWorkState(sessionId, "ERROR", e.getMessage(), engine, startedAt);
            } finally {
                activeEffortEstimations.remove(sessionId);
            }
        });
        return repo.findById(sessionId).orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
    }

    private PrdSession estimateDevDocEffort(String sessionId, String extraContext, String requestedEngine,
                                            long startedAt) {
        PrdSession requestedSession = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        PrdSession session = resolveLatestEffortSource(requestedSession);
        String prdContent;
        String devDocContent;
        try {
            prdContent = fileStore.read(session.getId());
            devDocContent = readDevDocContent(session.getId());
        } catch (IOException e) {
            throw new IllegalStateException("读取 PRD/开发文档失败: " + e.getMessage(), e);
        }
        Optional<LocalProjectResolver.ProjectLocation> projectLocation = resolveLocalProject(session.getProject());
        String engine = normalizeEngine(requestedEngine == null || requestedEngine.isBlank()
                ? session.getEngine() : requestedEngine);
        String userPrompt = buildEffortEstimatePrompt(
                session, prdContent, devDocContent, extraContext, projectLocation);
        AgentOneShotRunner.ExecutionRequest request = new AgentOneShotRunner.ExecutionRequest(
                EFFORT_ESTIMATE_SYSTEM,
                userPrompt,
                projectLocation.map(LocalProjectResolver.ProjectLocation::path).orElse(null),
                session.getModel(),
                engine,
                "codex".equals(engine) ? "medium" : null,
                null, null, null, null,
                projectLocation.isPresent()
                        ? AgentOneShotRunner.TOOL_POLICY_CONSULT_READONLY
                        : AgentOneShotRunner.TOOL_POLICY_DISABLED);
        String raw = agentRunner.runOnce(request);
        String estimationJson = parseAndBuildEstimationJson(
                raw, engine, projectLocation, session, prdContent, devDocContent, startedAt);
        repo.updateDevDocEstimation(sessionId, estimationJson);
        return repo.findById(sessionId).orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
    }

    /** 在原评估 JSON 上更新后台状态，运行/失败时保留上一版数值供用户对照。 */
    private void updateEstimationWorkState(String sessionId, String status, String error,
                                           String engine, long startedAt) {
        PrdSession session = repo.findById(sessionId).orElse(null);
        if (session == null) return;
        ObjectNode state = mapper.createObjectNode();
        if (session.getDevDocEstimation() != null && !session.getDevDocEstimation().isBlank()) {
            try {
                JsonNode previous = mapper.readTree(session.getDevDocEstimation());
                if (previous instanceof ObjectNode object) state = object.deepCopy();
            } catch (Exception ignored) {
                // 旧数据损坏时以新的任务状态重新开始，最终成功结果会完整覆盖。
            }
        }
        state.put("workStatus", status);
        state.put("workError", error == null ? "" : error);
        state.put("workEngine", engine);
        state.put("startedAt", startedAt);
        if ("ERROR".equals(status)) state.put("completedAt", System.currentTimeMillis());
        try {
            repo.updateDevDocEstimation(sessionId, mapper.writeValueAsString(state));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("保存工时评估后台状态失败", e);
        }
    }

    /**
     * 根需求只跟随明确的 PRD 修订节点；AI 拆分出来的普通子需求仍是独立需求，不能误当父需求最新版。
     * 从某个修订节点发起时也会回到同一修订树，再选择最新修订。
     */
    private PrdSession resolveLatestEffortSource(PrdSession requested) {
        PrdSession revisionRoot = requested;
        if (isRevision(requested) && requested.getParentId() != null && !requested.getParentId().isBlank()) {
            revisionRoot = repo.findById(requested.getParentId()).orElse(requested);
        }
        return repo.findLatestRevision(revisionRoot.getId()).orElse(requested);
    }

    private boolean isRevision(PrdSession session) {
        String rawInput = session.getRawInput();
        return rawInput != null && (rawInput.startsWith("【后台自动修订") || rawInput.startsWith("【修订版 PRD"));
    }

    private String buildEffortEstimatePrompt(PrdSession s, String prdContent, String devDocContent, String extraContext,
                                             Optional<LocalProjectResolver.ProjectLocation> projectLocation) {
        StringBuilder sb = new StringBuilder();
        sb.append("需求标题：").append(s.getTitle()).append("\n");
        if (s.getProject() != null && !s.getProject().isBlank()) {
            sb.append("项目：").append(s.getProject());
            if (s.getModule() != null && !s.getModule().isBlank()) {
                sb.append(" / ").append(s.getModule());
            }
            sb.append("\n");
        }
        sb.append("\n【PRD 内容】\n").append(prdContent == null ? "" : prdContent).append("\n");
        if (devDocContent == null || devDocContent.isBlank()) {
            sb.append("\n【开发文档内容】\n尚未生成 TDD/开发文档；必须降低信心并扩大区间。\n");
        } else {
            sb.append("\n【开发文档内容】（已基于最新 PRD 生成，以此为准做工时拆解）\n")
                    .append(devDocContent).append("\n");
        }
        if (extraContext != null && !extraContext.isBlank()) {
            sb.append("\n【补充上下文】\n").append(extraContext.trim()).append("\n");
        }
        appendGraphContext(sb, queryGraphContext(s.getProject(), s.getModule(), s.getTitle()));
        appendDomainContext(sb, queryDomainContext(s.getProject(), s.getTitle()));
        if (projectLocation.isPresent()) {
            sb.append("\n【本地代码核查】\n已将工作目录限制为项目：")
                    .append(projectLocation.get().name())
                    .append("。请实际使用只读工具检查与需求/模块相关的代码、测试和依赖，并在 inspectedFiles 中记录关键相对路径。\n");
        } else {
            sb.append("\n【本地代码核查】\n没有在已配置工作区中匹配到项目目录，本次禁止调用工具；")
                    .append("必须在 codeEvidenceSummary 说明未核查代码，并降低 confidence。\n");
        }
        sb.append("\n请基于以上信息评估开发工时，严格按系统提示的 JSON 结构输出。");
        return sb.toString();
    }

    /** 把业务知识图谱查询结果（若有）拼进 prompt，跟 {@link #appendGraphContext}（代码知识图谱）并列。 */
    private void appendDomainContext(StringBuilder sb, Optional<String> domainContext) {
        if (domainContext.isEmpty() || domainContext.get().isBlank()) {
            return;
        }
        sb.append("\n【业务知识图谱查询结果】（系统已直接检索 project-domain-knowledge 库，内容为团队沉淀的业务真理，可信）\n");
        sb.append(domainContext.get()).append("\n");
    }

    /**
     * 解析 LLM 返回的工时评估 JSON，做字段校验/归一化并补上 estimatedAt。解析失败（LLM 没按
     * 要求输出 JSON）时直接抛异常，不做兜底——评估失败应该让用户看到并重试，而不是塞一个
     * 随意的默认工时误导决策。
     */
    private String parseAndBuildEstimationJson(String raw, String engine,
                                               Optional<LocalProjectResolver.ProjectLocation> projectLocation,
                                               PrdSession sourceSession, String prdContent, String devDocContent,
                                               long startedAt) {
        JsonNode node;
        try {
            node = extractEffortJson(raw);
        } catch (Exception firstError) {
            log.info("[prd-clarify] 工时评估混合输出未找到最终 JSON，执行一次格式修复: {}",
                    firstError.getMessage());
            try {
                String repairInput = raw == null ? "" : raw;
                if (repairInput.length() > 24_000) {
                    repairInput = repairInput.substring(repairInput.length() - 24_000);
                }
                AgentOneShotRunner.ExecutionRequest repairRequest = new AgentOneShotRunner.ExecutionRequest(
                        EFFORT_JSON_REPAIR_SYSTEM,
                        repairInput,
                        null,
                        sourceSession.getModel(),
                        engine,
                        "codex".equals(engine) ? "low" : null,
                        null, null, null, null,
                        AgentOneShotRunner.TOOL_POLICY_DISABLED);
                node = extractEffortJson(agentRunner.runOnce(repairRequest));
            } catch (Exception repairError) {
                repairError.addSuppressed(firstError);
                throw new IllegalStateException("工时评估最终结果缺少合法 JSON，请重试: "
                        + repairError.getMessage(), repairError);
            }
        }
        if (!node.isObject()) {
            throw new IllegalStateException("工时评估结果格式不正确，请重试");
        }
        int hoursMin = Math.max(0, node.path("hoursMin").asInt(0));
        int hoursMax = Math.max(hoursMin, node.path("hoursMax").asInt(hoursMin));
        String confidence = node.path("confidence").asText("MEDIUM").toUpperCase();
        if (!Set.of("LOW", "MEDIUM", "HIGH").contains(confidence)) {
            confidence = "MEDIUM";
        }

        ObjectNode result = mapper.createObjectNode();
        result.put("hoursMin", hoursMin);
        result.put("hoursMax", hoursMax);
        result.put("confidence", confidence);
        result.put("reasoning", node.path("reasoning").asText(""));
        ArrayNode breakdown = mapper.createArrayNode();
        for (JsonNode item : node.path("breakdown")) {
            ObjectNode b = mapper.createObjectNode();
            b.put("item", item.path("item").asText(""));
            b.put("hours", item.path("hours").asDouble(0));
            breakdown.add(b);
        }
        result.set("breakdown", breakdown);
        copyStringArray(node, result, "inspectedFiles", 12);
        copyStringArray(node, result, "assumptions", 5);
        copyStringArray(node, result, "risks", 5);
        result.put("codeEvidenceSummary", node.path("codeEvidenceSummary").asText(
                projectLocation.isPresent() ? "未返回代码核查摘要" : "未匹配到本地项目，未核查代码"));
        result.put("engine", engine);
        result.put("projectPath", projectLocation.map(LocalProjectResolver.ProjectLocation::path).orElse(""));
        result.put("codeInspected", projectLocation.isPresent() && result.path("inspectedFiles").size() > 0);
        String prdPath = fileStore.pathFor(sourceSession.getId()).toAbsolutePath().normalize().toString();
        String tddPath = sourceSession.getDevDocPath();
        if (tddPath == null || tddPath.isBlank()) {
            tddPath = prdPath.replaceFirst("\\.md$", "-dev.md");
        }
        List<String> inspectedFiles = new ArrayList<>();
        result.path("inspectedFiles").forEach(value -> inspectedFiles.add(value.asText("")));
        String projectPath = projectLocation.map(LocalProjectResolver.ProjectLocation::path).orElse("");
        result.put("sourceSessionId", sourceSession.getId());
        result.put("sourceTitle", sourceSession.getTitle());
        result.put("prdPath", prdPath);
        result.put("tddPath", tddPath);
        result.put("prdFingerprint", EstimationEvidenceFingerprint.text(prdContent));
        result.put("tddFingerprint", EstimationEvidenceFingerprint.text(devDocContent));
        result.put("codeFingerprint", EstimationEvidenceFingerprint.inspectedFiles(projectPath, inspectedFiles));
        long completedAt = System.currentTimeMillis();
        result.put("workStatus", "COMPLETED");
        result.put("workError", "");
        result.put("workEngine", engine);
        result.put("startedAt", startedAt);
        result.put("completedAt", completedAt);
        result.put("estimatedAt", completedAt);
        try {
            return mapper.writeValueAsString(result);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("工时评估结果序列化失败: " + e.getMessage(), e);
        }
    }

    /**
     * 从 ReAct 混合输出中提取最后一个符合工时结构的 JSON 对象。扫描器识别字符串转义和嵌套括号，
     * 不会被 reasoning 文本或 JSON 字符串里的花括号干扰。
     */
    private JsonNode extractEffortJson(String raw) throws JsonProcessingException {
        String text = stripFence(raw == null ? "" : raw.trim());
        JsonNode direct = tryReadEffortObject(text);
        if (direct != null) return direct;

        JsonNode latest = null;
        for (int start = 0; start < text.length(); start++) {
            if (text.charAt(start) != '{') continue;
            int depth = 0;
            boolean inString = false;
            boolean escaped = false;
            for (int end = start; end < text.length(); end++) {
                char ch = text.charAt(end);
                if (inString) {
                    if (escaped) escaped = false;
                    else if (ch == '\\') escaped = true;
                    else if (ch == '"') inString = false;
                    continue;
                }
                if (ch == '"') inString = true;
                else if (ch == '{') depth++;
                else if (ch == '}' && --depth == 0) {
                    JsonNode candidate = tryReadEffortObject(text.substring(start, end + 1));
                    if (candidate != null) latest = candidate;
                    break;
                }
            }
        }
        if (latest != null) return latest;
        throw new JsonProcessingException("未找到同时包含 hoursMin 和 hoursMax 的 JSON 对象") { };
    }

    private JsonNode tryReadEffortObject(String candidate) {
        if (candidate == null || candidate.isBlank()) return null;
        try {
            JsonNode node = mapper.readTree(candidate);
            return node != null && node.isObject() && node.has("hoursMin") && node.has("hoursMax") ? node : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private void copyStringArray(JsonNode source, ObjectNode target, String field, int limit) {
        ArrayNode values = mapper.createArrayNode();
        JsonNode input = source.path(field);
        if (input.isArray()) {
            int count = 0;
            for (JsonNode value : input) {
                String text = value.asText("").trim();
                if (!text.isBlank()) {
                    values.add(text);
                    if (++count >= limit) break;
                }
            }
        }
        target.set(field, values);
    }

    // ───── 需求拆分 ─────

    /**
     * 需求拆分判断 prompt：只读分析，不改写原需求。严格要求单行 JSON 输出，便于确定性解析；
     * 解析失败时上层直接报错让用户重试（跟工时评估一致的策略——这是用户主动触发的动作，
     * 不该用随意兜底值掩盖失败）。
     */
    private static final String SPLIT_SYSTEM = """
            你是资深产品经理，负责判断一个需求是否"过大"，需要拆分成多个可以独立澄清、独立开发的子需求。

            判断标准：
            - 需求描述里明显包含多个彼此独立的功能点/子系统/用户旅程，且拆开后每个子需求可以
              单独验收、单独排期，就应该拆分
            - 如果需求本身已经足够聚焦（单一功能点、单一用户旅程），不要为了拆而拆，canSplit 给 false

            拆分要求（canSplit=true 时）：
            - 每个子需求要能独立被理解和澄清——rawInput 要重新组织成完整、自洽的描述，不能写
              "见原需求第2点"这种依赖上下文的片段，因为子需求之后会独立走一遍需求澄清流程，
              不会带着原始大需求的上下文
            - 子需求数量控制在 2-6 个，拆得过细没有意义
            - title 简短（不超过 30 字），一眼看出这个子需求是做什么的
            - module 可选：能从描述判断这个子需求主要落在哪个模块就填，不确定就留空字符串

            【严格输出要求】只输出一个 JSON 对象，不加任何说明、前言、结语或 markdown 围栏：
            {"canSplit":true或false,"reason":"一两句话说明为什么拆/为什么不拆","items":[{"title":"...","rawInput":"...","module":"..."}]}
            canSplit=false 时 items 给空数组 []。
            """;

    /** 需求拆分的一个子项：title/rawInput/module，语义对齐 {@code SplitItemView}。 */
    public record SplitItem(String title, String rawInput, String module) {
    }

    /** 需求拆分判断结果：canSplit + 判断依据 + 建议子需求列表。 */
    public record SplitResult(boolean canSplit, String reason, List<SplitItem> items) {
    }

    /**
     * AI 需求拆分：分析当前 rawInput 是否"过大"，建议拆成多个可独立澄清/开发的子需求。
     * 只读分析，不落库——用户在前端确认/编辑后调 {@link #adoptSplit} 才真正创建子草稿。
     * 任意状态（DRAFT/CLARIFYING/DONE 等）的会话都可以拆，只要求 rawInput 非空。
     *
     * @throws IllegalStateException rawInput 为空，或 LLM 输出解析失败
     */
    public SplitResult splitRequirement(String sessionId) {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        if (session.getRawInput() == null || session.getRawInput().isBlank()) {
            throw new IllegalStateException("需求描述为空，无法拆分");
        }
        String userPrompt = buildSplitPrompt(session);
        String raw = agentRunner.runOnce(SPLIT_SYSTEM, userPrompt, session.getModel(),
                normalizeEngine(session.getEngine()));
        return parseSplitResult(raw);
    }

    private String buildSplitPrompt(PrdSession s) {
        StringBuilder sb = new StringBuilder();
        sb.append("需求标题：").append(s.getTitle()).append("\n");
        if (s.getProject() != null && !s.getProject().isBlank()) {
            sb.append("关联项目：").append(s.getProject());
            if (s.getModule() != null && !s.getModule().isBlank()) {
                sb.append(" / ").append(s.getModule());
            }
            sb.append("\n");
        }
        sb.append("\n【需求描述】\n").append(s.getRawInput()).append("\n");
        appendGraphContext(sb, queryGraphContext(s.getProject(), s.getModule(), s.getTitle()));
        appendDomainContext(sb, queryDomainContext(s.getProject(), s.getTitle()));
        sb.append("\n请判断是否需要拆分，严格按系统提示的 JSON 结构输出。");
        return sb.toString();
    }

    private SplitResult parseSplitResult(String raw) {
        String cleaned = stripFence(raw == null ? "" : raw.trim());
        JsonNode node;
        try {
            node = mapper.readTree(cleaned);
        } catch (Exception e) {
            throw new IllegalStateException("需求拆分结果解析失败，请重试: " + e.getMessage(), e);
        }
        if (!node.isObject()) {
            throw new IllegalStateException("需求拆分结果格式不正确，请重试");
        }
        boolean canSplit = node.path("canSplit").asBoolean(false);
        String reason = node.path("reason").asText("");
        List<SplitItem> items = new ArrayList<>();
        for (JsonNode item : node.path("items")) {
            String title = item.path("title").asText("").trim();
            String rawInput = item.path("rawInput").asText("").trim();
            if (title.isEmpty() || rawInput.isEmpty()) {
                continue; // 跳过残缺项，不因个别子项缺字段就让整次拆分失败
            }
            String module = item.path("module").asText("").trim();
            items.add(new SplitItem(title, rawInput, module.isEmpty() ? null : module));
        }
        if (canSplit && items.isEmpty()) {
            // LLM 说能拆但没解析出任何有效子项：当作不能拆处理，比抛异常更友好
            canSplit = false;
            reason = reason.isBlank() ? "拆分结果解析异常，未获得有效子需求" : reason;
        }
        if (items.size() > 8) {
            // 数量上限兜底：防止 LLM 不遵守"2-6个"的指引，子需求过多前端体验会很差
            items = items.subList(0, 8);
        }
        return new SplitResult(canSplit, reason, items);
    }

    /**
     * 采纳拆分结果：把用户确认（可能编辑过）的子需求批量创建成 DRAFT 草稿，parentId 指向
     * 当前会话——父 PRD 自身不受任何影响，原始需求描述原样保留，只是历史列表里多了几条
     * 挂在它下面的子记录。project 固定继承父 PRD 的（子需求通常还在同一个项目下）；
     * module 优先用 AI/用户为该子项指定的，未指定则兜底继承父 PRD 的 module。
     */
    public List<PrdSession> adoptSplit(String parentId, List<SplitItem> items, Long createdByUserId) {
        PrdSession parent = repo.findById(parentId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + parentId));
        long now = System.currentTimeMillis();
        List<PrdSession> created = new ArrayList<>();
        for (SplitItem item : items) {
            if (item.title() == null || item.title().isBlank()
                    || item.rawInput() == null || item.rawInput().isBlank()) {
                continue;
            }
            PrdSession child = PrdSession.builder()
                    .id(UUID.randomUUID().toString())
                    .title(item.title().trim())
                    .rawInput(item.rawInput().trim())
                    .project(parent.getProject())
                    .module((item.module() == null || item.module().isBlank()) ? parent.getModule() : item.module())
                    .role("PRODUCT")
                    .reqType("NEW_MODULE")
                    .maxQuestions(DEFAULT_MAX_QUESTIONS.get("NEW_MODULE"))
                    .clarifyMode("progressive")
                    .documentProfile(DocumentProfile.normalize(parent.getDocumentProfile()))
                    .status("DRAFT")
                    .parentId(parentId)
                    .createdByUserId(createdByUserId)
                    .createdAt(now)
                    .updatedAt(now)
                    .build();
            repo.insert(child);
            created.add(child);
        }
        if (created.isEmpty()) {
            throw new IllegalArgumentException("未选择任何有效子需求");
        }
        return created;
    }

    // ───── 进度评估 ─────
    //
    // 设计取自"平台文档管理事实来源，衍生产物按需生成"的分工：PRD/开发文档是业务/技术事实
    // 来源，不会为了做进度追踪被推倒重写；进度评估报告是可重复生成的派生产物，每次核对当时
    // 最新的 PRD + 开发文档 + 真实源码证据，按版本追加落盘（不覆盖），历史快照仍可回看——
    // 用法/文件命名/版本管理逻辑完全对齐开发文档（DevDocLocation 系列方法），只是换了个
    // 产物类型，故意不抽取公共父类/工具方法：避免为了复用而牵连开发文档已经稳定工作的逻辑。

    /**
     * AI 进度评估：基于当前 PRD + 当前开发文档，结合 URL、代码图谱、源码和业务知识，核对代码库
     * 实际实现进度，生成大纲固定的 Markdown 报告，通过 SSE 流式推出，完成后按版本追加落盘到
     * {@code {id}-progress.md}（覆盖前先备份为 {id}-progress-v{n}.md，"检出新版本"不丢历史）。
     */
    public void evaluateProgress(String sessionId, String extraContext, SseEmitter emitter) {
        PrdSession requestedSession = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        // 根需求存在修订节点时，代码分析必须采用当前最新 PRD/TDD；报告仍挂回用户点击的需求节点。
        PrdSession sourceSession = resolveLatestEffortSource(requestedSession);

        Thread.ofVirtual().name("prd-progress-").start(() -> {
            try {
                String prdContent = fileStore.read(sourceSession.getId());
                String devDocContent = readDevDocContent(sourceSession.getId());
                if (devDocContent == null || devDocContent.isBlank()) {
                    sendError(emitter, new IllegalStateException("请先生成开发文档后再评估进度"));
                    return;
                }

                LocalProjectResolver.ProjectLocation projectLocation = resolveLocalProject(sourceSession.getProject())
                        .orElseThrow(() -> new IllegalStateException(
                                "未匹配到项目“" + sourceSession.getProject() + "”的本地工作目录，无法核查代码进度"));

                String effortBaselineJson = requestedSession.getDevDocEstimation() != null
                        ? requestedSession.getDevDocEstimation()
                        : sourceSession.getDevDocEstimation();
                String userPrompt = buildProgressEvalPrompt(
                        sourceSession, prdContent, devDocContent, effortBaselineJson, extraContext, projectLocation);
                StringBuilder full = new StringBuilder();
                String engine = normalizeEngine(sourceSession.getEngine());
                AgentOneShotRunner.ExecutionRequest request = new AgentOneShotRunner.ExecutionRequest(
                        progressEvalSystemPrompt(),
                        userPrompt,
                        projectLocation.path(),
                        sourceSession.getModel(),
                        engine,
                        "codex".equals(engine) ? "medium" : null,
                        null, null, null, null,
                        AgentOneShotRunner.TOOL_POLICY_CONSULT_READONLY);
                String returnedContent = agentRunner.stream(request, delta -> {
                    full.append(delta);
                    sendChunk(emitter, delta);
                });

                String progressContent = full.isEmpty() ? returnedContent : full.toString();
                validateProgressEvidenceStatus(progressContent);
                java.nio.file.Path progressPath = java.nio.file.Path.of(
                        fileStore.pathFor(sessionId).toString().replace(".md", "-progress.md"));
                backupProgressIfExists(progressPath);
                java.nio.file.Files.writeString(
                        progressPath, progressContent,
                        java.nio.charset.StandardCharsets.UTF_8,
                        java.nio.file.StandardOpenOption.CREATE,
                        java.nio.file.StandardOpenOption.TRUNCATE_EXISTING);
                repo.updateProgressPath(sessionId, progressPath.toString());
                repo.updateProgressGeneratedAt(sessionId, System.currentTimeMillis());
                recordProgressHistory(sessionId, requestedSession.getProgressHistory(), extraContext);
                log.info("[prd-clarify] 进度评估已保存 path={} sourceSessionId={}",
                        progressPath, sourceSession.getId());

                sendDone(emitter);
            } catch (Exception e) {
                log.warn("[prd-clarify] 进度评估失败 sessionId={}", sessionId, e);
                sendError(emitter, e);
            }
        });
    }

    private String buildProgressEvalPrompt(
            PrdSession s,
            String prdContent,
            String devDocContent,
            String effortBaselineJson,
            String extraContext,
            LocalProjectResolver.ProjectLocation projectLocation) {
        StringBuilder sb = new StringBuilder();
        sb.append("需求标题：").append(s.getTitle()).append("\n");
        sb.append("文档模式：").append(DocumentProfile.normalize(s.getDocumentProfile())).append("\n");
        if (s.getProject() != null && !s.getProject().isBlank()) {
            sb.append("项目：").append(s.getProject());
            if (s.getModule() != null && !s.getModule().isBlank()) {
                sb.append(" / ").append(s.getModule());
            }
            sb.append("\n");
        }
        if (s.getRawInput() != null && !s.getRawInput().isBlank()) {
            sb.append("\n【原始需求输入】（包含 URL 时必须传给 source_context）\n")
                    .append(s.getRawInput()).append("\n");
        }
        String specificationLabel = isSpecDriven(s) ? "核心规格" : "PRD";
        String planLabel = isSpecDriven(s) ? "执行计划" : "最新 TDD / 开发文档";
        sb.append("\n【").append(specificationLabel).append("内容】\n")
                .append(prdContent == null ? "" : prdContent).append("\n");
        sb.append("\n【").append(planLabel).append("内容】（技术方案基准，逐项核对是否已落地）\n")
                .append(devDocContent).append("\n");
        if (isSpecDriven(s)) {
            sb.append("\n【规格驱动评估要求】\n按 REQ/RULE/SCN/AC 与 PLAN ID 建立追踪关系，")
                    .append("每个完成、部分完成或缺失结论必须引用源码或测试证据；")
                    .append("无法映射稳定 ID 的实现列为规格漂移，不得直接计为完成。\n");
        }
        appendProgressEffortBaseline(sb, effortBaselineJson);
        if (extraContext != null && !extraContext.isBlank()) {
            sb.append("\n【补充上下文】\n").append(extraContext.trim()).append("\n");
        }
        appendDomainContext(sb, queryDomainContext(s.getProject(), s.getTitle()));
        sb.append("\n【测试核查】\n所有测试类功能点与其它功能点一样完整核查并写入对应完成状态章节。"
                + "单元、接口、安全、集成、自动化、事务、并发、回归、性能、端到端、验收、兼容性等测试项，"
                + "标题必须明确包含“测试”或 Test，便于后端基于同一报告确定性计算两种计分口径。"
                + "联调、数据库迁移校验等非测试工作仍按普通功能点计分，除非标题明确将其定义为测试。\n");
        sb.append("\n【本地代码核查】\n工作目录已限制为项目：")
                .append(projectLocation.name())
                .append("。必须先调用 source_context，再精确读取候选源码；不得仅凭上方文档或图谱判断进度。\n");
        sb.append("\n请基于以上信息生成开发进度评估报告，严格按系统提示的大纲输出 Markdown。");
        return sb.toString();
    }

    /** 根据项目名称解析已配置且可访问的本地工作目录。 */
    private Optional<LocalProjectResolver.ProjectLocation> resolveLocalProject(String project) {
        LocalProjectResolver resolver = localProjectResolver.getIfAvailable();
        return resolver == null ? Optional.empty() : resolver.resolve(project);
    }

    /** 将代码证据状态常量注入评估协议。 */
    private String progressEvalSystemPrompt() {
        return PROGRESS_EVAL_SYSTEM
                + "\n证据状态标记：\n- 已核查：`" + CODE_EVIDENCE_VERIFIED
                + "`\n- 证据不足：`" + CODE_EVIDENCE_INSUFFICIENT + "`\n";
    }

    /** 阻止没有真实源码核查结论的报告覆盖上一版可信进度。 */
    private void validateProgressEvidenceStatus(String progressContent) {
        if (progressContent.contains(CODE_EVIDENCE_VERIFIED)) {
            return;
        }
        if (progressContent.contains(CODE_EVIDENCE_INSUFFICIENT)) {
            boolean containsProgressItem = Pattern.compile("(?m)^- \\[(?:x|X|~| )] ")
                    .matcher(progressContent)
                    .find();
            if (!containsProgressItem) {
                return;
            }
            throw new IllegalStateException("代码证据不足时不能生成完成度清单，请重新评估");
        }
        throw new IllegalStateException("进度评估未返回代码证据状态，已保留上一版报告");
    }

    /** 把责任时间处已经生成的总工时评估作为固定基线传给代码分析，避免再次凭空估总量。 */
    private void appendProgressEffortBaseline(StringBuilder sb, String estimationJson) {
        if (estimationJson == null || estimationJson.isBlank()) {
            sb.append("\n【原 AI 总工时评估基线】\n尚未生成总工时评估；只核对实现进度，"
                    + "剩余工时将在后端等待基线补齐后再计算。\n");
            return;
        }
        try {
            JsonNode estimation = mapper.readTree(estimationJson);
            int hoursMin = Math.max(0, estimation.path("hoursMin").asInt(0));
            int hoursMax = Math.max(hoursMin, estimation.path("hoursMax").asInt(hoursMin));
            long estimatedAt = estimation.path("estimatedAt").asLong(0);
            if (!estimation.isObject() || hoursMax <= 0 || estimatedAt <= 0) {
                sb.append("\n【原 AI 总工时评估基线】\n尚无有效的已完成评估结果。\n");
                return;
            }
            sb.append("\n【原 AI 总工时评估基线】（来自需求中枢“责任与时间”，固定总量，不得按当前代码反向缩小）\n")
                    .append("- 原评估总工时：").append(hoursMin).append("-").append(hoursMax).append(" 小时\n")
                    .append("- 折算口径：6 个 AI 有效编码小时 / 工作日\n")
                    .append("- 评估信心：").append(estimation.path("confidence").asText("MEDIUM")).append("\n")
                    .append("- 评估时间：").append(estimatedAt).append("（Unix 毫秒）\n");
            String reasoning = estimation.path("reasoning").asText("").trim();
            if (!reasoning.isBlank()) sb.append("- 原评估依据：").append(reasoning).append("\n");
            String invalidatedReason = estimation.path("invalidatedReason").asText("").trim();
            if (!invalidatedReason.isBlank()) {
                sb.append("- 基线状态：已过期（").append(invalidatedReason).append("），报告必须明确提示重新评估总工时\n");
            }
            sb.append("代码功能点状态必须继续基于当前 PRD、最新 TDD 与真实代码证据判断；"
                    + "剩余小时和工作日由后端按代码进度确定性换算。\n");
        } catch (Exception exception) {
            sb.append("\n【原 AI 总工时评估基线】\n历史评估数据无法解析；不得自行编造工时。\n");
        }
    }

    /**
     * 追加一条进度评估历史记录，逻辑对齐 {@link #recordDevDocHistory}（少了 mode/qaHistory——
     * 进度评估没有"模式"概念，也不涉及澄清问答）。
     */
    private void recordProgressHistory(String sessionId, String existingHistoryJson, String extraContext) {
        try {
            ArrayNode arr;
            JsonNode existing = (existingHistoryJson == null || existingHistoryJson.isBlank())
                    ? null : mapper.readTree(existingHistoryJson);
            arr = (existing instanceof ArrayNode existingArr) ? existingArr : mapper.createArrayNode();

            ObjectNode entry = mapper.createObjectNode();
            entry.put("version", arr.size() + 1);
            entry.put("extraContext", extraContext == null ? "" : extraContext);
            entry.put("generatedAt", System.currentTimeMillis());
            arr.add(entry);

            repo.updateProgressHistory(sessionId, mapper.writeValueAsString(arr));
        } catch (Exception e) {
            log.warn("[prd-clarify] 记录进度评估历史失败（不影响本次评估结果）: {}", e.getMessage());
        }
    }

    /** 读取当前进度评估文档内容。 */
    public String readProgressContent(String sessionId) throws java.io.IOException {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        if (session.getProgressPath() == null || session.getProgressPath().isBlank()) {
            return "";
        }
        java.nio.file.Path path = java.nio.file.Path.of(session.getProgressPath());
        if (!java.nio.file.Files.exists(path)) return "";
        return java.nio.file.Files.readString(path, java.nio.charset.StandardCharsets.UTF_8);
    }

    /** 读取进度评估某个历史版本的内容，逻辑对齐 {@link #readDevDocVersionContent}。 */
    public String readProgressVersionContent(String sessionId, int version) throws java.io.IOException {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        if (version <= 0) {
            return "";
        }
        ProgressLocation loc = resolveProgressLocation(session);
        if (loc == null) {
            return "";
        }
        List<Integer> backups = scanProgressBackupVersions(loc);
        int currentVersion = (backups.isEmpty() ? 0 : backups.get(backups.size() - 1)) + 1;
        if (version == currentVersion) {
            return readProgressContent(sessionId);
        }
        if (!backups.contains(version)) {
            return "";
        }
        java.nio.file.Path backupPath = loc.dir().resolve(loc.baseName() + "-v" + version + ".md");
        if (!java.nio.file.Files.exists(backupPath)) {
            return "";
        }
        return java.nio.file.Files.readString(backupPath, java.nio.charset.StandardCharsets.UTF_8);
    }

    /** 列出该会话进度评估的所有版本摘要，逻辑对齐 {@link #listDevDocVersions}。 */
    public List<ProgressVersionSummary> listProgressVersions(String sessionId) {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        ProgressLocation loc = resolveProgressLocation(session);
        if (loc == null) {
            return List.of();
        }
        List<Integer> backups = scanProgressBackupVersions(loc);
        int currentVersion = (backups.isEmpty() ? 0 : backups.get(backups.size() - 1)) + 1;

        Map<Integer, JsonNode> historyByVersion = new java.util.HashMap<>();
        try {
            String historyJson = session.getProgressHistory();
            if (historyJson != null && !historyJson.isBlank()) {
                JsonNode arr = mapper.readTree(historyJson);
                if (arr.isArray()) {
                    for (JsonNode node : arr) {
                        historyByVersion.put(node.path("version").asInt(-1), node);
                    }
                }
            }
        } catch (Exception e) {
            log.debug("[prd-clarify] 解析 progressHistory 失败（不影响版本列表展示）: {}", e.getMessage());
        }

        List<Integer> allVersions = new ArrayList<>(backups);
        allVersions.add(currentVersion);

        List<ProgressVersionSummary> result = new ArrayList<>();
        for (int v : allVersions) {
            JsonNode h = historyByVersion.get(v);
            Long generatedAt = h != null ? h.path("generatedAt").asLong()
                    : (v == currentVersion ? session.getProgressGeneratedAt() : null);
            result.add(new ProgressVersionSummary(
                    v, v == currentVersion,
                    h != null ? h.path("extraContext").asText("") : null,
                    generatedAt));
        }
        result.sort(java.util.Comparator.comparingInt(ProgressVersionSummary::version).reversed());
        return result;
    }

    /**
     * 覆盖进度文档前，若旧版本已存在则备份为 {id}-progress-v{n}.md，逻辑对齐
     * {@link #backupDevDocIfExists}。
     */
    private void backupProgressIfExists(java.nio.file.Path progressPath) {
        if (!java.nio.file.Files.isRegularFile(progressPath)) {
            return;
        }
        try {
            String fileName = progressPath.getFileName().toString(); // {id}-progress.md
            String baseName = fileName.substring(0, fileName.length() - 3); // {id}-progress
            java.nio.file.Path dir = progressPath.getParent();
            ProgressLocation loc = dir == null ? null : new ProgressLocation(dir, baseName);
            List<Integer> backups = scanProgressBackupVersions(loc);
            int nextVersion = (backups.isEmpty() ? 0 : backups.get(backups.size() - 1)) + 1;
            java.nio.file.Path backupPath = progressPath.resolveSibling(baseName + "-v" + nextVersion + ".md");
            java.nio.file.Files.copy(progressPath, backupPath, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            log.info("[prd-clarify] 进度评估旧版本已备份 path={}", backupPath);
        } catch (Exception e) {
            log.warn("[prd-clarify] 进度评估备份失败（不阻断本次评估）: {}", e.getMessage());
        }
    }

    /** 进度文档所在目录 + 文件名前缀（{id}-progress），供备份/版本枚举/读取共用。 */
    private record ProgressLocation(java.nio.file.Path dir, String baseName) {}

    /** 解析当前会话进度评估文档的存放位置；尚未评估过时返回 null。 */
    private ProgressLocation resolveProgressLocation(PrdSession session) {
        if (session.getProgressPath() == null || session.getProgressPath().isBlank()) {
            return null;
        }
        java.nio.file.Path currentPath = java.nio.file.Path.of(session.getProgressPath());
        String fileName = currentPath.getFileName().toString(); // {id}-progress.md
        String baseName = fileName.substring(0, fileName.length() - 3); // {id}-progress
        java.nio.file.Path dir = currentPath.getParent();
        return dir == null ? null : new ProgressLocation(dir, baseName);
    }

    /** 扫描磁盘，返回该会话进度评估所有已存在的备份版本号（不含当前版本），从小到大排序。 */
    private List<Integer> scanProgressBackupVersions(ProgressLocation loc) {
        if (loc == null || !java.nio.file.Files.isDirectory(loc.dir())) {
            return List.of();
        }
        java.util.regex.Pattern versionPattern =
                java.util.regex.Pattern.compile(java.util.regex.Pattern.quote(loc.baseName()) + "-v(\\d+)\\.md");
        try (var files = java.nio.file.Files.list(loc.dir())) {
            return files
                    .map(p -> versionPattern.matcher(p.getFileName().toString()))
                    .filter(java.util.regex.Matcher::matches)
                    .map(m -> Integer.parseInt(m.group(1)))
                    .sorted()
                    .toList();
        } catch (Exception e) {
            log.debug("[prd-clarify] 扫描进度评估备份版本失败: {}", e.getMessage());
            return List.of();
        }
    }

    private String buildDevDocPrompt(PrdSession s, String prdContent, String extraInstructions,
                                     List<QaPairRequest> qaHistory) {
        StringBuilder sb = new StringBuilder();
        sb.append("需求标题：").append(s.getTitle()).append("\n");
        if (s.getProject() != null && !s.getProject().isBlank()) {
            sb.append("项目：").append(s.getProject());
            if (s.getModule() != null && !s.getModule().isBlank()) {
                sb.append(" / ").append(s.getModule());
            }
            sb.append("\n");
        }
        appendGraphContext(sb, queryGraphContext(s.getProject(), s.getModule(), s.getTitle()));

        sb.append("\n以下是已确认的产品需求文档（PRD）：\n\n");
        sb.append(prdContent).append("\n\n");
        if (extraInstructions != null && !extraInstructions.isBlank()) {
            // 放在最后、紧邻生成指令之前，保证是 Claude 读到的最新鲜上下文，优先级最高
            sb.append("【用户补充说明——生成时请重点参考/遵循】\n");
            sb.append(extraInstructions.trim()).append("\n\n");
        }
        if (qaHistory != null && !qaHistory.isEmpty()) {
            sb.append("【TDD 生成前已确认的技术澄清】\n");
            int idx = 1;
            for (QaPairRequest qa : qaHistory) {
                sb.append(idx++).append(". ").append(qa.question())
                        .append("\n   → ").append(qa.answer()).append("\n\n");
            }
        }
        sb.append("请基于以上 PRD 生成完整的技术开发方案文档。");
        return sb.toString();
    }

    /**
     * 构建「更新模式」的 user prompt：PRD + 当前开发文档全文 + 本次更新说明 + 澄清问答。
     * qaHistory 结构化传入并在此处格式化拼进 prompt（而不是前端先拼成一段文本再传回来），
     * 这样 qaHistory 才能原样持久化进 devDocHistory，供「生成记录」按版本单独展示。
     */
    private String buildDevDocUpdatePrompt(PrdSession s, String prdContent, String currentDevDoc,
                                            String updateNotes, List<QaPairRequest> qaHistory) {
        StringBuilder sb = new StringBuilder();
        sb.append("需求标题：").append(s.getTitle()).append("\n");
        if (s.getProject() != null && !s.getProject().isBlank()) {
            sb.append("项目：").append(s.getProject());
            if (s.getModule() != null && !s.getModule().isBlank()) {
                sb.append(" / ").append(s.getModule());
            }
            sb.append("\n");
        }
        appendGraphContext(sb, queryGraphContext(s.getProject(), s.getModule(), s.getTitle()));

        sb.append("\n=== 当前最新 PRD ===\n\n").append(prdContent).append("\n\n");
        sb.append("=== 当前开发文档 ===\n\n").append(currentDevDoc).append("\n\n");
        sb.append("=== 本次更新说明 ===\n\n");
        sb.append((updateNotes == null || updateNotes.isBlank())
                ? "（未填写，请结合 PRD 与当前开发文档的差异自行判断需要更新的地方）"
                : updateNotes.trim());
        sb.append("\n\n");
        if (qaHistory != null && !qaHistory.isEmpty()) {
            sb.append("=== 澄清问答 ===\n\n");
            int idx = 1;
            for (QaPairRequest qa : qaHistory) {
                sb.append(idx++).append(". ").append(qa.question()).append("\n   → ").append(qa.answer()).append("\n\n");
            }
        }
        sb.append("请基于以上信息生成更新后的完整技术开发方案文档。");
        return sb.toString();
    }

    /**
     * 覆盖开发文档前，若旧版本已存在则备份为 {id}-dev-v{n}.md（n 从已有备份中取最大值 + 1）。
     * 让「基于开发文档更新」在语义上是"检出一个新版本"，而不是静默覆盖丢失旧内容。
     * 备份失败（如磁盘异常）只记警告，不阻断本次生成——备份是安全网，不是生成的前提条件。
     */
    private void backupDevDocIfExists(java.nio.file.Path devDocPath) {
        if (!java.nio.file.Files.isRegularFile(devDocPath)) {
            return;
        }
        try {
            String fileName = devDocPath.getFileName().toString(); // {id}-dev.md
            String baseName = fileName.substring(0, fileName.length() - 3); // {id}-dev
            java.nio.file.Path dir = devDocPath.getParent();
            DevDocLocation loc = dir == null ? null : new DevDocLocation(dir, baseName);
            List<Integer> backups = scanDevDocBackupVersions(loc);
            int nextVersion = (backups.isEmpty() ? 0 : backups.get(backups.size() - 1)) + 1;
            java.nio.file.Path backupPath = devDocPath.resolveSibling(baseName + "-v" + nextVersion + ".md");
            java.nio.file.Files.copy(devDocPath, backupPath, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            log.info("[prd-clarify] 开发文档旧版本已备份 path={}", backupPath);
        } catch (Exception e) {
            log.warn("[prd-clarify] 开发文档备份失败（不阻断本次生成）: {}", e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────

    /** 获取 PRD 文件的期望路径（供 check-prd-file 接口检测 Claude 是否已写入）。 */
    public java.nio.file.Path getPrdFilePath(String sessionId) {
        return fileStore.pathFor(sessionId);
    }

    /** 覆写文件内容（用户在编辑器手动保存）。 */
    public void saveContent(String sessionId, String content) throws IOException {
        repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        java.nio.file.Path path = fileStore.pathFor(sessionId);
        backupPrdIfExists(path);
        fileStore.write(sessionId, content);
        repo.updateDone(sessionId, path.toString());
    }

    /** 读取 .md 文件内容。 */
    public String readContent(String sessionId) throws IOException {
        repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        return fileStore.read(sessionId);
    }

    /**
     * 删除会话及关联文件。
     * 先删数据库记录，再删文件：若 DB 删除失败则文件仍在（数据一致），
     * 若文件删除失败（孤儿文件）不影响功能，下次创建同名会话会覆盖。
     */
    public void delete(String sessionId) throws IOException {
        repo.delete(sessionId);
        fileStore.delete(sessionId);
        graphifyAskCache.remove(sessionId);
    }

    // ───── Prompt 构建 ─────

    private String buildClarifyPrompt(PrdSession s) {
        int count = s.getMaxQuestions() > 0 ? s.getMaxQuestions() : 5;
        StringBuilder sb = new StringBuilder();
        sb.append("功能标题：").append(s.getTitle()).append("\n");
        if (s.getProject() != null && !s.getProject().isBlank()) {
            sb.append("关联项目：").append(s.getProject()).append("\n");
        }
        if (s.getModule() != null && !s.getModule().isBlank()) {
            sb.append("关联模块：").append(s.getModule()).append("\n");
        }
        sb.append("\n本次需要一次性提出 ").append(count).append(" 个澄清问题。\n");
        sb.append("提问重点：").append(batchClarifyFocusHint(s)).append("\n");
        appendGraphContext(sb, graphifyAskCache.computeIfAbsent(s.getId(),
                id -> queryGraphContext(s.getProject(), s.getModule(), s.getTitle())));
        appendDomainContext(sb, queryDomainContext(s.getProject(), s.getTitle()));
        sb.append("\n原始需求描述：\n").append(s.getRawInput()).append("\n\n");
        sb.append("请提出 ").append(count).append(" 个澄清问题（严格输出 JSON 数组，不加 markdown）。");
        return sb.toString();
    }

    /**
     * 批量澄清的提问重点，跟渐进模式 ASK_SYSTEM_PRODUCT/BUSINESS/BUG 三份 system prompt
     * 里各自的"提问规则"对应，只是从 system prompt 挪到 user prompt——批量模式只有一份
     * system prompt（题量是变量，不适合写死进 system prompt），提问重点按需求类型/角色区分。
     */
    private String batchClarifyFocusHint(PrdSession s) {
        if (REQ_TYPE_BUG_FIX.equals(s.getReqType())) {
            return "这是缺陷修复需求，只问复现步骤、期望 vs 实际行为的落差、影响范围（哪些场景/用户会触发）、"
                    + "业务上的正确处理规则；不问代码位置、报错堆栈或具体修复方式。";
        }
        if ("BUSINESS".equals(s.getRole())) {
            return "提问对象是非技术背景的业务人员：只问业务目标、使用场景、关键数据、业务规则与例外、验收标准，"
                    + "不问界面细节/数据库/接口/框架选型等技术问题（除非直接影响业务流程），语言通俗，避免技术术语。";
        }
        return "提问对象是产品/开发人员：只问业务目标、用户场景、功能边界、业务流程、业务规则与例外、"
                + "验收口径；不问数据库、字段、接口、类、方法、框架或部署等实现细节。";
    }

    private String buildGeneratePrompt(PrdSession s) {
        StringBuilder sb = new StringBuilder();
        sb.append("功能标题：").append(s.getTitle()).append("\n");
        if (s.getProject() != null && !s.getProject().isBlank()) {
            sb.append("关联项目：").append(s.getProject());
            if (s.getModule() != null && !s.getModule().isBlank()) {
                sb.append(" / ").append(s.getModule());
            }
            sb.append("\n");
        }
        sb.append("\n原始需求描述：\n").append(s.getRawInput()).append("\n\n");

        // 追加问答
        if (s.getQuestions() != null && !s.getQuestions().isBlank()) {
            sb.append("需求澄清问答：\n");
            try {
                JsonNode arr = mapper.readTree(s.getQuestions());
                if (arr.isArray()) {
                    int idx = 1;
                    for (JsonNode node : arr) {
                        sb.append("Q").append(idx).append(": ").append(node.path("question").asText("")).append("\n");
                        sb.append("A").append(idx).append(": ").append(node.path("answer").asText("（未填写）")).append("\n");
                        idx++;
                    }
                }
            } catch (Exception e) {
                sb.append(s.getQuestions()).append("\n");
            }
            sb.append("\n");
        }

        sb.append("请基于以上信息生成完整的 PRD 文档（Markdown 格式）。");
        return sb.toString();
    }

    // ───── JSON 解析与合并 ─────

    /**
     * 将 Claude 返回的问题 JSON 解析后，构建包含空 answer 的标准 questions JSON。
     * 解析失败时 fallback 为单个通用问题。
     */
    private String parseAndBuildQuestionsJson(String raw) {
        String cleaned = stripFence(raw == null ? "" : raw.trim());
        try {
            JsonNode arr = mapper.readTree(cleaned);
            if (!arr.isArray()) {
                throw new IllegalStateException("Claude 返回的不是 JSON 数组");
            }
            ArrayNode result = mapper.createArrayNode();
            int idx = 1;
            for (JsonNode node : arr) {
                ObjectNode item = mapper.createObjectNode();
                item.put("id", node.has("id") ? node.path("id").asInt(idx) : idx);
                item.put("question", node.path("question").asText(""));
                item.put("answer", "");
                result.add(item);
                idx++;
            }
            return mapper.writeValueAsString(result);
        } catch (Exception e) {
            log.warn("[prd-clarify] 澄清问题解析失败，使用 fallback: {}", e.getMessage());
            return fallbackQuestions();
        }
    }

    /**
     * 为 Vibe Coding 文档变更创建真正的修订子节点。先复制父 PRD 作为增量生成基线，随后
     * PRD/TDD 都写入子会话，PRD 库可通过 parent_id 展示完整版本树。
     */
    public PrdSession createBackgroundRevision(String parentId, String changeReason) throws IOException {
        PrdSession parent = repo.findById(parentId)
                .orElseThrow(() -> new IllegalArgumentException("父 PRD 会话不存在: " + parentId));
        PrdSession source = repo.findLatestRevision(parentId).orElse(parent);
        return createBackgroundRevision(parent, source, changeReason, fileStore.read(source.getId()));
    }

    private PrdSession createBackgroundRevision(PrdSession parent, PrdSession metadataSource,
                                                String changeReason, String initialPrdContent) throws IOException {
        String parentId = parent.getId();
        int version = repo.nextRevisionNumber(parentId);
        long now = System.currentTimeMillis();
        PrdSession revision = PrdSession.builder()
                .id(UUID.randomUUID().toString())
                .title(parent.getTitle() + "（修订版 v" + version + "）")
                .project(parent.getProject()).module(parent.getModule())
                .rawInput("【后台自动修订 — 基于：" + parent.getTitle() + "】\n" + value(changeReason))
                .requirementDetail(parent.getRequirementDetail())
                .businessBackground(parent.getBusinessBackground())
                .businessRequirementType(parent.getBusinessRequirementType())
                .requirementSoftware(parent.getRequirementSoftware())
                .initiatingDepartment(parent.getInitiatingDepartment())
                .requester(parent.getRequester()).requestedAt(parent.getRequestedAt())
                .attachments(parent.getAttachments()).followUpRecords(parent.getFollowUpRecords())
                .questions(metadataSource.getQuestions()).status("DONE").role(parent.getRole())
                .reqType(parent.getReqType()).maxQuestions(parent.getMaxQuestions())
                .clarifyMode(parent.getClarifyMode()).model(parent.getModel()).engine(parent.getEngine())
                .documentProfile(DocumentProfile.normalize(parent.getDocumentProfile()))
                .createdByUserId(parent.getCreatedByUserId()).parentId(parentId)
                .createdAt(now).updatedAt(now).build();
        repo.insert(revision);
        fileStore.write(revision.getId(), initialPrdContent == null ? "" : initialPrdContent);
        repo.updateDone(revision.getId(), fileStore.pathFor(revision.getId()).toString());
        invalidateEffortEstimation(parent, "PRD 已产生新的修订版本");
        return repo.findById(revision.getId()).orElseThrow();
    }

    /** 新修订不会覆盖根 PRD 文件，因此额外写入失效原因，让根节点上的旧评估立即失效。 */
    private void invalidateEffortEstimation(PrdSession session, String reason) {
        if (session.getDevDocEstimation() == null || session.getDevDocEstimation().isBlank()) return;
        try {
            JsonNode parsed = mapper.readTree(session.getDevDocEstimation());
            if (parsed instanceof ObjectNode node) {
                node.put("invalidatedAt", System.currentTimeMillis());
                node.put("invalidatedReason", reason);
                repo.updateDevDocEstimation(session.getId(), mapper.writeValueAsString(node));
            }
        } catch (Exception e) {
            log.warn("[prd-clarify] 标记旧工时评估失效失败 sessionId={}: {}", session.getId(), e.getMessage());
        }
    }

    /**
     * 兼容旧前端/SSE 更新链路：旧实现会先把新版 PRD 原地写回根会话，随后网关以 524 结束，
     * 因而 PRD 库看不到修订子节点。恢复时把当前主文件提升为真正的 vN 子节点，再用更新前自动
     * 留下的最新 {parentId}-vN.md 备份还原根 PRD。备份只读不删除，失败时也不会丢失任何版本。
     */
    public PrdSession recoverInPlacePrdAsBackgroundRevision(String parentId, String changeReason) throws IOException {
        PrdSession parent = repo.findById(parentId)
                .orElseThrow(() -> new IllegalArgumentException("父 PRD 会话不存在: " + parentId));
        PrdSession metadataSource = repo.findLatestRevision(parentId).orElse(parent);
        java.nio.file.Path parentPath = fileStore.pathFor(parentId);
        java.nio.file.Path dir = parentPath.getParent();
        List<Integer> backups = scanPrdBackupVersions(dir, parentId);
        if (backups.isEmpty()) {
            throw new IllegalStateException("检测到旧版 PRD 已原地更新，但找不到更新前备份，无法安全恢复版本树");
        }
        int latestVersion = backups.get(backups.size() - 1);
        java.nio.file.Path backupPath = parentPath.resolveSibling(parentId + "-v" + latestVersion + ".md");
        String originalContent = java.nio.file.Files.readString(backupPath, java.nio.charset.StandardCharsets.UTF_8);
        String updatedContent = fileStore.read(parentId);
        if (updatedContent == null || updatedContent.isBlank()) {
            throw new IllegalStateException("检测到旧版 PRD 已更新，但当前新版文件为空，无法提升为修订节点");
        }

        // 必须显式复制根会话当前主文件；已有更早修订节点时不能误取“最新子节点”的旧内容。
        PrdSession revision = createBackgroundRevision(parent, metadataSource, changeReason, updatedContent);
        try {
            fileStore.write(parentId, originalContent);
            repo.updateDone(parentId, parentPath.toString());
            log.info("[prd-clarify] 已恢复旧版原地更新为修订树 parentId={} revisionId={} backup={}",
                    parentId, revision.getId(), backupPath);
            return revision;
        } catch (Exception restoreError) {
            // 子节点已经保存了新版；根文件仍保持新版或写入失败前状态，两个版本都没有丢失。
            throw new IOException("修订子节点已创建，但根 PRD 从备份还原失败: " + restoreError.getMessage(), restoreError);
        }
    }

    private static String value(String value) {
        return value == null ? "" : value;
    }

    /** 严格解析 TDD 批量技术问题；允许空数组（表示无需开发者补充决策）。 */
    private String parseDevDocQuestionsJson(String raw) throws JsonProcessingException {
        String cleaned = stripFence(raw == null ? "" : raw.trim());
        JsonNode source = mapper.readTree(cleaned);
        if (!source.isArray()) {
            throw new IllegalStateException("TDD 技术问题返回格式不是 JSON 数组");
        }
        ArrayNode result = mapper.createArrayNode();
        int id = 1;
        Set<String> seen = new LinkedHashSet<>();
        for (JsonNode node : source) {
            String question = node.isTextual() ? node.asText("").trim()
                    : node.path("question").asText("").trim();
            if (question.isBlank() || !seen.add(question)) continue;
            ObjectNode item = mapper.createObjectNode();
            item.put("id", id++);
            item.put("question", question);
            item.put("answer", "");
            result.add(item);
            if (result.size() >= DEV_DOC_UPDATE_MAX_QUESTIONS) break;
        }
        return mapper.writeValueAsString(result);
    }

    /** 将用户答案合并进已有的 questions JSON。 */
    private String mergeAnswers(String questionsJson, List<String> answers) {
        if (questionsJson == null || questionsJson.isBlank()) {
            return "[]";
        }
        try {
            JsonNode arr = mapper.readTree(questionsJson);
            if (!arr.isArray()) {
                return questionsJson;
            }
            ArrayNode result = mapper.createArrayNode();
            int idx = 0;
            for (JsonNode node : arr) {
                ObjectNode item = mapper.createObjectNode();
                item.put("id", node.path("id").asInt(idx + 1));
                item.put("question", node.path("question").asText(""));
                item.put("answer", idx < answers.size() ? answers.get(idx) : "");
                result.add(item);
                idx++;
            }
            return mapper.writeValueAsString(result);
        } catch (Exception e) {
            log.warn("[prd-clarify] 答案合并失败: {}", e.getMessage());
            return questionsJson;
        }
    }

    private String fallbackQuestions() {
        try {
            ArrayNode arr = mapper.createArrayNode();
            ObjectNode item = mapper.createObjectNode();
            item.put("id", 1);
            item.put("question", "请进一步描述您的核心需求和期望效果");
            item.put("answer", "");
            arr.add(item);
            return mapper.writeValueAsString(arr);
        } catch (JsonProcessingException e) {
            return "[{\"id\":1,\"question\":\"请进一步描述您的核心需求和期望效果\",\"answer\":\"\"}]";
        }
    }

    /** 构建多轮提问的 user prompt（原始需求 + 历史问答 + 当前轮次提示）。 */
    private String buildAskUserPrompt(PrdSession s, int questionIndex, List<QaPairRequest> history) {
        StringBuilder sb = new StringBuilder();
        sb.append("需求标题：").append(s.getTitle()).append("\n");
        if (s.getProject() != null && !s.getProject().isBlank()) {
            sb.append("项目：").append(s.getProject());
            if (s.getModule() != null && !s.getModule().isBlank()) {
                sb.append(" / ").append(s.getModule());
            }
            sb.append("\n");
        }
        sb.append("\n原始需求描述：\n").append(s.getRawInput()).append("\n\n");

        if (!history.isEmpty()) {
            sb.append("已完成的澄清问答（").append(history.size()).append("轮）：\n");
            for (var qa : history) {
                sb.append("问：").append(qa.question()).append("\n");
                sb.append("答：").append(qa.answer()).append("\n\n");
            }
        }

        appendGraphContext(sb, graphifyAskCache.computeIfAbsent(s.getId(),
                id -> queryGraphContext(s.getProject(), s.getModule(), s.getTitle())));
        appendDomainContext(sb, queryDomainContext(s.getProject(), s.getTitle()));

        int maxQuestions = s.getMaxQuestions() > 0 ? s.getMaxQuestions() : 5;
        int remaining = maxQuestions - questionIndex;
        sb.append("这是第 ").append(questionIndex + 1).append(" 个问题（本次澄清最多 ")
                .append(maxQuestions).append(" 轮，还可以最多再问 ")
                .append(remaining - 1).append(" 个）。\n");
        sb.append("请提出下一个最关键的澄清问题，或输出 [CLARIFICATION_COMPLETE]：");
        return sb.toString();
    }

    /** 匹配 rawInput 里粘贴图片产出的 Markdown 语法：![粘贴图片N](/api/prd-clarify/attachments/image/{id})。 */
    private static final Pattern PASTED_IMAGE_PATTERN =
            Pattern.compile("!\\[[^]]*]\\(/api/prd-clarify/attachments/image/([a-zA-Z0-9_]+)\\)");

    /** 单次调用最多带几张图片，避免一次粘贴几十张把请求体撑爆。 */
    private static final int MAX_IMAGES_PER_CALL = 6;

    /**
     * 单次调用图片原始字节总预算。Java↔sidecar 走 WebSocket 文本帧，默认单帧上限
     * {@code toolbox.claude-chat.ws.max-message-bytes}（8MB），Base64 还会再放大约 1.33 倍，
     * 单张 {@link ImageAttachmentStorageService} 允许存到 20MB——真按存储上限带满 6 张会直接
     * 撑爆 WS 帧、整条消息发不出去。这里用一个明显更保守的总字节预算兜底，超出后面的图片
     * 直接不带（只是 Claude 少看到几张，不影响已经收集到的部分正常发出）。
     */
    private static final long MAX_TOTAL_IMAGE_BYTES = 5L * 1024 * 1024;

    /** Anthropic Messages API 认可的图片 MIME，其余（如 image/bmp）静默跳过。 */
    private static final Set<String> SUPPORTED_IMAGE_MIME =
            Set.of("image/jpeg", "image/png", "image/gif", "image/webp");

    /**
     * 从 rawInput 解析出粘贴图片引用，读盘转 Base64，供 {@link AgentOneShotRunner} 的多模态重载
     * 使用，使 Claude 在澄清/生成阶段真正"看到"图片，而不只是收到一段引用文字。单张图片读取/
     * 不支持的 MIME 只跳过该张，不影响本次调用整体成功；超出总字节预算后不再收更多。
     */
    private List<AgentOneShotRunner.ImageInput> extractImagesFromRawInput(String rawInput) {
        if (rawInput == null || rawInput.isBlank()) {
            return List.of();
        }
        Matcher m = PASTED_IMAGE_PATTERN.matcher(rawInput);
        Set<String> ids = new LinkedHashSet<>();
        while (m.find() && ids.size() < MAX_IMAGES_PER_CALL) {
            ids.add(m.group(1));
        }
        if (ids.isEmpty()) {
            return List.of();
        }
        List<AgentOneShotRunner.ImageInput> images = new ArrayList<>();
        long totalBytes = 0;
        for (String id : ids) {
            try {
                ImageAttachmentStorageService.DownloadFile f = imageAttachmentStorage.locate(id);
                if (!SUPPORTED_IMAGE_MIME.contains(f.mime())) {
                    log.warn("[prd-clarify] 粘贴图片 {} MIME={} 不受多模态支持，跳过", id, f.mime());
                    continue;
                }
                long size = java.nio.file.Files.size(f.path());
                if (totalBytes + size > MAX_TOTAL_IMAGE_BYTES) {
                    log.warn("[prd-clarify] 粘贴图片总大小超出单次调用预算（{}MB），后续图片不再随请求发送",
                            MAX_TOTAL_IMAGE_BYTES / 1024 / 1024);
                    break;
                }
                byte[] bytes = java.nio.file.Files.readAllBytes(f.path());
                totalBytes += size;
                images.add(new AgentOneShotRunner.ImageInput(Base64.getEncoder().encodeToString(bytes), f.mime()));
            } catch (Exception e) {
                log.warn("[prd-clarify] 读取粘贴图片 {} 失败，跳过: {}", id, e.getMessage());
            }
        }
        return images;
    }

    /** 把 graphify CLI 查询结果（若有）拼进 prompt，作为「代码知识图谱查询结果」区块。 */
    private void appendGraphContext(StringBuilder sb, Optional<String> graphContext) {
        if (graphContext.isEmpty() || graphContext.get().isBlank()) {
            return;
        }
        sb.append("\n【代码知识图谱查询结果】（系统已直接调用 graphify CLI 查询，非 MCP，内容为真实代码事实）\n");
        sb.append(graphContext.get()).append("\n");
    }

    /**
     * 关联项目支持多选，落库时按逗号/顿号拼成一个字符串（跟 module 多选同样的处理方式，
     * 没有改表结构）。{@link GraphifyQueryService}/{@link DomainKnowledgeQueryService} 底层
     * 一次只认一个项目名，这里拆开逐个查再拼接结果，而不是把整串"kai-toolbox, yoooni"
     * 原样传下去——那样两个服务各自的项目目录解析/精确匹配都会直接查不到，多选就变成
     * 查询静默失效。
     */
    private static List<String> splitProjects(String project) {
        if (project == null || project.isBlank()) {
            return List.of();
        }
        return Arrays.stream(project.split("[,，、]"))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .distinct()
                .toList();
    }

    /**
     * 代码知识图谱查询，自动展开多选项目逐个查询后拼接（单项目时等价于直接查一次）。
     * 任一项目查询失败/查不到不影响其它项目，各自独立降级为"该项目无结果"。
     */
    private Optional<String> queryGraphContext(String project, String module, String title) {
        List<String> projects = splitProjects(project);
        if (projects.size() <= 1) {
            String p = projects.isEmpty() ? null : projects.get(0);
            return Optional.ofNullable(graphifyQuery.query(p, module, title));
        }
        StringBuilder merged = new StringBuilder();
        for (String p : projects) {
            String result = graphifyQuery.query(p, module, title);
            if (result != null && !result.isBlank()) {
                if (!merged.isEmpty()) {
                    merged.append("\n\n");
                }
                merged.append("--- 项目 ").append(p).append(" ---\n").append(result);
            }
        }
        return merged.isEmpty() ? Optional.empty() : Optional.of(merged.toString());
    }

    /** 业务知识图谱查询，多选项目的展开逻辑对齐 {@link #queryGraphContext}。 */
    private Optional<String> queryDomainContext(String project, String title) {
        List<String> projects = splitProjects(project);
        if (projects.size() <= 1) {
            String p = projects.isEmpty() ? null : projects.get(0);
            return Optional.ofNullable(domainKnowledgeQuery.query(p, title));
        }
        StringBuilder merged = new StringBuilder();
        for (String p : projects) {
            String result = domainKnowledgeQuery.query(p, title);
            if (result != null && !result.isBlank()) {
                if (!merged.isEmpty()) {
                    merged.append("\n\n");
                }
                merged.append("--- 项目 ").append(p).append(" ---\n").append(result);
            }
        }
        return merged.isEmpty() ? Optional.empty() : Optional.of(merged.toString());
    }

    /** 将多轮问答历史转换为 questions JSON 格式（供 generate() 读取）。 */
    private String buildQuestionsJson(List<QaPairRequest> history) {
        try {
            ArrayNode arr = mapper.createArrayNode();
            int idx = 1;
            for (var qa : history) {
                ObjectNode node = mapper.createObjectNode();
                node.put("id", idx++);
                node.put("question", qa.question());
                node.put("answer", qa.answer());
                arr.add(node);
            }
            return mapper.writeValueAsString(arr);
        } catch (JsonProcessingException e) {
            log.warn("[prd-clarify] buildQuestionsJson failed", e);
            return "[]";
        }
    }

    /** 去除可能的 ```json 或 ``` 围栏。 */
    private static String stripFence(String s) {
        if (s.startsWith("```")) {
            int start = s.indexOf('\n');
            int end = s.lastIndexOf("```");
            if (start > 0 && end > start) {
                return s.substring(start + 1, end).trim();
            }
        }
        return s;
    }

    // ───── SSE 工具方法 ─────

    /**
     * 向 SSE 推送文本增量。
     * 发送失败（客户端已断开）时先关闭 emitter，再抛出异常，使外层虚拟线程感知到断连
     * 并退出 {@code agentRunner.stream()} 循环，避免 LLM 调用继续浪费资源。
     */
    private void sendChunk(SseEmitter emitter, String chunk) {
        if (chunk == null || chunk.isEmpty()) {
            return;
        }
        try {
            emitter.send(SseEmitter.event().name("chunk").data(Map.of("content", chunk)));
        } catch (Exception e) {
            emitter.completeWithError(e);
            throw new IllegalStateException("SSE client disconnected", e);
        }
    }

    /** 后台 TDD 生成专用：客户端断开只停止推流，不取消模型任务和后续落盘。 */
    private void sendChunkBestEffort(SseEmitter emitter, String chunk, AtomicBoolean clientConnected) {
        if (chunk == null || chunk.isEmpty() || !clientConnected.get()) return;
        try {
            emitter.send(SseEmitter.event().name("chunk").data(Map.of("content", chunk)));
        } catch (Exception e) {
            clientConnected.set(false);
            log.info("[prd-clarify] TDD 后台生成客户端已断开，继续执行并落盘");
        }
    }

    private void sendDevDocProgress(SseEmitter emitter, String message, boolean continueOnDisconnect,
                                    AtomicBoolean clientConnected) {
        if (!continueOnDisconnect) {
            sendProgress(emitter, message);
            return;
        }
        if (!clientConnected.get()) return;
        try {
            emitter.send(SseEmitter.event().name("progress").data(Map.of("message", message)));
        } catch (Exception e) {
            clientConnected.set(false);
            log.info("[prd-clarify] TDD 后台生成客户端已断开，继续执行并落盘");
        }
    }

    private void sendDoneBestEffort(SseEmitter emitter, AtomicBoolean clientConnected) {
        if (!clientConnected.get()) return;
        try {
            emitter.send(SseEmitter.event().name("done").data("{}"));
            emitter.complete();
        } catch (Exception e) {
            clientConnected.set(false);
        }
    }

    private void sendDone(SseEmitter emitter) {
        try {
            emitter.send(SseEmitter.event().name("done").data("{}"));
            emitter.complete();
        } catch (Exception e) {
            emitter.completeWithError(e);
        }
    }

    private void sendProgress(SseEmitter emitter, String message) {
        try {
            emitter.send(SseEmitter.event().name("progress").data(Map.of("message", message)));
        } catch (Exception e) {
            emitter.completeWithError(e);
            throw new IllegalStateException("SSE client disconnected", e);
        }
    }

    private void sendError(SseEmitter emitter, Throwable err) {
        String message = err.getMessage() == null ? err.getClass().getSimpleName() : err.getMessage();
        try {
            emitter.send(SseEmitter.event().name("error").data(Map.of("message", message)));
            emitter.complete();
        } catch (Exception e) {
            // 连接已断，用触发 catch 的异常 e 而非业务异常 err，避免混淆日志
            emitter.completeWithError(e);
        }
    }
}
