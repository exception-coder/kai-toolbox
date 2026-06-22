package com.exceptioncoder.toolbox.visitoranalysis.service;

import com.exceptioncoder.toolbox.visitoranalysis.api.dto.CustomerRefView;
import com.exceptioncoder.toolbox.visitoranalysis.repository.CustomerRefRepository;
import com.fasterxml.jackson.databind.MappingIterator;
import com.fasterxml.jackson.dataformat.csv.CsvMapper;
import com.fasterxml.jackson.dataformat.csv.CsvSchema;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 客户资料 CSV 导入去重参照库 va_customer_ref。CSV 仅做解析，归一化键统一由 Java {@link Normalizer}
 * 算（单一来源，杜绝多端实现漂移）。按 cust_id 幂等 upsert：重跑会用最新归一化结果覆盖。
 */
@Service
public class CustomerRefImportService {

    private static final Logger log = LoggerFactory.getLogger(CustomerRefImportService.class);

    private final CustomerRefRepository repo;
    private final Normalizer normalizer;
    private final CsvMapper csvMapper = new CsvMapper();

    public CustomerRefImportService(CustomerRefRepository repo, Normalizer normalizer) {
        this.repo = repo;
        this.normalizer = normalizer;
    }

    public Map<String, Object> importFromCsv(String path) throws IOException {
        Path p = Path.of(path);
        if (!Files.exists(p)) {
            throw new IllegalArgumentException("CSV 不存在: " + path);
        }
        String content = Files.readString(p, StandardCharsets.UTF_8);
        if (!content.isEmpty() && content.charAt(0) == '﻿') {
            content = content.substring(1);   // 去 UTF-8 BOM，避免首列名变成 ﻿ID
        }

        CsvSchema schema = CsvSchema.emptySchema().withHeader();
        long now = System.currentTimeMillis();
        int imported = 0;
        try (MappingIterator<Map<String, String>> it =
                     csvMapper.readerForMapOf(String.class).with(schema).readValues(content)) {
            while (it.hasNext()) {
                Map<String, String> r = it.next();
                String custName = trim(r.get("NAME"));
                String keyword = trim(r.get("BRIEFNAME"));
                String custAddr = trim(r.get("ADDRESS"));

                CustomerRefView c = new CustomerRefView(
                        0L,
                        parseLong(r.get("ID")),
                        custName,
                        keyword,
                        trim(r.get("BRANDNAME")),
                        trim(r.get("RUNTYPE_NAME")),
                        trim(r.get("MARKET_NAME")),
                        trim(r.get("AREA_NAME")),
                        trim(r.get("PROVINCESTR")),
                        trim(r.get("CITYSTR")),
                        trim(r.get("AREASTR")),
                        custAddr,
                        trim(r.get("DOORCODE")),
                        parseDouble(r.get("LONGITUDE")),
                        parseDouble(r.get("LATITUDE")),
                        trim(r.get("LEVELS")),
                        trim(r.get("PRIVATETYPE")),
                        trim(r.get("MAKER")),
                        trim(r.get("NOTES")),
                        now,
                        null);   // synced_at：导入即未同步，待「一键同步」后置位
                // 归一化键：统一走 Java Normalizer（单一来源）。
                repo.upsert(c,
                        normalizer.company(custName),
                        normalizer.company(keyword),
                        normalizer.addr(custAddr),
                        now);
                imported++;
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("imported", imported);
        result.put("total", repo.count());
        log.info("[visitor-analysis] CSV 导入客户参照库: imported={} total={} <- {}",
                imported, result.get("total"), path);
        return result;
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }

    private static Long parseLong(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return (long) Double.parseDouble(s.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Double parseDouble(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return Double.parseDouble(s.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
