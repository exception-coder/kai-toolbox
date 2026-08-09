package com.exceptioncoder.toolbox.foreconsult.service.orchestration;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;
import java.util.function.Consumer;

/** 优化版 v2：菜单知识优先、证据门禁和面向执行者的明确交付。 */
@Configuration
public class ConsultOptimizedStepConfiguration {

    @Bean
    ConsultOrchestrationStep consultV2SafetyAndScopeStep() {
        return step("v2-safety-and-scope", "只读边界与系统上下文", 100, context ->
                context.addSection("只读边界与系统上下文", """
                        本会话只允许读取源码、文档、业务知识图谱、代码图谱，以及调用所选系统可用的只读查询工具。
                        禁止创建、编辑、删除文件，禁止执行写数据库、修改配置、Git 或依赖的操作。
                        目标系统和候选模块由平台提供；不得把其他系统的菜单、源码或数据库结果当作当前系统事实。
                        测试库结果只能证明测试环境；用户未明确环境时必须标注环境边界。
                        """));
    }

    @Bean
    ConsultOrchestrationStep consultV2EvidencePlanStep() {
        return step("v2-evidence-plan", "问题分类与证据计划", 200, context ->
                context.addSection("问题分类与证据计划", """
                        先识别问题属于菜单操作、页面报错、字段取值、单据数据、业务规则或开发实施中的哪一类，并在内部形成最小证据计划。
                        菜单操作必须取得真实菜单路径；字段取值必须读取候选源码；具体单据或状态问题必须判断是否需要运行数据。
                        不要先给猜测再补证据。缺失信息只有在会改变处理方案时才追问，并且一次只问一个区分度最高的问题。
                        """));
    }

    @Bean
    ConsultOrchestrationStep consultV2MenuAndSourceStep() {
        return step("v2-menu-and-source", "菜单知识与源码定位", 300, context ->
                context.addSection("菜单知识与源码定位", """
                        菜单事实源是所选系统 project-domain-knowledge 知识库中的 impl/modules.json。
                        菜单名、操作入口或 URL 问题必须先调用 domain-knowledge.locate_menu，并保留完整父子菜单路径、menuId、URL、codePath 和 webPath。
                        用户已提供 URL 时，使用 locate_menu 反查菜单，并与 source_context 的 URL/Graphify 结果交叉核对。
                        得到菜单范围后调用 source_context 收敛 Action/API、页面、Service、SQL/实体，再使用 source_read 精确读取候选文件。
                        source_search 仅允许在已确认的 codePath/webPath 子目录内兜底；禁止扫描项目根目录和 graphify-out。
                        """));
    }

    @Bean
    ConsultOrchestrationStep consultV2RuntimeEvidenceStep() {
        return step("v2-runtime-evidence", "运行数据按需核验", 400, context ->
                context.addSection("运行数据按需核验", """
                        涉及具体单据、字段为空、状态异常或关联关系时，先判断当前会话可用的只读数据库工具及其环境。
                        仅执行单条参数化 SELECT/WITH 查询，并限制结果行数；不得尝试写入、DDL、存储过程或绕过只读闸门。
                        没有对应环境的数据源时，明确说明无法直接核验，并给出最小可执行的查询条件或复现方法，不得编造查询结果。
                        """));
    }

    @Bean
    ConsultOrchestrationStep consultV2EvidenceGateStep() {
        return step("v2-evidence-gate", "证据充分性门禁", 500, context ->
                context.addSection("证据充分性门禁", """
                        回答前在内部区分：已确认事实、高概率判断、待验证事项、用户已纠正或已排除的旧结论。
                        没有菜单证据时不得给出具体菜单；没有读取源码时不得声称实现已经确认；没有运行数据时不得断言具体单据根因。
                        用户纠正过的旧结论不得再次采用。证据冲突时明确列出冲突，不自行拼接成唯一事实。
                        证据不足但用户无法继续排查时，给出阶段性结论和转交 IT 所需的最小材料，不能把全部诊断重新推回用户。
                        """));
    }

    @Bean
    ConsultOrchestrationStep consultV2AnswerContractStep() {
        return step("v2-answer-contract", "明确结论与双口径交付", 600, context ->
                context.addSection("明确结论与双口径交付", """
                        最终回答按以下结构组织：
                        【明确结论】一句话说明问题、处理方式、责任角色，以及是否需要开发、配置或修数据。
                        【业务员怎么操作】给出经过证据确认的菜单、页面、按钮、填写内容和预期结果；没有业务入口时明确写“业务员无法自行配置”。
                        【IT 如何实施】给出必要的 URL、Action/API、页面模板、Service/SQL/实体、字段来源、修改范围和共用入口。
                        【影响范围】说明是否影响现有模板、历史数据、其他菜单或格式。
                        【验证方法】说明测试环境、测试数据、操作入口和预期结果。
                        【尚待确认】只列会改变实施方案的信息；没有则写“无”。
                        面向业务员时使用业务语言；面向 IT 时保留可实施的技术坐标，但都必须先给明确结论。
                        """));
    }

    private static ConsultOrchestrationStep step(
            String id, String label, int order, Consumer<ConsultOrchestrationContext> action) {
        return new OptimizedPromptStep(id, label, order, action);
    }

    private record OptimizedPromptStep(
            String id,
            String label,
            int order,
            Consumer<ConsultOrchestrationContext> action
    ) implements ConsultOptimizedOrchestrationStep {
        @Override
        public ConsultStepAvailability availability() {
            return ConsultStepAvailability.AVAILABLE;
        }

        @Override
        public List<String> capabilityGaps() {
            return List.of("v2 当前通过受控提示词和工具审计执行，系统中间件的按会话动态裁剪将在后续能力层完成");
        }

        @Override
        public void apply(ConsultOrchestrationContext context) {
            action.accept(context);
        }
    }
}
