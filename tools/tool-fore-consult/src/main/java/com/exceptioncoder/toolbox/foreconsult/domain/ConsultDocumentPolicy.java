package com.exceptioncoder.toolbox.foreconsult.domain;

/** 平台文档能力与固定安全规则，不授予通用写入权。 */
public final class ConsultDocumentPolicy {
    public static final String TOOL = "generate_consult_document";
    public static final java.util.List<String> TOOLS = java.util.List.of(TOOL, "design_consult_document", "preview_consult_document");
    public static final String INSTRUCTIONS = "以下平台固定例外适用于节点中的通用只读文件约束。用户需要 Word、Excel、PPT 时，允许通过 consult-readonly."
            + TOOL + " 提交结构化内容，由平台仅在本机 .kai-toolbox/consult-artifacts/会话目录生成 docx/xlsx/pptx。"
            + "这是唯一文档写入例外；不得执行脚本、指定保存路径、读写模板、创建宏或修改源码、配置、数据库、业务数据。"
            + "工具成功后使用返回的 downloadUrl 给出真实 Markdown 下载链接；文件也会显示在当前咨询的生成文档区。"
            + "失败需说明原因，不得伪造路径或宣称文件已生成；相同内容重试复用同一文件。"
            + "Excel 保留数字和文本类型，字符串不执行公式；长 PPT 内容请拆页。"
            + "文档创作固定例外：需要设计感、图表或排版时，优先调用 design_consult_document，编写纯JavaScript函数体读取data并返回正文及layout。"
            + "该代码仅由无文件/网络/宿主API的WASM解释器处理，不在终端执行；不允许Python/Node脚本或任意代码工具。"
            + "可自行设计PPT可编辑图形、Word层级与Excel列宽/纯计算公式/原生图表，参数契约见工具说明。"
            + "工具返回预览后必须检查，再修改代码重生成；超过4页的PPT使用preview_consult_document分批检查。"
            + "Word/Excel是结构预览，不能声称最终分页已核验；预览失败时保留已生成文件并明确说明，不伪造视觉验收。";

    private ConsultDocumentPolicy() { }
}
