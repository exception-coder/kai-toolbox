package com.exceptioncoder.toolbox.procurement.service;

import com.exceptioncoder.toolbox.procurement.domain.ProcurementStructure.Field;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.ss.util.CellRangeAddress;
import org.springframework.stereotype.Service;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

/** 将与页面一致的业务投影输出为 Excel，文本始终写入字符串单元格。 */
@Service
public class ProcurementExcelService {
    private final ProcurementStructureService structure;

    public ProcurementExcelService(ProcurementStructureService structure) { this.structure = structure; }

    public byte[] export(String search, String siteId, String status) throws IOException {
        var results = structure.exportResults(search, siteId, status);
        var fields = results.isEmpty() ? structure.schema().fields().stream().filter(Field::enabled).toList()
                : results.getFirst().values().stream().map(value -> value.field()).toList();
        try (var book = new XSSFWorkbook(); var output = new ByteArrayOutputStream()) {
            var sheet = book.createSheet("采集结果");
            var header = sheet.createRow(0);
            var heading = book.createCellStyle();
            var font = book.createFont();
            font.setBold(true);
            heading.setFont(font);
            var number = book.createCellStyle();
            number.setDataFormat(book.createDataFormat().getFormat("0.########"));
            for (int column = 0; column < fields.size(); column++) {
                var cell = header.createCell(column);
                cell.setCellValue(fields.get(column).label());
                cell.setCellStyle(heading);
                sheet.setColumnWidth(column, (fields.get(column).key().equals("title") ? 60 : 26) * 256);
            }
            for (int index = 0; index < results.size(); index++) {
                var row = sheet.createRow(index + 1);
                var values = results.get(index).values();
                for (int column = 0; column < values.size(); column++) {
                    var value = values.get(column);
                    var cell = row.createCell(column);
                    if (value.value() == null || value.value().isEmpty()) { continue; }
                    if (value.value().length() > 32767) {
                        throw new IllegalArgumentException("第 " + (index + 1) + " 条的“" + value.field().label() + "”超出 Excel 单元格长度，请调整后重试");
                    }
                    if ("DECIMAL".equals(value.field().type())) {
                        cell.setCellValue(Double.parseDouble(value.value()));
                        cell.setCellStyle(number);
                    } else { cell.setCellValue(value.value()); }
                }
            }
            sheet.createFreezePane(0, 1);
            if (!fields.isEmpty()) { sheet.setAutoFilter(new CellRangeAddress(0, results.size(), 0, fields.size() - 1)); }
            book.write(output);
            return output.toByteArray();
        }
    }
}
