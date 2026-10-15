package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultDocumentRequest;
import com.exceptioncoder.toolbox.foreconsult.service.documents.ConsultSlideDesigner;
import com.exceptioncoder.toolbox.foreconsult.service.documents.ConsultWorkbookDesigner;
import org.apache.poi.sl.usermodel.TextParagraph.TextAlign;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.springframework.stereotype.Component;

import java.awt.Color;
import java.awt.Dimension;
import java.awt.geom.Rectangle2D;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

/** 生成可编辑Office文件；模型版式经过后端校验，不执行代码或读取外部资源。 */
@Component
public class ConsultDocumentRenderer {
    private static final String FONT = "Microsoft YaHei";

    public byte[] render(ConsultDocumentRequest request) throws IOException {
        try (var output = new ByteArrayOutputStream()) {
            switch (request.format()) {
                case "docx" -> word(request, output);
                case "xlsx" -> excel(request, output);
                case "pptx" -> slides(request, output);
                default -> throw new IllegalArgumentException("仅支持 docx、xlsx、pptx");
            }
            return output.toByteArray();
        }
    }

    private void word(ConsultDocumentRequest request, ByteArrayOutputStream output) throws IOException {
        try (var document = new XWPFDocument()) {
            var design = request.layout() == null ? null : request.layout().word();
            var theme = request.layout() == null ? null : request.layout().theme();
            String accent = theme == null || theme.accent() == null ? "1C2737" : theme.accent();
            String bodyColor = theme == null || theme.foreground() == null ? "1C2737" : theme.foreground();
            if (design != null && Boolean.TRUE.equals(design.landscape())) {
                var size = document.getDocument().getBody().addNewSectPr().addNewPgSz();
                size.setW(java.math.BigInteger.valueOf(16838)); size.setH(java.math.BigInteger.valueOf(11906));
                size.setOrient(org.openxmlformats.schemas.wordprocessingml.x2006.main.STPageOrientation.LANDSCAPE);
            }
            paragraph(document, request.title(), design == null || design.titleSize() == null ? 22 : design.titleSize().intValue(), true, accent);
            for (var section : request.sections()) {
                if (section.heading() != null && !section.heading().isBlank()) {
                    paragraph(document, section.heading(), design == null || design.headingSize() == null ? 15 : design.headingSize().intValue(), true, accent);
                }
                for (String text : section.paragraphs() == null ? List.<String>of() : section.paragraphs()) {
                    paragraph(document, text, design == null || design.bodySize() == null ? 11 : design.bodySize().intValue(), false, bodyColor);
                }
                if (section.table() != null && !section.table().isEmpty()) {
                    var table = document.createTable(section.table().size(), section.table().getFirst().size());
                    table.setWidth("100%");
                    for (int row = 0; row < section.table().size(); row++) {
                        if (row == 0) {
                            table.getRow(row).setRepeatHeader(true);
                        }
                        for (int column = 0; column < section.table().get(row).size(); column++) {
                            var cell = table.getRow(row).getCell(column);
                            var run = cell.getParagraphs().getFirst().createRun();
                            run.setFontFamily(FONT);
                            run.setFontSize(10);
                            run.setBold(row == 0);
                            run.setText(section.table().get(row).get(column));
                            if (row == 0) {
                                cell.setColor(theme == null || theme.accent() == null ? "EEF2F6" : theme.accent());
                                if (theme != null && theme.accent() != null) { run.setColor("FFFFFF"); }
                            }
                        }
                    }
                }
            }
            if (theme != null && theme.font() != null) {
                document.getParagraphs().forEach(paragraph -> paragraph.getRuns().forEach(run -> run.setFontFamily(theme.font())));
                document.getTables().forEach(table -> table.getRows().forEach(row -> row.getTableCells()
                        .forEach(cell -> cell.getParagraphs().forEach(paragraph -> paragraph.getRuns()
                                .forEach(run -> run.setFontFamily(theme.font()))))));
            }
            document.write(output);
        }
    }

    private void paragraph(XWPFDocument document, String text, int size, boolean bold, String color) {
        var paragraph = document.createParagraph();
        paragraph.setSpacingAfter(140);
        var run = paragraph.createRun();
        run.setFontFamily(FONT);
        run.setFontSize(size);
        run.setBold(bold);
        run.setColor(color);
        String[] lines = text.split("\\R", -1);
        for (int index = 0; index < lines.length; index++) {
            if (index > 0) {
                run.addBreak();
            }
            run.setText(lines[index]);
        }
    }

    private void excel(ConsultDocumentRequest request, ByteArrayOutputStream output) throws IOException {
        try (var workbook = new XSSFWorkbook()) {
            var font = workbook.createFont();
            font.setFontName(FONT);
            font.setFontHeightInPoints((short) 11);
            var body = workbook.createCellStyle();
            body.setFont(font);
            body.setWrapText(true);
            var header = workbook.createCellStyle();
            header.cloneStyleFrom(body);
            header.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
            header.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            for (var input : request.sheets()) {
                var sheet = workbook.createSheet(input.name());
                sheet.createFreezePane(0, 1);
                var heading = sheet.createRow(0);
                for (int column = 0; column < input.columns().size(); column++) {
                    var cell = heading.createCell(column);
                    cell.setCellValue(input.columns().get(column));
                    cell.setCellStyle(header);
                    sheet.setColumnWidth(column, 28 * 256);
                }
                for (int index = 0; index < input.rows().size(); index++) {
                    var row = sheet.createRow(index + 1);
                    int visibleLines = 1;
                    for (int column = 0; column < input.rows().get(index).size(); column++) {
                        var cell = row.createCell(column);
                        cell.setCellStyle(body);
                        Object value = input.rows().get(index).get(column);
                        if (value instanceof Number number) {
                            cell.setCellValue(number.doubleValue());
                        } else if (value instanceof Boolean bool) {
                            cell.setCellValue(bool);
                        } else if (value != null) {
                            cell.setCellValue(value.toString());
                            visibleLines = Math.max(visibleLines, (value.toString().length() + 13) / 14);
                        }
                    }
                    row.setHeightInPoints(Math.min(180, 18 * visibleLines));
                }
                sheet.setAutoFilter(new org.apache.poi.ss.util.CellRangeAddress(
                        0, input.rows().size(), 0, input.columns().size() - 1));
            }
            ConsultWorkbookDesigner.apply(workbook, request);
            workbook.write(output);
        }
    }

    private void slides(ConsultDocumentRequest request, ByteArrayOutputStream output) throws IOException {
        try (var presentation = new XMLSlideShow()) {
            presentation.setPageSize(new Dimension(960, 540));
            if (request.layout() != null && request.layout().pages() != null) {
                ConsultSlideDesigner.render(presentation, request);
                presentation.write(output);
                return;
            }
            for (int index = 0; index < request.slides().size(); index++) {
                var input = request.slides().get(index);
                var slide = presentation.createSlide();
                var title = slide.createTextBox();
                title.clearText();
                title.setAnchor(new Rectangle2D.Double(52, 35, 856, 72));
                var heading = title.addNewTextParagraph().addNewTextRun();
                heading.setText(input.title());
                heading.setFontFamily(FONT);
                heading.setFontSize(28.0);
                heading.setBold(true);
                heading.setFontColor(new Color(28, 39, 55));
                var body = slide.createTextBox();
                body.clearText();
                body.setAnchor(new Rectangle2D.Double(60, 124, 840, 350));
                for (String bullet : input.bullets()) {
                    var paragraph = body.addNewTextParagraph();
                    paragraph.setSpaceAfter(8.0);
                    var run = paragraph.addNewTextRun();
                    run.setText("• " + bullet);
                    run.setFontFamily(FONT);
                    run.setFontSize(18.0);
                    run.setFontColor(new Color(60, 70, 82));
                }
                var footer = slide.createTextBox();
                footer.clearText();
                footer.setAnchor(new Rectangle2D.Double(52, 494, 856, 28));
                var paragraph = footer.addNewTextParagraph();
                paragraph.setTextAlign(TextAlign.RIGHT);
                var run = paragraph.addNewTextRun();
                run.setText((index + 1) + " / " + request.slides().size());
                run.setFontSize(10.0);
                run.setFontColor(Color.GRAY);
            }
            presentation.write(output);
        }
    }
}
