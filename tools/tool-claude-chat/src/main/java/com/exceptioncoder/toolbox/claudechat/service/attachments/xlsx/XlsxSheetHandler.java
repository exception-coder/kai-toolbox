package com.exceptioncoder.toolbox.claudechat.service.attachments.xlsx;

import com.exceptioncoder.toolbox.common.attachment.SessionAttachmentReader.SheetCell;
import com.exceptioncoder.toolbox.common.attachment.SessionAttachmentReader.SheetRow;
import org.apache.poi.ss.util.CellReference;
import org.xml.sax.Attributes;
import org.xml.sax.helpers.DefaultHandler;
import java.util.ArrayList;
import java.util.List;

/** 扫描整张表得到真实最大行号，只保留当前页稀疏单元格，不相信dimension声明。 */
final class XlsxSheetHandler extends DefaultHandler {
    private static final int MAX_RETURN_CHARS = 50000;
    private final int startRow;
    private final int endRow;
    private final XlsxCellFormatter formatter;
    private final XlsxArchiveGuard guard;
    private final List<SheetRow> rows = new ArrayList<>();
    private List<SheetCell> cells;
    private String coordinate;
    private String type;
    private String style;
    private String formula;
    private final StringBuilder value = new StringBuilder();
    private final StringBuilder expression = new StringBuilder();
    private boolean inValue;
    private boolean inFormula;
    private int row;
    private int column;
    private int totalRows;
    private int scannedCells;
    private int returnChars;
    private int currentChars;
    private Integer overflowRow;

    XlsxSheetHandler(int startRow, int maxRows, XlsxCellFormatter formatter, XlsxArchiveGuard guard) {
        this.startRow = startRow;
        this.endRow = startRow + maxRows;
        this.formatter = formatter;
        this.guard = guard;
    }

    @Override
    public void startElement(String uri, String local, String qName, Attributes attributes) {
        guard.checkTime();
        switch (local) {
            case "row" -> {
                int next = attributes.getValue("r") == null ? row + 1 : Integer.parseInt(attributes.getValue("r"));
                if (next <= row || next > 50000) {
                    throw new IllegalArgumentException("XLSX行号无效或超过50000，请拆分工作表");
                }
                row = next;
                totalRows = row;
                column = -1;
                cells = new ArrayList<>();
                currentChars = 0;
            }
            case "c" -> beginCell(attributes);
            case "v", "t" -> inValue = coordinate != null;
            case "f" -> {
                inFormula = true;
                formula = "";
            }
            default -> { }
        }
    }

    private void beginCell(Attributes attributes) {
        if (++scannedCells > 200000 || row < 1) {
            throw new IllegalArgumentException("XLSX有效单元格超过200000或缺少行号，请拆分工作表");
        }
        coordinate = attributes.getValue("r");
        if (coordinate == null) {
            coordinate = CellReference.convertNumToColString(column + 1) + row;
        }
        var reference = new CellReference(coordinate);
        int nextColumn = reference.getCol();
        if (reference.getRow() + 1 != row || nextColumn <= column || nextColumn >= 256) {
            throw new IllegalArgumentException("XLSX单元格坐标无效或超过256列，请拆分工作表");
        }
        column = nextColumn;
        type = attributes.getValue("t");
        style = attributes.getValue("s");
        formula = null;
        value.setLength(0);
        expression.setLength(0);
    }

    @Override
    public void characters(char[] chars, int offset, int length) {
        if (inValue) {
            value.append(chars, offset, length);
        }
        if (inFormula) {
            expression.append(chars, offset, length);
        }
        if (value.length() > 32767 || expression.length() > 8192) {
            throw new IllegalArgumentException("XLSX单元格文本或公式过长，请缩短后上传");
        }
    }

    @Override
    public void endElement(String uri, String local, String qName) {
        switch (local) {
            case "v", "t" -> inValue = false;
            case "f" -> {
                inFormula = false;
                formula = expression.toString();
            }
            case "c" -> {
                if (row >= startRow && row < endRow && overflowRow == null) {
                    var cell = formatter.format(new XlsxCellFormatter.CellInput(coordinate, type, style,
                            value.toString(), formula));
                    currentChars += cell.raw().length() + cell.display().length()
                            + (cell.formula() == null ? 0 : cell.formula().length()) + 120;
                    cells.add(cell);
                }
                coordinate = null;
            }
            case "row" -> finishRow();
            default -> { }
        }
    }

    private void finishRow() {
        if (row >= startRow && row < endRow && overflowRow == null) {
            if (returnChars + currentChars > MAX_RETURN_CHARS) {
                if (rows.isEmpty()) {
                    throw new IllegalArgumentException("XLSX单行内容超过50000字符，请拆分列或缩短单元格后重试");
                }
                overflowRow = row;
            } else {
                rows.add(new SheetRow(row, List.copyOf(cells)));
                returnChars += currentChars;
            }
        }
    }

    int totalRows() { return totalRows; }
    List<SheetRow> rows() { return List.copyOf(rows); }
    Integer nextRow() {
        return overflowRow != null ? overflowRow : (totalRows >= endRow ? endRow : null);
    }
}
