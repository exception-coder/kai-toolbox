package com.exceptioncoder.toolbox.foreconsult.service.documents;

import org.apache.poi.xslf.usermodel.*;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.ss.usermodel.DataFormatter;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.util.ArrayList;
import java.util.List;
import javax.imageio.ImageIO;

/** 从已生成的文件制作有界预览；PPT真实绘制，Word/Excel明确标为结构预览。 */
public final class ConsultDocumentPreview {
    private static final int WIDTH = 960;
    private static final int PAGE_HEIGHT = 540;
    private ConsultDocumentPreview() { }

    public record Result(byte[] png, String kind, List<String> notes, int totalPages) { }

    public static Result render(String format, byte[] office, int startPage) throws IOException {
        if (startPage < 1 || startPage > 30) { throw new IllegalArgumentException("预览起始页须为1–30"); }
        return switch (format) {
            case "pptx" -> slides(office, startPage);
            case "docx" -> word(office);
            case "xlsx" -> excel(office);
            default -> throw new IllegalArgumentException("预览格式无效");
        };
    }

    private static Result slides(byte[] office, int startPage) throws IOException {
        try (var deck = new XMLSlideShow(new ByteArrayInputStream(office))) {
            if (startPage > deck.getSlides().size()) { throw new IllegalArgumentException("预览页超过文件页数"); }
            int count = Math.min(4, deck.getSlides().size() - startPage + 1);
            var image = canvas(PAGE_HEIGHT * count);
            var graphics = graphics(image);
            var notes = new ArrayList<String>();
            notes.add("PPT文件实际渲染，显示第" + startPage + "–" + (startPage + count - 1)
                    + "页，共" + deck.getSlides().size() + "页；其余页面可指定page继续检查。");
            try {
                for (int index = 0; index < count; index++) {
                    var slide = deck.getSlides().get(startPage - 1 + index);
                    var page = (Graphics2D) graphics.create(0, index * PAGE_HEIGHT, WIDTH, PAGE_HEIGHT);
                    try { slide.draw(page); } finally { page.dispose(); }
                    for (var shape : slide.getShapes()) {
                        if (shape instanceof XSLFTextShape text && text.getTextHeight() > text.getAnchor().getHeight()) {
                            String excerpt = text.getText().substring(0, Math.min(25, text.getText().length()));
                            notes.add("第" + (startPage + index) + "页文字“" + excerpt + "”可能超出文本框，文字高度约"
                                    + Math.ceil(text.getTextHeight()) + "pt，框高" + text.getAnchor().getHeight() + "pt，请调整字号或框高。");
                            break;
                        }
                    }
                }
            } finally { graphics.dispose(); }
            return result(image, "slides", notes, deck.getSlides().size());
        }
    }

    private static Result word(byte[] office) throws IOException {
        try (var document = new XWPFDocument(new ByteArrayInputStream(office))) {
            var image = canvas(1200);
            var graphics = graphics(image);
            int y = 48;
            try {
                for (var element : document.getBodyElements()) {
                    if (y > 1100) { break; }
                    if (element instanceof org.apache.poi.xwpf.usermodel.XWPFParagraph paragraph) {
                        var run = paragraph.getRuns().isEmpty() ? null : paragraph.getRuns().getFirst();
                        int size = run == null || run.getFontSizeAsDouble() == null ? 16 : (int) Math.round(run.getFontSizeAsDouble() * 1.4);
                        graphics.setFont(new Font("Microsoft YaHei", run != null && run.isBold() ? Font.BOLD : Font.PLAIN, size));
                        graphics.setColor(run == null || run.getColor() == null ? new Color(28, 39, 55) : Color.decode("#" + run.getColor()));
                        y = text(graphics, paragraph.getText(), 48, y, WIDTH - 96, size + 10) + 12;
                    } else if (element instanceof org.apache.poi.xwpf.usermodel.XWPFTable table) {
                        for (var row : table.getRows()) {
                            if (y > 1100) { break; }
                            int columns = row.getTableCells().size();
                            int width = (WIDTH - 96) / columns;
                            graphics.setFont(new Font("Microsoft YaHei", Font.PLAIN, 14));
                            for (int column = 0; column < columns; column++) {
                                graphics.setColor(new Color(235, 239, 243)); graphics.fillRect(48 + column * width, y, width, 44);
                                graphics.setColor(new Color(40, 50, 65));
                                text(graphics, row.getCell(column).getText(), 54 + column * width, y + 20, width - 12, 18);
                            }
                            y += 46;
                        }
                    }
                }
            } finally { graphics.dispose(); }
            return result(image, "structure", List.of("Word内容、层级和颜色的结构预览，最多显示首屏；不代表Word最终分页，请打开下载文件复核。"), 1);
        }
    }

    private static Result excel(byte[] office) throws IOException {
        try (var workbook = new XSSFWorkbook(new ByteArrayInputStream(office))) {
            var image = canvas(900);
            var graphics = graphics(image);
            var formatter = new DataFormatter(java.util.Locale.CHINA);
            var evaluator = workbook.getCreationHelper().createFormulaEvaluator();
            try {
                var sheet = workbook.getSheetAt(0);
                graphics.setColor(new Color(28, 39, 55)); graphics.setFont(new Font("Microsoft YaHei", Font.BOLD, 22));
                graphics.drawString(sheet.getSheetName(), 24, 36);
                int columns = Math.min(8, sheet.getRow(0).getLastCellNum());
                int width = (WIDTH - 48) / columns;
                graphics.setFont(new Font("Microsoft YaHei", Font.PLAIN, 14));
                for (int row = 0; row <= Math.min(18, sheet.getLastRowNum()); row++) {
                    for (int column = 0; column < columns; column++) {
                        int x = 24 + column * width; int y = 56 + row * 42;
                        graphics.setColor(row == 0 ? new Color(225, 234, 244) : row % 2 == 0 ? new Color(246, 248, 250) : Color.WHITE);
                        graphics.fillRect(x, y, width - 1, 40); graphics.setColor(new Color(28, 39, 55));
                        String value = formatter.formatCellValue(sheet.getRow(row).getCell(column), evaluator);
                        text(graphics, value, x + 6, y + 19, width - 12, 18);
                    }
                }
            } finally { graphics.dispose(); }
            return result(image, "structure", List.of("Excel首个工作表结构预览，最多8列、18条数据；公式已计算，其他工作表、图表与完整样式请打开文件检查。"), 1);
        }
    }

    private static BufferedImage canvas(int height) {
        var image = new BufferedImage(WIDTH, height, BufferedImage.TYPE_INT_RGB);
        var graphics = image.createGraphics();
        try { graphics.setColor(Color.WHITE); graphics.fillRect(0, 0, WIDTH, height); }
        finally { graphics.dispose(); }
        return image;
    }

    private static Graphics2D graphics(BufferedImage image) {
        var graphics = image.createGraphics();
        graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        graphics.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        graphics.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_ON);
        return graphics;
    }

    private static int text(Graphics2D graphics, String value, int x, int y, int width, int lineHeight) {
        StringBuilder line = new StringBuilder(); int lines = 0;
        for (int offset = 0; offset < value.length();) {
            int code = value.codePointAt(offset); offset += Character.charCount(code);
            String next = new String(Character.toChars(code));
            if (code == '\n' || graphics.getFontMetrics().stringWidth(line + next) > width) {
                graphics.drawString(line.toString(), x, y); y += lineHeight; line.setLength(0);
                if (++lines >= 30) { return y; }
            }
            if (code != '\n') { line.append(next); }
        }
        graphics.drawString(line.toString(), x, y);
        return y + lineHeight;
    }

    private static Result result(BufferedImage image, String kind, List<String> notes, int pages) throws IOException {
        try (var output = new ByteArrayOutputStream()) {
            ImageIO.write(image, "png", output);
            if (output.size() > 2 * 1024 * 1024) { throw new IOException("预览超过2MB，请简化设计"); }
            return new Result(output.toByteArray(), kind, notes, pages);
        } finally { image.flush(); }
    }
}
