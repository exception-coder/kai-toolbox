package com.exceptioncoder.toolbox.prdclarify.service;

import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link AttachmentParseService} 的 Excel 附件解析测试。
 */
class AttachmentParseServiceTest {

    private final AttachmentParseService service = new AttachmentParseService();

    /** 验证 OOXML 工作簿保留工作表、行列和值。 */
    @Test
    void shouldParseXlsxSheetsAndFormulaValues() throws IOException {
        MockMultipartFile file = createWorkbookFile("需求.xlsx", new XSSFWorkbook());

        AttachmentParseService.ParseResult result = service.parse(file);

        assertThat(result.contentType())
                .isEqualTo("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        assertThat(result.text())
                .contains("## 工作表：需求清单")
                .contains("需求名称\t优先级\t工时")
                .contains("批量下单\t高\t3");
        assertThat(result.truncated()).isFalse();
    }

    /** 验证旧版二进制工作簿沿用同一抽取规则。 */
    @Test
    void shouldParseLegacyXlsWorkbook() throws IOException {
        MockMultipartFile file = createWorkbookFile("需求.xls", new HSSFWorkbook());

        AttachmentParseService.ParseResult result = service.parse(file);

        assertThat(result.contentType()).isEqualTo("application/vnd.ms-excel");
        assertThat(result.text()).contains("批量下单\t高\t3");
    }

    /** 验证 Excel 扩展名进入统一附件白名单。 */
    @Test
    void shouldSupportExcelExtensions() {
        assertThat(service.isSupported(new MockMultipartFile("file", "需求.xlsx", null, new byte[0]))).isTrue();
        assertThat(service.isSupported(new MockMultipartFile("file", "需求.xls", null, new byte[0]))).isTrue();
    }

    /** 创建包含标题、数据和公式的测试工作簿。 */
    private MockMultipartFile createWorkbookFile(String fileName, Workbook workbook) throws IOException {
        try (workbook; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("需求清单");
            Row header = sheet.createRow(0);
            header.createCell(0).setCellValue("需求名称");
            header.createCell(1).setCellValue("优先级");
            header.createCell(2).setCellValue("工时");
            Row data = sheet.createRow(1);
            data.createCell(0).setCellValue("批量下单");
            data.createCell(1).setCellValue("高");
            data.createCell(2).setCellFormula("1+2");
            workbook.getCreationHelper().createFormulaEvaluator().evaluateAll();
            workbook.write(output);
            return new MockMultipartFile("file", fileName, null, output.toByteArray());
        }
    }
}
