package com.exceptioncoder.toolbox.procurement.api;

import com.exceptioncoder.toolbox.procurement.service.ProcurementExcelService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import java.io.IOException;

/** 当前筛选下的业务结果下载入口。 */
@RestController
public class ProcurementExportController {
    private final ProcurementExcelService excel;
    public ProcurementExportController(ProcurementExcelService excel) { this.excel = excel; }

    @GetMapping("/api/procurement/business-notices/export")
    public ResponseEntity<byte[]> export(@RequestParam(defaultValue = "") String search,
                                         @RequestParam(defaultValue = "") String siteId,
                                         @RequestParam(defaultValue = "") String status) throws IOException {
        if (search.length() > 300 || siteId.length() > 200 || !java.util.Set.of("", "PENDING", "SUCCESS", "FAILED").contains(status)) {
            throw new IllegalArgumentException("导出筛选条件不合法");
        }
        return ResponseEntity.ok().header("Content-Disposition", "attachment; filename=procurement-results.xlsx")
                .header("Cache-Control", "no-store")
                .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                .body(excel.export(search, siteId, status));
    }
}
