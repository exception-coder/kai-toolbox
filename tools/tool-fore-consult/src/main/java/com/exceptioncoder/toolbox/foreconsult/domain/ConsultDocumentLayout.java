package com.exceptioncoder.toolbox.foreconsult.domain;

import java.util.List;

/** 模型生成的可编辑版式；仅数据指令，不承载路径、代码、宏或外部资源。 */
public record ConsultDocumentLayout(Theme theme, Word word, List<Page> pages, List<SheetStyle> sheets) {
    /** 六位RGB颜色与预置字体。 */
    public record Theme(String accent, String background, String foreground, String font) { }
    /** Word采用原生流式排版，字号和纸张方向由模型决定。 */
    public record Word(Double titleSize, Double headingSize, Double bodySize, Boolean landscape) { }
    /** PPT画布为960×540，元素按列表顺序叠放。 */
    public record Page(String background, List<Element> elements) { }
    /** 原生可编辑文字、矩形、椭圆或直线；尺寸单位为point。 */
    public record Element(String kind, Double x, Double y, Double w, Double h, String text,
                          Double fontSize, String color, String fill, Boolean bold, String align) { }
    /** Excel样式按0起始工作表索引定位。 */
    public record SheetStyle(Integer sheet, List<Double> widths, List<String> formats,
                             List<Formula> formulas, Chart chart) { }
    /** 行列均从0开始，行0是表头；公式只能使用当前表内引用和允许的函数。 */
    public record Formula(Integer row, Integer column, String expression) { }
    /** 原生Excel图表，类别列和数值列从0开始，图表置于数据右侧。 */
    public record Chart(String type, String title, Integer categoryColumn, List<Integer> valueColumns) { }
}
