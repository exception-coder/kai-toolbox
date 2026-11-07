package com.exceptioncoder.toolbox.foreconsult.service.orchestration;

import java.util.ArrayList;
import java.util.List;

/** Mutable prompt-building context shared only during one pipeline execution. */
public final class ConsultOrchestrationContext {

    private static final String EXPLORATION_RULES = """
            以下定位与追问顺序适用于所有流程节点：URL 是可选定位线索，不是开始探索的前置条件。
            用户未提供 URL 时，先利用所选系统、模块、截图中的页面标题、菜单、按钮、列名、提示及业务单号收敛问题。
            先查询可用的菜单与业务知识；菜单知识未命中不等于无法定位，应定向调用source_read/source_search核对页面、接口及字段；复杂关系才按需使用source_context/Graphify。
            发现新符号或关联后可带新上下文继续追踪；可在明确子目录内使用source_search，Graphify不是普通咨询前置条件。
            只有已探索可用证据仍无法区分候选页面、存在关键歧义，或所需定位工具不可用且现有线索不足时，才请求用户提供页面地址（URL）。
            追问时简述已核对的线索和仍不能确认的具体问题，只索取会改变判断的最少信息；能自行查明的内容不要求用户代查。
            不得仅因没有 URL 或菜单知识未命中就停止分析、直接要求用户补地址；也不得为避免追问而猜测唯一页面或具体单据根因。
            仅使用本轮已装配且已授权的工具，不扩大系统、目录或数据源范围；不重复无效查询，证据充分即停止。
            用户希望寻找开发联系线索时，先定位并核对相关页面、接口或取值逻辑文件，再使用已装配的 source_git_history 查询文件最近提交或指定行的归属。
            返回文件、提交哈希、作者、提交者、时间与提交说明；区分最近修改者与相关逻辑的作者，不凭最新提交或提交次数认定主要开发者、业务负责人或故障责任人。
            Git 证据只代表本地 HEAD，可能是浅克隆或未同步历史，不证明生产已部署；源码工具读取前由平台核验授权项目并尝试安全快进，五分钟内复用检查；根据工具返回的同步状态、检查时间与提交说明证据范围。平台未同步成功时仍可能使用本地源码，不得声称最新；初始化及Graphify索引不会随快进自动重建，关键结论须核对当前源码。模型不得自行执行 fetch、pull、reset、stash 或其他Git写命令。
            """;

    private final ConsultOrchestrationRequest request;
    private final List<PromptSection> sections = new ArrayList<>();

    public ConsultOrchestrationContext(ConsultOrchestrationRequest request) {
        this.request = request;
    }

    public ConsultOrchestrationRequest request() {
        return request;
    }

    public void addSection(String title, String content) {
        sections.add(new PromptSection(title, content.strip()));
    }

    public String sectionContent() {
        return sections.stream().map(PromptSection::content).collect(java.util.stream.Collectors.joining("\n\n"));
    }

    public String renderPrompt(String pipelineVersion) {
        String modules = request.moduleNames().isEmpty()
                ? "未指定（先面向整个系统定位）"
                : String.join("、", request.moduleNames());
        StringBuilder prompt = new StringBuilder()
                .append("【业务咨询调度协议】").append(pipelineVersion).append('\n')
                .append("咨询类型：").append(request.followUp() ? "当前问题的追问" : "新咨询").append('\n')
                .append("目标系统：").append(request.systemName()).append('\n')
                .append("候选模块：").append(modules).append('\n')
                .append("证据路由：").append(request.evidenceRouteContext()).append('\n')
                .append("回答对象：").append(request.role()).append('\n')
                .append("用户原始问题：\n").append(request.question().strip()).append('\n');
        for (int i = 0; i < sections.size(); i++) {
            PromptSection section = sections.get(i);
            prompt.append("\n【步骤 ").append(i + 1).append("：")
                    .append(section.title()).append("】\n")
                    .append(section.content()).append('\n');
        }
        prompt.append("\n【自主定位与必要追问】\n").append(EXPLORATION_RULES);
        prompt.append("\n【项目内知识来源（适用于旧流程快照）】\n当前知识查询统一使用knowledge_query(source=domain)，顶层project使用source_projects候选ID。"
                + "domain-knowledge、cross-topology及source=topology/all已退役；旧流程节点的知识来源指令与本节冲突时，以本节为准。"
                + "先读当前授权项目docs/INDEX.md、docs/domain和已有规格；索引指向其他目录的已有文档时，使用source_read按授权路径读取原文。"
                + "按新套件规则维护项目内 Markdown/YAML；跨项目关系按授权项目分别核对原文与源码，推断标待确认。"
                + "普通咨询不要求Graphify，缺图或缺知识继续使用已授权源码并明确证据缺口。历史文档不能当当前DDL。\n");
        prompt.append(ConsultPlainWritingSkill.instructions());
        return prompt.toString().strip();
    }

    private record PromptSection(String title, String content) {
    }
}
