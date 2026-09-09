package com.exceptioncoder.toolbox.procurement;

import com.exceptioncoder.toolbox.procurement.service.ProcurementExcelService;
import com.exceptioncoder.toolbox.procurement.service.ProcurementStructureService;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.ss.usermodel.CellType;
import org.junit.jupiter.api.Test;
import java.io.ByteArrayInputStream;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;
import static com.exceptioncoder.toolbox.procurement.domain.ProcurementStructure.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class ProcurementExcelTest {
    @Test
    void workbookPreservesBusinessTypesAndAllProjectedRows() throws Exception {
        var structure = mock(ProcurementStructureService.class);
        var text = new Field("title", "公告标题", "业务", "TEXT", "SYSTEM", "", true, 0);
        var amount = new Field("procurement_amount", "金额（万元）", "业务", "DECIMAL", "LLM", "", true, 1);
        var phone = new Field("owner_phone", "电话", "业务", "TEXT", "LLM", "", true, 2);
        var result = new Result(5, 5, 0, List.of(
                new Value(text, "=1+1", "MANUAL", List.of(), List.of(), true),
                new Value(amount, "9977.5461", "LLM", List.of(), List.of(), false),
                new Value(phone, "01000123", "LLM", List.of(), List.of(), false)), Map.of());
        when(structure.exportResults("标题", "national", "SUCCESS"))
                .thenReturn(IntStream.range(0, 41).mapToObj(i -> result).toList());
        var bytes = new ProcurementExcelService(structure).export("标题", "national", "SUCCESS");
        try (var book = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            var sheet = book.getSheetAt(0);
            assertThat(sheet.getLastRowNum()).isEqualTo(41);
            assertThat(sheet.getRow(0).getCell(0).getStringCellValue()).isEqualTo("公告标题");
            assertThat(sheet.getRow(1).getCell(0).getCellType()).isEqualTo(CellType.STRING);
            assertThat(sheet.getRow(1).getCell(0).getStringCellValue()).isEqualTo("=1+1");
            assertThat(sheet.getRow(1).getCell(1).getNumericCellValue()).isEqualTo(9977.5461);
            assertThat(sheet.getRow(1).getCell(2).getStringCellValue()).isEqualTo("01000123");
            assertThat(sheet.getPaneInformation().isFreezePane()).isTrue();
        }
    }
}
