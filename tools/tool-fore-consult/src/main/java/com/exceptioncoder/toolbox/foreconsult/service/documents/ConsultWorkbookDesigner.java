package com.exceptioncoder.toolbox.foreconsult.service.documents;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultDocumentRequest;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xddf.usermodel.chart.*;
import org.apache.poi.xssf.usermodel.*;

/** 有界列宽、格式、纯计算公式和原生图表，字符串仍然不解释为公式。 */
public final class ConsultWorkbookDesigner {
    private ConsultWorkbookDesigner() { }

    public static void apply(XSSFWorkbook workbook, ConsultDocumentRequest request) {
        if (request.layout() == null) { return; }
        applyTheme(workbook, request);
        for (var style : request.layout().sheets() == null
                ? java.util.List.<com.exceptioncoder.toolbox.foreconsult.domain.ConsultDocumentLayout.SheetStyle>of()
                : request.layout().sheets()) {
            var sheet = workbook.getSheetAt(style.sheet());
            if (style.widths() != null) {
                for (int i = 0; i < style.widths().size(); i++) { sheet.setColumnWidth(i, (int) (style.widths().get(i) * 256)); }
            }
            if (style.formats() != null) {
                for (int column = 0; column < style.formats().size(); column++) {
                    var cellStyle = workbook.createCellStyle();
                    cellStyle.cloneStyleFrom(sheet.getRow(sheet.getLastRowNum() > 0 ? 1 : 0).getCell(column).getCellStyle());
                    cellStyle.setFillPattern(org.apache.poi.ss.usermodel.FillPatternType.NO_FILL);
                    cellStyle.setDataFormat(workbook.createDataFormat().getFormat(switch (style.formats().get(column)) {
                        case "money" -> "#,##0.00";
                        case "percent" -> "0.0%";
                        case "number" -> "#,##0.##";
                        default -> "@";
                    }));
                    for (int row = 1; row <= sheet.getLastRowNum(); row++) { sheet.getRow(row).getCell(column).setCellStyle(cellStyle); }
                }
            }
            if (style.formulas() != null) {
                for (var formula : style.formulas()) {
                    sheet.getRow(formula.row()).getCell(formula.column()).setCellFormula(formula.expression());
                }
            }
        }
        evaluateFormulas(workbook);
        // 先完成所有公式计算，再创建图表缓存，避免业务用户打开时看到旧值或零值。
        for (var style : request.layout().sheets() == null
                ? java.util.List.<com.exceptioncoder.toolbox.foreconsult.domain.ConsultDocumentLayout.SheetStyle>of()
                : request.layout().sheets()) {
            var sheet = workbook.getSheetAt(style.sheet());
            if (style.chart() != null) {
                var definition = style.chart();
                var anchor = new XSSFClientAnchor(0, 0, 0, 0,
                        sheet.getRow(0).getLastCellNum() + 1, 1, sheet.getRow(0).getLastCellNum() + 10, 20);
                var chart = sheet.createDrawingPatriarch().createChart(anchor);
                chart.setTitleText(definition.title()); chart.setTitleOverlay(false);
                var category = XDDFDataSourcesFactory.fromStringCellRange(sheet,
                        new CellRangeAddress(1, sheet.getLastRowNum(), definition.categoryColumn(), definition.categoryColumn()));
                ChartTypes type = switch (definition.type()) {
                    case "pie" -> ChartTypes.PIE;
                    case "line" -> ChartTypes.LINE;
                    default -> ChartTypes.BAR;
                };
                var categories = type == ChartTypes.PIE ? null : chart.createCategoryAxis(AxisPosition.BOTTOM);
                var values = type == ChartTypes.PIE ? null : chart.createValueAxis(AxisPosition.LEFT);
                var data = chart.createData(type, categories, values);
                if (data instanceof XDDFBarChartData bars) { bars.setBarDirection(BarDirection.COL); }
                for (Integer column : definition.valueColumns()) {
                    for (int row = 1; row <= sheet.getLastRowNum(); row++) {
                        var cell = sheet.getRow(row).getCell(column);
                        var typeOfValue = cell.getCellType() == CellType.FORMULA
                                ? cell.getCachedFormulaResultType() : cell.getCellType();
                        if (typeOfValue != CellType.NUMERIC) { throw new IllegalArgumentException("图表公式必须计算为数字：" + cell.getAddress()); }
                    }
                    var series = data.addSeries(category, XDDFDataSourcesFactory.fromNumericCellRange(sheet,
                            new CellRangeAddress(1, sheet.getLastRowNum(), column, column)));
                    series.setTitle(sheet.getRow(0).getCell(column).getStringCellValue(), null);
                }
                chart.plot(data);
            }
        }
    }

    /** 提前计算并拒绝坏公式，避免把错误结果交给业务用户。 */
    private static void evaluateFormulas(XSSFWorkbook workbook) {
        var evaluator = workbook.getCreationHelper().createFormulaEvaluator();
        for (var sheet : workbook) {
            for (var row : sheet) {
                for (var cell : row) {
                    if (cell.getCellType() == CellType.FORMULA && evaluator.evaluateFormulaCell(cell) == CellType.ERROR) {
                        throw new IllegalArgumentException("公式计算失败：" + cell.getAddress());
                    }
                }
            }
        }
    }

    private static void applyTheme(XSSFWorkbook workbook, ConsultDocumentRequest request) {
        var theme = request.layout().theme();
        if (theme == null) { return; }
        var font = workbook.createFont();
        font.setFontName(theme.font() == null ? "Microsoft YaHei" : theme.font());
        font.setFontHeightInPoints((short) 11);
        font.setColor(new XSSFColor(ConsultSlideDesigner.color(theme.foreground(), null, "1C2737"), null));
        var headingFont = workbook.createFont(); headingFont.setFontName(font.getFontName());
        headingFont.setBold(true); headingFont.setFontHeightInPoints((short) 11);
        headingFont.setColor(new XSSFColor(java.awt.Color.WHITE, null));
        for (var sheet : workbook) {
            for (var row : sheet) {
                for (var cell : row) {
                    var style = cell.getCellStyle();
                    if (row.getRowNum() == 0) {
                        style.setFillForegroundColor(new XSSFColor(ConsultSlideDesigner.color(theme.accent(), null, "1C2737"), null));
                        style.setFont(headingFont);
                    } else { style.setFont(font); }
                }
            }
        }
    }
}
