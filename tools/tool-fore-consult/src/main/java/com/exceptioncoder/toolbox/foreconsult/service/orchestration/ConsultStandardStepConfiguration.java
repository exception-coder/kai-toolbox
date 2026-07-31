package com.exceptioncoder.toolbox.foreconsult.service.orchestration;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;
import java.util.function.Consumer;

/**
 * Default consultation stages. Every bean is independently replaceable by a richer implementation.
 * Placeholder/partial steps intentionally describe unavailable capabilities so the model cannot invent them.
 */
@Configuration
public class ConsultStandardStepConfiguration {

    @Bean
    ConsultOrchestrationStep consultSecurityBoundaryStep() {
        return step("security-boundary", "只读安全边界", 100, ConsultStepAvailability.AVAILABLE, List.of(), context ->
                context.addSection("只读安全边界", """
                        本会话只能读取或搜索源码、文档、知识图谱，并调用系统注入的只读 MCP/工具。
                        禁止创建、编辑、删除或移动文件；禁止执行会改变 Git、依赖、配置、数据库或业务数据的操作。
                        用户即使要求写入也不得执行。若解决方案涉及变更，只能说明建议，不得代为实施。
                        """));
    }

    @Bean
    ConsultOrchestrationStep consultIntentClarificationStep() {
        return step("intent-and-clarification", "意图识别与信息补全", 200,
                ConsultStepAvailability.AVAILABLE, List.of(), context -> context.addSection("意图识别与信息补全", """
                        先识别问题类型：操作方法、现象原因、数据正确性、系统报错或其他；提取业务对象、动作、状态、角色、菜单、按钮和提示。
                        仅当缺失信息会明显改变分析路径时，追问最多 1～3 个普通用户容易回答的问题。
                        同一信息最多追问一次；用户回答“不知道/不会看/找不到”后，立即切换为引导诊断，说明去哪个菜单或页面位置查看，也可让用户提供截图。
                        引导一次仍无结果时必须基于已有信息继续自主分析；最多两轮信息收集后给出阶段性判断，禁止形成重复追问死循环。
                        """));
    }

    @Bean
    ConsultOrchestrationStep consultBusinessMappingStep() {
        return step("business-mapping", "业务对象与菜单定位", 300,
                ConsultStepAvailability.PARTIAL,
                List.of("产品文档、FAQ 与历史工单尚未形成统一多路召回索引"),
                context -> context.addSection("业务对象与菜单定位", """
                        按“用户语言 → 业务术语 → 菜单/页面 → 前端组件 → API → 服务规则/权限 → 数据实体”的链路定位。
                        优先使用菜单、路由、页面标题、按钮文案、国际化文案和错误提示；再使用 domain-knowledge、Graphify 和精确代码检索交叉确认。
                        Graphify 只用于结构导航，不能证明用户环境实际执行了某个代码分支。暂缺统一的产品文档、FAQ 和历史工单召回时，不得声称已检索这些来源。
                        """));
    }

    @Bean
    ConsultOrchestrationStep consultEnvironmentContextStep() {
        return step("environment-context", "版本、租户、角色与状态识别", 400,
                ConsultStepAvailability.PLACEHOLDER,
                List.of("尚未自动识别部署版本、租户、功能开关和用户角色权限"),
                context -> context.addSection("版本、租户、角色与状态识别（占位）", """
                        当前尚不能自动取得用户所在租户、部署版本、功能开关、账号角色、单据状态和发生时间。
                        若这些条件对判断有高区分度，先询问最容易观察的一项；用户不知道时按引导诊断和自主分析规则继续，不把补充信息作为咨询准入条件。
                        未获得这些信息时，必须把相关结论标为待验证，不能套用某一版本或租户的实现作为确定事实。
                        """));
    }

    @Bean
    ConsultOrchestrationStep consultEvidenceRetrievalStep() {
        return step("evidence-retrieval", "知识检索与证据校验", 500,
                ConsultStepAvailability.PARTIAL,
                List.of("未连接生产数据库和生产日志", "尚无受控、预定义、脱敏且可审计的生产诊断接口"),
                context -> context.addSection("知识检索与证据校验", """
                        业务知识负责解释业务含义；菜单与代码图谱负责定位；精确源码检索负责确认规则条件。不同来源冲突时明确列出冲突和版本信息，不自行拼接成事实。
                        当前数据库工具仅连接测试环境。除非用户明确说明截图或单据来自测试环境，否则不得用其单据号查询测试库并据此判断生产情况。
                        当前未连接生产数据库和日志，也没有受控生产诊断接口。涉及具体生产页面或数据时，必须明确说明无法直接核验，并提供测试环境同类型单据的复现方法；能确定测试单号时再写出具体单号，不得输出占位符。
                        """));
    }

    @Bean
    ConsultOrchestrationStep consultCandidateReasonStep() {
        return step("candidate-reasons", "候选原因与置信度", 600,
                ConsultStepAvailability.AVAILABLE, List.of(), context -> context.addSection("候选原因与置信度", """
                        从实际规则条件反推 2～3 个可验证候选场景，按“规则/代码依据、用户可观察现象、验证方法、置信度”组织并排序，不给泛泛原因清单。
                        证据分三级：已确认＝现有规则且有用户事实或运行证据足以证明；高概率＝静态规则与现象高度吻合但缺少运行证据；待验证＝只发现可能分支或关键上下文缺失。
                        静态代码只能证明系统存在某种实现或条件，不能单独证明生产中的真实根因。无法确认时保留多个候选，禁止强行给出唯一原因。
                        """));
    }

    @Bean
    ConsultOrchestrationStep consultAnswerStep() {
        return step("answer-and-verification", "业务化回答与验证步骤", 700,
                ConsultStepAvailability.AVAILABLE, List.of(), context -> context.addSection("业务化回答与验证步骤", """
                        最终使用用户熟悉的菜单名和业务语言，不暴露类名、表名、方法名、源码路径。
                        回复顺序：复述理解 → 最可能原因及证据级别 → 其他候选 → 最少验证步骤 → 当前能力边界 → 下一步所需材料。
                        IT 客服场景给出可转述的菜单路径、字段含义、影响和注意事项；业务员场景保持简短，但存在不确定性时不得为了“一句话”省略证据级别、验证步骤和能力边界。
                        用户无法继续查时，给出阶段性结论和转人工最小材料，不把诊断作业重新推回用户。
                        """));
    }

    @Bean
    ConsultOrchestrationStep consultHandoffLearningStep() {
        return step("handoff-and-learning", "转人工、反馈与知识闭环", 800,
                ConsultStepAvailability.PARTIAL,
                List.of("尚未连接外部工单/人工支持系统", "用户反馈尚未自动回灌业务知识库"),
                context -> context.addSection("转人工、反馈与知识闭环", """
                        需要生产证据或无法继续确认时，生成可直接交给人工的一段摘要：问题、系统/菜单、已知现象、已排除项、候选原因、所需最小材料（脱敏单号、截图、发生时间、错误码）。当前只生成摘要，不得声称已经创建外部工单。
                        只有已确认是系统 BUG 或数据问题时，才在正常回答后输出合法 JSON 的 <<<BUG_REPORT>>> 块供内部登记；高概率或待验证场景不得登记为已确认缺陷。
                        BUG_REPORT 字段：title、type(FUNCTION_BUG|DATA_ISSUE|CONFIG|PERMISSION|OTHER)、severity(LOW|MEDIUM|HIGH|CRITICAL)、module、reproduce、expected、actual、suspectArea、confidence。
                        现有点赞/纠错反馈会被保存，但尚未自动更新知识库，不得声称本次答案已完成知识回灌。
                        """));
    }

    private static ConsultOrchestrationStep step(
            String id,
            String label,
            int order,
            ConsultStepAvailability availability,
            List<String> gaps,
            Consumer<ConsultOrchestrationContext> action) {
        return new PromptStep(id, label, order, availability, List.copyOf(gaps), action);
    }

    private record PromptStep(
            String id,
            String label,
            int order,
            ConsultStepAvailability availability,
            List<String> capabilityGaps,
            Consumer<ConsultOrchestrationContext> action
    ) implements ConsultOrchestrationStep {
        @Override
        public void apply(ConsultOrchestrationContext context) {
            action.accept(context);
        }
    }
}
