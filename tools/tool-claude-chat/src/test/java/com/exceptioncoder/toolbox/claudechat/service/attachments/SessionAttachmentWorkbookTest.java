package com.exceptioncoder.toolbox.claudechat.service.attachments;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatAttachmentRepository;
import com.exceptioncoder.toolbox.common.attachment.SessionAttachmentReader.Request;
import com.exceptioncoder.toolbox.common.attachment.SessionAttachmentReader.WorkbookPage;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class SessionAttachmentWorkbookTest {
    @TempDir Path temp;

    private SessionAttachmentTextReader reader() throws Exception {
        var sessions = mock(ClaudeChatSessionRepository.class);
        var attachments = mock(ClaudeChatAttachmentRepository.class);
        when(sessions.findById("s")).thenReturn(Optional.of(ClaudeChatSession.builder().cwd(temp.toString()).build()));
        when(attachments.findStored("s", "inventory.xlsx")).thenReturn(Optional.of("uploaded"));
        Files.createDirectories(temp.resolve(".kai-chat-attachments/s"));
        return new SessionAttachmentTextReader(sessions, attachments);
    }

    private Path workbook() throws Exception {
        Path file = temp.resolve(".kai-chat-attachments/s/inventory.xlsx");
        try (var book = new XSSFWorkbook()) {
            var sheet = book.createSheet("款号库存");
            book.createSheet("备注");
            book.setSheetHidden(1, true);
            var header = sheet.createRow(0);
            header.createCell(0).setCellValue("款号");
            header.createCell(2).setCellValue("颜色");
            var row = sheet.createRow(1);
            row.createCell(0).setCellValue("00123");
            row.createCell(2).setCellValue("深蓝");
            row.createCell(3).setCellValue("001234567890123456789");
            var date = row.createCell(4);
            date.setCellValue(java.time.LocalDate.of(2026, 10, 15));
            var dateStyle = book.createCellStyle();
            dateStyle.setDataFormat(book.createDataFormat().getFormat("yyyy-mm-dd"));
            date.setCellStyle(dateStyle);
            var numeric = row.createCell(5);
            numeric.setCellValue(123);
            var codeStyle = book.createCellStyle();
            codeStyle.setDataFormat(book.createDataFormat().getFormat("000000"));
            numeric.setCellStyle(codeStyle);
            var formula = row.createCell(6);
            formula.setCellFormula("F2+1");
            formula.getCTCell().setV("124");
            row.createCell(7).setCellFormula("1+2");
            sheet.createRow(3).createCell(4);
            sheet.createRow(2218).createCell(0).setCellValue("最后一行");
            try (var output = Files.newOutputStream(file)) { book.write(output); }
        }
        return file;
    }

    @Test void listsSheetsAndReadsNamedSparseRowsWithIdentifiersDatesAndCachedFormulas() throws Exception {
        var reader = reader();
        Path file = workbook();
        var catalog = (WorkbookPage) reader.readContent("s", 50_000_000, request(null, null, null));
        assertThat(catalog.sheets()).extracting(info -> info.name()).containsExactly("款号库存", "备注");
        assertThat(catalog.sheets().get(1).visibility()).isEqualTo("hidden");
        assertThat(catalog.sheet()).isNull();
        assertThat(catalog.rows()).isEmpty();
        var first = (WorkbookPage) reader.readContent("s", 50_000_000, request("款号库存", 1, 2));
        assertThat(first.totalRows()).isEqualTo(2219);
        assertThat(first.nextRow()).isEqualTo(3);
        assertThat(first.complete()).isFalse();
        var cells = first.rows().get(1).cells();
        assertThat(cells).extracting(c -> c.coordinate()).containsExactly("A2", "C2", "D2", "E2", "F2", "G2", "H2");
        assertThat(cells.get(0).display()).isEqualTo("00123");
        assertThat(cells.get(2).raw()).isEqualTo("001234567890123456789");
        assertThat(cells.get(3).display()).isEqualTo("2026-10-15");
        assertThat(cells.get(4).raw()).isEqualTo("123.0");
        assertThat(cells.get(4).display()).isEqualTo("000123");
        assertThat(cells.get(5).formula()).isEqualTo("F2+1");
        assertThat(cells.get(5).display()).isEqualTo("124");
        assertThat(cells.get(6).cachedType()).isEqualTo("missing");
        var sparse = (WorkbookPage) reader.readContent("s", 50_000_000, request("款号库存", 3, 2));
        assertThat(sparse.rows()).extracting(r -> r.row()).containsExactly(4);
        assertThat(sparse.rows().getFirst().cells().getFirst().coordinate()).isEqualTo("E4");
        var last = (WorkbookPage) reader.readContent("s", 50_000_000, request("款号库存", 2219, 100));
        assertThat(last.rows()).hasSize(1);
        assertThat(last.nextRow()).isNull();
        assertThat(last.complete()).isTrue();
        assertThat(file).exists();
    }

    @Test void preservesCharacterPaginationAndEnforcesAllAttachmentAndCursorBoundaries() throws Exception {
        var reader = reader();
        Path file = workbook();
        assertThatThrownBy(() -> reader.readContent("s", 1, request(null, null, null)))
                .hasMessageContaining("管理员配置");
        var other = new Request(file.getParent().resolve("../other.xlsx").toString(), null, null, null, null, null);
        Files.writeString(file.getParent().resolve("../other.xlsx"), "other");
        assertThatThrownBy(() -> reader.readContent("s", 50_000_000, other)).hasMessageContaining("不属于");
        assertThatThrownBy(() -> reader.readContent("s", 50_000_000, request("missing", 1, 10)))
                .hasMessageContaining("工作表不存在");
        assertThatThrownBy(() -> reader.readContent("s", 50_000_000,
                new Request("inventory.xlsx", 0, null, "款号库存", null, null))).hasMessageContaining("字符offset");
        assertThatThrownBy(() -> reader.readContent("s", 50_000_000, request("款号库存", 0, 10)))
                .hasMessageContaining("startRow");
        assertThatThrownBy(() -> reader.readContent("s", 50_000_000, request("款号库存", 1, 501)))
                .hasMessageContaining("maxRows");
    }

    @Test void rejectsCorruptionAndOversizedInflationWithoutTerminalFallback() throws Exception {
        var reader = reader();
        Path file = temp.resolve(".kai-chat-attachments/s/inventory.xlsx");
        Files.writeString(file, "not a workbook");
        assertThatThrownBy(() -> reader.readContent("s", 50_000_000, request(null, null, null)))
                .hasMessageContaining("损坏、加密").hasMessageContaining("不是写入权限");
        try (var zip = new ZipOutputStream(Files.newOutputStream(file))) {
            zip.putNextEntry(new ZipEntry("xl/styles.xml"));
            zip.write(new byte[1024 * 1024 + 1]);
        }
        assertThatThrownBy(() -> reader.readContent("s", 50_000_000, request(null, null, null)))
                .hasMessageContaining("解压规模超限");
    }

    @Test void boundsResponseByWholeRowsWithoutDroppingTheContinuationRow() throws Exception {
        var reader = reader();
        Path file = temp.resolve(".kai-chat-attachments/s/inventory.xlsx");
        try (var book = new XSSFWorkbook()) {
            var sheet = book.createSheet("库存");
            for (int index = 0; index < 10; index++) {
                sheet.createRow(index).createCell(0).setCellValue("款号".repeat(2000));
            }
            try (var output = Files.newOutputStream(file)) { book.write(output); }
        }
        var first = (WorkbookPage) reader.readContent("s", 50_000_000, request("库存", 1, 100));
        assertThat(first.rows()).hasSize(6);
        assertThat(first.nextRow()).isEqualTo(7);
        var second = (WorkbookPage) reader.readContent("s", 50_000_000, request("库存", first.nextRow(), 100));
        assertThat(second.rows()).extracting(r -> r.row()).containsExactly(7, 8, 9, 10);
        assertThat(second.complete()).isTrue();
    }

    @Test void handles1904DatesInlineStringsAndBooleanWithoutEvaluatingExternalFormula() throws Exception {
        var reader = reader();
        Path file = temp.resolve(".kai-chat-attachments/s/inventory.xlsx");
        try (var book = new XSSFWorkbook()) {
            book.getCTWorkbook().getWorkbookPr().setDate1904(true);
            var row = book.createSheet("库存").createRow(0);
            var cell = row.createCell(0);
            cell.setCellValue(1);
            var style = book.createCellStyle();
            style.setDataFormat(book.createDataFormat().getFormat("yyyy-mm-dd"));
            cell.setCellStyle(style);
            var inline = row.createCell(2).getCTCell();
            inline.setT(org.openxmlformats.schemas.spreadsheetml.x2006.main.STCellType.INLINE_STR);
            inline.addNewIs().setT("000012");
            row.createCell(3).setCellValue(true);
            var formula = row.createCell(4).getCTCell();
            formula.addNewF().setStringValue("'[https://external.invalid/private.xlsx]Sheet1'!A1");
            formula.setV("27");
            try (var output = Files.newOutputStream(file)) { book.write(output); }
        }
        var result = (WorkbookPage) reader.readContent("s", 50_000_000, request("库存", 1, 10));
        var cells = result.rows().getFirst().cells();
        assertThat(cells.get(0).display()).isEqualTo("1904-01-02");
        assertThat(cells.get(1).display()).isEqualTo("000012");
        assertThat(cells.get(2).display()).isEqualTo("TRUE");
        assertThat(cells.get(3).display()).isEqualTo("27");
        assertThat(cells.get(3).formula()).contains("external.invalid");
        assertThat(result.formulaPolicy()).contains("不执行公式");
    }

    @Test void refusesExcessiveRowAndColumnCoordinates() throws Exception {
        var reader = reader();
        Path file = temp.resolve(".kai-chat-attachments/s/inventory.xlsx");
        for (int[] position : new int[][]{{50000, 0}, {0, 256}}) {
            try (var book = new XSSFWorkbook()) {
                book.createSheet("库存").createRow(position[0]).createCell(position[1]).setCellValue("越界");
                try (var output = Files.newOutputStream(file)) { book.write(output); }
            }
            assertThatThrownBy(() -> reader.readContent("s", 50_000_000, request("库存", 1, 10)))
                    .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("拆分工作表");
        }
    }

    private Request request(String sheet, Integer row, Integer count) {
        return new Request("inventory.xlsx", null, null, sheet, row, count);
    }
}
