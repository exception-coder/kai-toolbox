package com.exceptioncoder.toolbox.foreconsult.domain;

import java.util.List;

/** 只接受正文与受限版式；代码由独立WASM解释器转成数据后进入此边界。 */
public record ConsultDocumentRequest(
        String format,
        String title,
        List<Section> sections,
        List<Sheet> sheets,
        List<Slide> slides,
        ConsultDocumentLayout layout) {

    /** 兼容原有快速导出调用。 */
    public ConsultDocumentRequest(String format, String title, List<Section> sections,
                                  List<Sheet> sheets, List<Slide> slides) {
        this(format, title, sections, sheets, slides, null);
    }

    /** Word 正文块，可包含标题、段落和一张表格。 */
    public record Section(String heading, List<String> paragraphs, List<List<String>> table) { }

    /** Excel 工作表；数值和布尔值保持类型，字符串永远不解释成公式。 */
    public record Sheet(String name, List<String> columns, List<List<Object>> rows) { }

    /** PPT 单页，受限的标题和要点，避免文本超出画布。 */
    public record Slide(String title, List<String> bullets) { }
}
