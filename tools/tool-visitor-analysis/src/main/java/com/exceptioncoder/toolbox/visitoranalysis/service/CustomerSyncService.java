package com.exceptioncoder.toolbox.visitoranalysis.service;

import com.exceptioncoder.toolbox.visitoranalysis.api.dto.CustomerSyncRecord;
import com.exceptioncoder.toolbox.visitoranalysis.client.YoooniCustomerClient;
import com.exceptioncoder.toolbox.visitoranalysis.config.CustomerSyncProperties;
import com.exceptioncoder.toolbox.visitoranalysis.repository.CustomerRefRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * 客户底库同步：从 Yoooni 拉取客户必要判定数据 upsert 进 {@code va_customer_ref}。
 * 全量(首轮/手动/每日)兜底，增量(按 src_lastdate 水位)为常态。归一化键统一由 {@link Normalizer} 计算（单一来源）。
 * 调度复用 {@code VisitorAnalysisSchedulingConfig} 的 @EnableScheduling。
 */
@Service
public class CustomerSyncService {

    private static final Logger log = LoggerFactory.getLogger(CustomerSyncService.class);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter DATETIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final YoooniCustomerClient client;
    private final CustomerRefRepository repo;
    private final Normalizer normalizer;
    private final CustomerSyncProperties props;

    public CustomerSyncService(YoooniCustomerClient client, CustomerRefRepository repo,
                               Normalizer normalizer, CustomerSyncProperties props) {
        this.client = client;
        this.repo = repo;
        this.normalizer = normalizer;
        this.props = props;
    }

    @Scheduled(cron = "${toolbox.visitor-analysis.customer-sync.full-cron:0 30 2 * * *}")
    public void scheduledFull() {
        if (!props.isEnabled()) return;
        try {
            int n = syncFull();
            log.info("[customer-sync] 定时全量同步客户 {} 条", n);
        } catch (Exception e) {
            log.warn("[customer-sync] 定时全量同步失败: {}", e.getMessage());
        }
    }

    @Scheduled(cron = "${toolbox.visitor-analysis.customer-sync.incr-cron:0 */30 * * * *}")
    public void scheduledIncr() {
        if (!props.isEnabled()) return;
        try {
            int n = syncIncr();
            if (n > 0) log.info("[customer-sync] 定时增量同步客户 {} 条", n);
        } catch (Exception e) {
            log.warn("[customer-sync] 定时增量同步失败（本轮不推进水位）: {}", e.getMessage());
        }
    }

    /** 全量同步（sinceDate=空），返回 upsert 条数。 */
    public int syncFull() throws java.io.IOException {
        return upsert(client.fetchCustomers(null));
    }

    /** 增量同步：按本地最大 src_lastdate 作水位，返回 upsert 条数。 */
    public int syncIncr() throws java.io.IOException {
        Long watermark = repo.maxSrcLastdate();
        if (watermark == null) {
            return syncFull();   // 空库先全量
        }
        String sinceDate = Instant.ofEpochMilli(watermark).atZone(ZoneId.systemDefault()).toLocalDate().format(DAY);
        return upsert(client.fetchCustomers(sinceDate));
    }

    private int upsert(List<CustomerSyncRecord> records) {
        long now = System.currentTimeMillis();
        int n = 0;
        for (CustomerSyncRecord r : records) {
            if (r.custId() == null) continue;
            String custAddr = (r.doorcode() != null && !r.doorcode().isBlank()) ? r.doorcode() : r.address();
            String nameNorm = normalizer.company(r.name());
            String keywordNorm = normalizer.company(r.briefname());
            String addrNorm = normalizer.addr(custAddr);
            String telNorm = normalizer.phone(r.tel());
            String mobileNorm = normalizer.phone(r.contactMobile());
            repo.upsertFromSync(r.custId(), r.name(), r.briefname(), custAddr, r.checkinAddress(),
                    r.tel(), r.contactMobile(), parseDouble(r.longitude()), parseDouble(r.latitude()),
                    nameNorm, keywordNorm, addrNorm, telNorm, mobileNorm, parseMillis(r.lastdate()), now);
            n++;
        }
        return n;
    }

    private static Double parseDouble(String s) {
        if (s == null || s.isBlank()) return null;
        try { return Double.parseDouble(s.trim()); } catch (Exception e) { return null; }
    }

    /** 容错解析时间：yyyy-MM-dd HH:mm:ss / yyyy-MM-dd / 纯数字 ms。失败返回 null。 */
    static Long parseMillis(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String s = raw.trim();
        try { return LocalDateTime.parse(s, DATETIME).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli(); }
        catch (Exception ignore) { /* next */ }
        try { return LocalDate.parse(s, DAY).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli(); }
        catch (Exception ignore) { /* next */ }
        try { return Long.parseLong(s); } catch (Exception ignore) { return null; }
    }
}
