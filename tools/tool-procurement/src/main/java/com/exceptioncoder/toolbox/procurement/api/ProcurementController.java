package com.exceptioncoder.toolbox.procurement.api;

import com.exceptioncoder.toolbox.procurement.domain.ProcurementStore;
import com.exceptioncoder.toolbox.procurement.service.ProcurementCatalogService;
import com.exceptioncoder.toolbox.procurement.service.ProcurementRunService;
import com.exceptioncoder.toolbox.procurement.service.ProcurementStructureService;
import com.exceptioncoder.toolbox.procurement.domain.ProcurementStructure;
import com.exceptioncoder.toolbox.procurement.domain.ProcurementDiscovery;
import com.exceptioncoder.toolbox.procurement.service.ProcurementDiscoveryService;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;
import static com.exceptioncoder.toolbox.procurement.domain.ProcurementData.*;

/** 招采工作区 HTTP 接口，输入规则由应用服务统一校验。 */
@RestController
@RequestMapping("/api/procurement")
public class ProcurementController {
    private final ProcurementStore store;
    private final ProcurementCatalogService catalog;
    private final ProcurementRunService runs;
    private final ProcurementStructureService structure;
    private final ProcurementDiscovery.Store discoveryStore;
    private final ProcurementDiscoveryService discovery;
    private final com.exceptioncoder.toolbox.procurement.domain.ProcurementCacheStore cache;

    public ProcurementController(ProcurementStore store, ProcurementCatalogService catalog, ProcurementRunService runs,
                                 ProcurementStructureService structure, ProcurementDiscovery.Store discoveryStore,
                                 ProcurementDiscoveryService discovery,
                                 com.exceptioncoder.toolbox.procurement.domain.ProcurementCacheStore cache) {
        this.store = store;
        this.catalog = catalog;
        this.runs = runs;
        this.structure = structure;
        this.discoveryStore = discoveryStore;
        this.discovery = discovery;
        this.cache = cache;
    }

    @GetMapping("/discovery")
    public List<Map<String, Object>> discovery() { return discoveryStore.batches(); }

    @PostMapping("/discovery")
    public Map<String, Object> discoverToday() { return discovery.start(); }

    @GetMapping("/discovery/{id}")
    public Map<String, Object> discovery(@PathVariable String id) { return discoveryStore.batch(id); }

    @GetMapping("/discovery/{id}/links")
    public Page<Map<String, Object>> discoveryLinks(@PathVariable String id,
            @RequestParam(defaultValue = "MATCHED") String regionStatus, @RequestParam(defaultValue = "0") int page) {
        if (page < 0 || page > 10000 || !List.of("MATCHED", "REGION_UNKNOWN", "EXCLUDED").contains(regionStatus)) {
            throw new IllegalArgumentException("链接查询参数无效");
        }
        return discoveryStore.links(id, regionStatus, page);
    }

    @PostMapping("/discovery/{id}/details")
    public Run discoveryDetails(@PathVariable String id, @RequestParam(defaultValue = "false") boolean parseOnly,
                                @RequestParam(defaultValue = "true") boolean parseWithLlm) {
        return discovery.details(id, parseOnly, parseOnly && parseWithLlm);
    }

    @GetMapping("/structure")
    public ProcurementStructure.Schema structure() { return structure.schema(); }

    @PutMapping("/structure")
    public ProcurementStructure.Schema structure(@RequestBody ProcurementStructure.Schema schema) { return structure.save(schema); }

    @GetMapping("/notices/{id}/structured")
    public ProcurementStructure.Result structured(@PathVariable String id) { return structure.result(id); }

    @PutMapping("/notices/{id}/structured")
    public ProcurementStructure.Result structured(@PathVariable String id, @RequestBody ProcurementStructure.Correction correction) {
        return structure.correct(id, correction);
    }

    @GetMapping("/overview")
    public Map<String, Long> overview() { return store.overview(); }

    @GetMapping("/sites")
    public List<Site> sites() { return store.sites(); }

    @PutMapping("/sites/{id}")
    public Site site(@PathVariable String id, @RequestBody Site site) { return catalog.saveSite(id, site); }

    @PostMapping("/sites/{id}/discover")
    public List<Link> discover(@PathVariable String id) { return runs.discover(id); }

    @GetMapping("/rules")
    public List<Rule> rules() { return store.rules(); }

    @PostMapping("/rules")
    public Rule createRule(@RequestBody Rule rule) {
        if (rule.id() == null || store.rules().stream().anyMatch(r -> r.id().equals(rule.id()))) {
            throw new IllegalArgumentException("规则编号为空或已存在");
        }
        return catalog.saveRule(rule.id(), rule);
    }

    @PutMapping("/rules/{id}")
    public Rule rule(@PathVariable String id, @RequestBody Rule rule) { return catalog.saveRule(id, rule); }

    @DeleteMapping("/rules/{id}")
    public void deleteRule(@PathVariable String id) { store.deleteRule(id); }

    @GetMapping("/notices")
    public Page<Notice> notices(@RequestParam(defaultValue = "") String search,
            @RequestParam(defaultValue = "") String siteId, @RequestParam(defaultValue = "") String status,
            @RequestParam(defaultValue = "0") Integer page) {
        if (page < 0 || page > 100000 || search.length() > 300) { throw new IllegalArgumentException("查询参数超出范围"); }
        return store.notices(new NoticeQuery(search, siteId, status, page));
    }

    @GetMapping("/notices/{id}")
    public Notice notice(@PathVariable String id) { return store.notice(id); }

    @GetMapping("/business-notices")
    public Map<String, Object> businessNotices(@RequestParam(defaultValue = "") String search,
            @RequestParam(defaultValue = "") String siteId, @RequestParam(defaultValue = "") String status,
            @RequestParam(defaultValue = "0") int page) {
        if (page < 0 || page > 100000 || search.length() > 300) { throw new IllegalArgumentException("查询参数超出范围"); }
        return structure.businessPage(new NoticeQuery(search, siteId, status, page, true));
    }

    @GetMapping("/notices/{id}/cache")
    public org.springframework.http.ResponseEntity<Capture> cache(@PathVariable String id) {
        store.notice(id);
        return org.springframework.http.ResponseEntity.ok().header("Content-Disposition", "attachment; filename=page-cache.json")
                .body(cache.find(id).orElseThrow(() -> new IllegalArgumentException("此公告尚无 HTML 缓存；旧正文仍可直接解析")));
    }

    @PostMapping("/notices")
    public Notice add(@RequestBody AddNotice body) { return catalog.addNotice(body.url(), body.title()); }

    @GetMapping("/runs")
    public List<Run> runs() { return store.runs(); }

    @GetMapping("/notices/{id}/attempts")
    public List<Map<String, Object>> attempts(@PathVariable String id) {
        store.notice(id);
        return cache.attempts(id);
    }

    @PostMapping("/runs")
    public Run run(@RequestBody StartRun body) {
        return runs.start(body.siteId() == null ? "" : body.siteId(), body.noticeId() == null ? "" : body.noticeId(),
                !Boolean.FALSE.equals(body.parseWithLlm()), Boolean.TRUE.equals(body.parseOnly()));
    }

    /** 手工登记公告。 */
    public record AddNotice(String url, String title) { }
    /** 运行范围及是否进行模型解析。 */
    public record StartRun(String siteId, String noticeId, Boolean parseWithLlm, Boolean parseOnly) { }
}
