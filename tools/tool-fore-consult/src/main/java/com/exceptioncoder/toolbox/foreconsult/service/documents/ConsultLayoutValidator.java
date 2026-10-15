package com.exceptioncoder.toolbox.foreconsult.service.documents;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultDocumentLayout;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultDocumentRequest;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** 在后端重新验证全部设计指令，不能信任模型或Sidecar输出。 */
public final class ConsultLayoutValidator {
    private ConsultLayoutValidator() { }

    public static void validate(ConsultDocumentRequest request) {
        var layout = request.layout();
        if (layout == null) { return; }
        var theme = layout.theme();
        if (theme != null) {
            color(theme.accent()); color(theme.background()); color(theme.foreground());
            if (theme.font() != null && !Set.of("Microsoft YaHei", "Arial", "Calibri").contains(theme.font())) {
                fail("字体仅支持 Microsoft YaHei、Arial、Calibri");
            }
        }
        if (layout.word() != null) {
            if (!"docx".equals(request.format())) { fail("word版式仅用于docx"); }
            range(layout.word().titleSize(), 16, 40); range(layout.word().headingSize(), 12, 28);
            range(layout.word().bodySize(), 9, 18);
        }
        if (layout.pages() != null) {
            if (!"pptx".equals(request.format())) { fail("pages版式仅用于pptx"); }
            count(layout.pages(), 1, 30);
            for (var page : layout.pages()) { page(page); }
        }
        if (layout.sheets() != null) {
            if (!"xlsx".equals(request.format())) { fail("sheets版式仅用于xlsx"); }
            count(layout.sheets(), 1, 10);
            var seen = new HashSet<Integer>();
            for (var style : layout.sheets()) { sheet(style, request, seen); }
        }
    }

    private static void page(ConsultDocumentLayout.Page page) {
        color(page.background()); count(page.elements(), 1, 60);
        for (var element : page.elements()) {
            if (element.kind() == null || !Set.of("text", "rect", "ellipse", "line").contains(element.kind())) { fail("元素类型无效"); }
            requiredRange(element.x(), 0, 959); requiredRange(element.y(), 0, 539);
            requiredRange(element.w(), 1, 960); requiredRange(element.h(), 1, 540);
            if (element.x() + element.w() > 960 || element.y() + element.h() > 540) { fail("PPT元素超出960×540画布"); }
            color(element.color()); color(element.fill()); range(element.fontSize(), 9, 64);
            if (element.text() != null && (element.text().length() > 3000 || element.text().contains("\u0000"))) {
                fail("单个元素文字超过3000字符或含非法字符");
            }
            if ("text".equals(element.kind()) && (element.text() == null || element.text().isBlank())) { fail("文字元素内容为空"); }
            if (element.align() != null && !Set.of("left", "center", "right").contains(element.align())) { fail("对齐方式无效"); }
        }
    }

    private static void sheet(ConsultDocumentLayout.SheetStyle style, ConsultDocumentRequest request, Set<Integer> seen) {
        int index = style.sheet() == null ? -1 : style.sheet();
        if (index < 0 || index >= request.sheets().size() || !seen.add(index)) { fail("工作表样式索引无效或重复"); }
        var sheet = request.sheets().get(index);
        var formulaCells = new HashSet<String>();
        int columns = sheet.columns().size();
        if (style.widths() != null) {
            count(style.widths(), columns, columns);
            style.widths().forEach(value -> requiredRange(value, 6, 80));
        }
        if (style.formats() != null) {
            count(style.formats(), columns, columns);
            style.formats().forEach(value -> {
                if (!Set.of("text", "number", "money", "percent").contains(value)) { fail("列格式无效"); }
            });
        }
        if (style.formulas() != null) {
            count(style.formulas(), 0, 200);
            for (var formula : style.formulas()) {
                if (formula.row() == null || formula.row() < 1 || formula.row() > sheet.rows().size()
                        || formula.column() == null || formula.column() < 0 || formula.column() >= columns
                        || !formulaCells.add(formula.row() + ":" + formula.column())) { fail("公式位置无效或重复"); }
                validateFormula(formula.expression());
            }
        }
        var chart = style.chart();
        if (chart != null) {
            if (chart.type() == null || !Set.of("bar", "line", "pie").contains(chart.type()) || chart.title() == null
                    || chart.title().length() > 100 || sheet.rows().isEmpty() || sheet.rows().size() > 200) { fail("图表类型、标题或数据行数无效（最多200行）"); }
            count(chart.valueColumns(), 1, 4);
            if (chart.categoryColumn() == null || chart.categoryColumn() < 0 || chart.categoryColumn() >= columns
                    || chart.valueColumns().stream().anyMatch(value -> value < 0 || value >= columns)) { fail("图表列索引无效"); }
            if ("pie".equals(chart.type()) && chart.valueColumns().size() != 1) { fail("饼图仅支持一个数值列"); }
            for (int rowIndex = 0; rowIndex < sheet.rows().size(); rowIndex++) {
                var row = sheet.rows().get(rowIndex);
                for (Integer column : chart.valueColumns()) {
                    if (!(row.get(column) instanceof Number) && !formulaCells.contains((rowIndex + 1) + ":" + column)) {
                        fail("图表数值列必须为数字或本次指定的计算公式");
                    }
                }
            }
        }
    }

    /** 不允许外部引用、跨表、动态取数或链接函数；允许纯算术及当前表的有界引用。 */
    public static void validateFormula(String expression) {
        if (expression == null || expression.isBlank() || expression.length() > 300
                || !expression.matches("[A-Za-z0-9_$:.,+*/()<>=% -]+")) { fail("公式仅支持当前表引用与基本运算"); }
        var functions = java.util.regex.Pattern.compile("([A-Za-z_]+)\\s*\\(").matcher(expression);
        while (functions.find()) {
            if (!Set.of("SUM", "AVERAGE", "COUNT", "MIN", "MAX", "ROUND", "IF", "ABS")
                    .contains(functions.group(1).toUpperCase(java.util.Locale.ROOT))) { fail("公式函数不在允许清单内"); }
        }
        var refs = java.util.regex.Pattern.compile("\\$?([A-Za-z]+)\\$?([0-9]+)").matcher(expression);
        while (refs.find()) {
            int column = org.apache.poi.ss.util.CellReference.convertColStringToIndex(refs.group(1));
            long row = Long.parseLong(refs.group(2));
            if (column > 39 || row < 1 || row > 2001) { fail("公式引用超出40列、2001行范围"); }
        }
    }

    private static void color(String value) {
        if (value != null && !value.matches("[A-Fa-f0-9]{6}")) { fail("颜色须为六位RGB，如1C2737"); }
    }
    private static void range(Double value, double min, double max) {
        if (value != null) { requiredRange(value, min, max); }
    }
    private static void requiredRange(Double value, double min, double max) {
        if (value == null || !Double.isFinite(value) || value < min || value > max) { fail("版式数值超出范围 " + min + "–" + max); }
    }
    private static void count(List<?> values, int min, int max) {
        if (values == null || values.size() < min || values.size() > max || values.stream().anyMatch(v -> v == null)) { fail("版式列表数量无效"); }
    }
    private static void fail(String message) { throw new IllegalArgumentException(message); }
}
