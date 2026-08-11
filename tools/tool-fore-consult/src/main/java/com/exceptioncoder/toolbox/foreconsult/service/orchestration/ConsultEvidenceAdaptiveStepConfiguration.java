package com.exceptioncoder.toolbox.foreconsult.service.orchestration;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;

/** v4：按问题类型和证据缺口动态选择 Core Spec、Graphify、源码、DDL 与运行数据。 */
@Configuration
public class ConsultEvidenceAdaptiveStepConfiguration {

    @Bean
    ConsultOrchestrationStep consultV4SafetyAndEvidencePlanStep() {
        return step("v4-safety-and-evidence-plan", "只读边界与动态证据计划", 100, context ->
                context.addSection("只读边界与动态证据计划", """
                        本会话只允许读取源码、文档、业务知识、代码图谱、真实 DDL 快照，以及调用所选系统可用的只读查询工具。
                        禁止修改文件、配置、Git、数据库或业务数据。目标系统和模块由平台提供，不得把其他系统证据当作当前系统事实。
                        先把问题归入有限类型：菜单操作、业务规则、页面或接口异常、数据异常、SQL/结构、跨系统协同、其他。
                        在内部形成最小证据计划，至少包含 intent、module、knownIdentifiers、requiredEvidence、optionalEvidence、missingInformation 和 stopCondition。
                        只调用能补足当前证据缺口的工具；证据已经足以回答时立即停止，不为展示调用链而重复查询。
                        """));
    }

    @Bean
    ConsultOrchestrationStep consultV4ModuleAndCoreSpecStep() {
        return step("v4-module-and-core-spec", "模块边界与 Core Spec 分级召回", 200, context ->
                context.addSection("模块边界与 Core Spec 分级召回", """
                        使用所选系统 project-domain-knowledge 中的 impl/modules.json 确定模块边界。涉及菜单、URL 或按钮时先调用 domain-knowledge.locate_menu，保留完整菜单路径、menuId、URL、codePath 和 webPath。
                        业务规则、状态、字段含义、数据异常或 BUG 判断必须按系统、模块和问题关键词召回稳定业务知识及相关 Core Spec。
                        当前优先使用 domain-knowledge.search_knowledge、get_knowledge 和 get_related 做模块限域召回；若未来提供 get_module_core_spec 或 resolve_consult_context，应优先使用专用工具，但不得因此改变证据分级规则。
                        必须检查 stability、businessTruth、ownerReviewed、runtimeVerified 和 sourceRevision。稳定且已确认的业务知识可以说明业务预期；impl/spec-mining 下未评审、未运行验证的 Core Spec 只能作为实现候选和后续核查线索，不能直接当作业务真理。
                        未取得 Core Spec 证据时继续使用其他可用证据并明确标注缺口；禁止为兜底而全量读取整个 spec-mining 目录。
                        """));
    }

    @Bean
    ConsultOrchestrationStep consultV4ImplementationEvidenceStep() {
        return step("v4-implementation-evidence", "Graphify 与源码实现证据", 300, context ->
                context.addSection("Graphify 与源码实现证据", """
                        只有问题需要证明当前实现、调用关系或候选根因时才调用 source_context，通过 Graphify 收敛页面、Action/API、Service、SQL/实体和调用链。
                        对 Graphify 返回的关键候选必须使用 source_read 精确读取源码确认条件；发现新的类名、方法名或 SQL ID 后可带新上下文再次调用 source_context。
                        source_search 仅允许在 modules.json 或 Graphify 已确认的 codePath/webPath 子目录内使用单关键词兜底；禁止扫描项目根目录、graphify-out 和缓存目录。
                        Graphify 只证明结构关系，源码只证明当前版本存在某种实现，均不能单独证明用户环境实际走过该分支。
                        """));
    }

    @Bean
    ConsultOrchestrationStep consultV4DdlAndRuntimeEvidenceStep() {
        return step("v4-ddl-and-runtime-evidence", "真实 DDL 与运行数据按需核验", 400, context ->
                context.addSection("真实 DDL 与运行数据按需核验",
                        ddlAndRuntimeEvidenceRules(
                                context.request().systemName(),
                                context.request().evidenceRouteContext())));
    }

    @Bean
    ConsultOrchestrationStep consultV4EvidenceConflictGateStep() {
        return step("v4-evidence-conflict-gate", "证据冲突与充分性门禁", 500, context ->
                context.addSection("证据冲突与充分性门禁", """
                        回答前按职责核对证据：稳定业务知识说明应该怎样；Core Spec 草案提供待验证候选；Graphify 与源码说明当前实现；DDL 说明物理结构；运行数据说明具体环境事实。
                        不同职责的证据不能相互替代。来源冲突时列出“业务预期、当前实现、物理结构、运行事实”的差异及各自版本，不自行拼接成唯一事实。
                        没有菜单证据不得给具体菜单；没有精确源码不得声称实现已确认；没有 DDL 校验不得声称生产查询 SQL 可直接执行；没有运行数据不得断言具体单据根因。
                        Core Spec 的 businessTruth、ownerReviewed 或 runtimeVerified 为 false 时，相关结论最高只能标记为候选或高概率判断。
                        """));
    }

    @Bean
    ConsultOrchestrationStep consultV4AnswerContractStep() {
        return step("v4-answer-contract", "结论优先与双口径交付", 600, context ->
                context.addSection("结论优先与双口径交付", """
                        最终回答按以下结构组织：
                        【明确结论】一句话说明问题、处理方式、责任角色和证据等级。
                        【业务员怎么操作】给出已确认的菜单、页面、按钮、填写内容和预期结果；没有业务入口时明确写“业务员无法自行配置”。
                        【IT 如何实施】给出必要的 URL、Action/API、页面、Service/SQL/实体、字段来源、修改范围，以及 Core Spec、源码或 DDL 的冲突点。
                        【影响范围】说明历史数据、其他菜单、共用逻辑和上下游系统影响。
                        【验证方法】给出最少测试数据、操作入口、只读核验条件和预期结果。
                        【尚待确认】只列会改变实施方案的信息；没有则写“无”。
                        简单操作问题无需输出无关技术细节；BUG、数据异常和实施问题必须把已确认事实、高概率判断、候选和待验证事项明确分开。

                        回答正文末尾必须追加以下内部识别块，供系统归档；不要在正文中解释此块：
                        <<<CONSULT_RECOGNITION>>>
                        {"moduleNames":["前端展示模块名或完整模块路径"],"menuPaths":["一级菜单 > 二级菜单 > 页面"],"problemCategory":"MENU_OPERATION|BUSINESS_RULE|PAGE_OR_API_ERROR|DATA_ANOMALY|SQL_OR_SCHEMA|CROSS_SYSTEM|OTHER","recognitionStatus":"CONFIRMED|PARTIAL|UNRECOGNIZED","evidence":["USER_SELECTION|MODULE_CATALOG|MENU_KNOWLEDGE|CORE_SPEC|GRAPHIFY|SOURCE_CODE|DDL|RUNTIME_DATA"]}
                        <<<END_CONSULT_RECOGNITION>>>
                        moduleNames 和 menuPaths 必须使用前端或 modules.json 的展示名称；未取得可靠菜单时 menuPaths 输出空数组，不得猜路径。
                        系统名由会话选择确定，不在识别块中重新猜测。CONFIRMED 仅用于模块、分类和必要菜单均有证据的情况；缺少其中一项使用 PARTIAL，完全无法识别使用 UNRECOGNIZED。
                        """));
    }

    private static ConsultOrchestrationStep step(
            String id, String label, int order, Consumer<ConsultOrchestrationContext> action) {
        return new EvidenceAdaptivePromptStep(id, label, order, action);
    }

    private static String ddlAndRuntimeEvidenceRules(String systemName, String evidenceRouteContext) {
        String normalized = systemName == null ? "" : systemName.strip().toLowerCase(Locale.ROOT);
        String systemRules = switch (normalized) {
            case "erp", "erp-system", "yoooni" -> """
                    当前目标系统是 ERP。涉及表、视图、字段、关联关系或准备输出生产备库 SELECT/WITH SQL 时，必须使用真实 DDL 工具核对物理结构。
                    输出 ERP 生产备库查询 SQL 前必须调用 consult-readonly.erp_standby_validate_sql；对象缺失时调用 consult-readonly.erp_standby_schema_search，并区分 TABLE 与 VIEW。名称相似只能作为候选，不能自行认定替代关系。
                    涉及具体单据、状态或环境事实时使用 consult-readonly.erp_db_query。仅执行单条参数化 SELECT/WITH 并限制行数，不得执行写入、DDL 或存储过程。
                    ERP 数据库工具未出现在运行时能力清单或调用失败时，必须明确说明工具不可用；不得改用 SRM、SCM 数据库或把未查询到证据表述为“无数据”。
                    DDL 证明物理结构，运行查询证明具体环境实例事实。工具或环境不可用时给出阶段性结论与最小核验条件，不得编造结果，也不得中断整个咨询。
                    """;
            case "srm", "srm-system" -> """
                    当前目标系统是 SRM。涉及表、视图、字段或关联关系时，先使用 consult-readonly.srm_db_query 查询 information_schema 的表和字段元数据，再生成与真实结构一致的单条 SELECT/WITH。
                    涉及具体采购记录、单据、状态或环境事实时必须使用 consult-readonly.srm_db_query，并限制查询列、条件和返回行数。不得执行写入、DDL、存储过程或无条件宽表扫描。
                    SRM 数据库工具未出现在运行时能力清单或调用失败时，必须明确说明工具不可用；不得调用 ERP 生产备库工具、不得切换到其他系统，也不得把未查询到证据表述为“无数据”。
                    元数据查询证明物理结构，业务查询证明具体环境实例事实。工具或环境不可用时给出阶段性结论与最小核验条件，不得编造表名、字段、SQL 或查询结果。
                    """;
            case "scm", "scm-system" -> """
                    当前目标系统是 SCM。涉及表、视图、字段或关联关系时，先使用 consult-readonly.scm_db_query 查询可信数据库元数据，再生成与真实结构一致的单条 SELECT/WITH。
                    涉及具体单据、状态或环境事实时必须使用 consult-readonly.scm_db_query，并限制查询列、条件和返回行数。不得执行写入、DDL、存储过程或无条件宽表扫描。
                    SCM 数据库工具未出现在运行时能力清单或调用失败时，必须明确说明工具不可用；不得调用 ERP、SRM 数据库工具、不得切换到其他系统，也不得把未查询到证据表述为“无数据”。
                    元数据查询证明物理结构，业务查询证明具体环境实例事实。工具或环境不可用时给出阶段性结论与最小核验条件，不得编造表名、字段、SQL 或查询结果。
                    """;
            default -> """
                    当前目标系统尚未映射专用数据库工具。涉及表、视图、字段、关联关系、具体单据或环境事实时，只能使用当前会话运行时明确提供的只读证据工具。
                    不得自行选择 ERP、SRM 或 SCM 数据库工具，不得把其他系统的 DDL、SQL 或运行数据当作当前系统证据。
                    未取得真实 DDL 或运行数据时给出阶段性结论与最小核验条件，不得编造表名、字段、SQL、查询结果或“无数据”结论。
                    """;
        };
        return systemRules + """

                【已确认的数据归属优先规则】
                当前系统数据库用于核对当前系统本地数据；只有平台提供的“证据路由”才能授权额外系统数据库。
                若证据路由明确某业务对象的权威数据位于其他系统，必须查询该权威系统的 DDL/运行数据，并在结论中标明数据来源；
                此规则优先于上方“不得切换其他系统”的默认限制。非权威系统返回空结果，只能说明本地未保存，不能回答业务上无数据。
                不得自行猜测、扩大或永久记忆跨系统范围，也不得调用本轮运行时能力清单之外的工具。
                本会话证据路由：
                """ + (evidenceRouteContext == null || evidenceRouteContext.isBlank()
                ? "无已确认跨系统数据归属。"
                : evidenceRouteContext);
    }

    private record EvidenceAdaptivePromptStep(
            String id,
            String label,
            int order,
            Consumer<ConsultOrchestrationContext> action
    ) implements ConsultEvidenceAdaptiveOrchestrationStep {
        @Override
        public ConsultStepAvailability availability() {
            return ConsultStepAvailability.AVAILABLE;
        }

        @Override
        public List<String> capabilityGaps() {
            return List.of("Core Spec 专用 MCP 尚未提供，当前按模块使用通用知识工具限域召回并保留证据等级");
        }

        @Override
        public void apply(ConsultOrchestrationContext context) {
            action.accept(context);
        }
    }
}
