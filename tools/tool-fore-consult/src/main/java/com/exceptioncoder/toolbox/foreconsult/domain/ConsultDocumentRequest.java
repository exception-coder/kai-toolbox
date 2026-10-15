package com.exceptioncoder.toolbox.foreconsult.domain;

import java.util.List;

/** 仅接受内容数据，不接受路径、模板、URL、脚本、公式或宏。 */
public record ConsultDocumentRequest(
        String format,
        String title,
        List<Section> sections,
        List<Sheet> sheets,
        List<Slide> slides) {

    /** Word 正文块，可包含标题、段落和一张表格。 */
    public record Section(String heading, List<String> paragraphs, List<List<String>> table) { }

    /** Excel 工作表；数值和布尔值保持类型，字符串永远不解释成公式。 */
    public record Sheet(String name, List<String> columns, List<List<Object>> rows) { }

    /** PPT 单页，受限的标题和要点，避免文本超出画布。 */
    public record Slide(String title, List<String> bullets) { }
}
