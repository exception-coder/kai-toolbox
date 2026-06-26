package com.exceptioncoder.toolbox.visitoranalysis.api;

import com.exceptioncoder.toolbox.visitoranalysis.repository.CustomerRefRepository;
import com.exceptioncoder.toolbox.visitoranalysis.service.CustomerSyncService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 客户底库同步手动入口（前端「立即全量/增量同步」按钮 + 底库条数查看）。
 * 定时同步由 {@link CustomerSyncService} 驱动；这里供手动触发与排障。
 */
@RestController
@RequestMapping("/api/visitor-analysis/customer-sync")
public class CustomerSyncController {

    private final CustomerSyncService sync;
    private final CustomerRefRepository repo;

    public CustomerSyncController(CustomerSyncService sync, CustomerRefRepository repo) {
        this.sync = sync;
        this.repo = repo;
    }

    /** 立即全量同步，返回 upsert 条数。 */
    @PostMapping("/full")
    public Map<String, Object> full() throws java.io.IOException {
        return Map.of("upserted", sync.syncFull());
    }

    /** 立即增量同步（按本地水位），返回 upsert 条数。 */
    @PostMapping("/incr")
    public Map<String, Object> incr() throws java.io.IOException {
        return Map.of("upserted", sync.syncIncr());
    }

    /** 本地客户底库条数。 */
    @GetMapping("/count")
    public Map<String, Object> count() {
        return Map.of("total", repo.count());
    }

    /** 一键删除客户底库（同步 + 导入），返回删除条数。清完可重新首次同步。 */
    @DeleteMapping("/base")
    public Map<String, Object> clearBase() {
        return Map.of("deleted", sync.clearBase());
    }
}
