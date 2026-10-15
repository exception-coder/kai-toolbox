package com.exceptioncoder.toolbox.foreconsult.domain;

/** 平台文档能力与固定安全规则，不授予通用写入权。 */
public final class ConsultDocumentPolicy {
    public static final String TOOL = "generate_consult_document";
    public static final String INSTRUCTIONS = "以下平台固定例外适用于节点中的通用只读文件约束。用户需要 Word、Excel、PPT 时，允许通过 consult-readonly."
            + TOOL + " 提交结构化内容，由平台仅在本机 .kai-toolbox/consult-artifacts/会话目录生成 docx/xlsx/pptx。"
            + "这是唯一文档写入例外；不得执行脚本、指定保存路径、读写模板、创建宏或修改源码、配置、数据库、业务数据。"
            + "工具成功后使用返回的 downloadUrl 给出真实 Markdown 下载链接；文件也会显示在当前咨询的生成文档区。"
            + "失败需说明原因，不得伪造路径或宣称文件已生成；相同内容重试复用同一文件。"
            + "Excel 保留数字和文本类型，字符串不执行公式；长 PPT 内容请拆页。";

    private ConsultDocumentPolicy() { }
}
