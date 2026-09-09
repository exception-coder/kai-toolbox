package com.exceptioncoder.toolbox.procurement.repository;

import com.exceptioncoder.toolbox.procurement.domain.ProcurementDiscovery;
import com.exceptioncoder.toolbox.procurement.domain.ProcurementData;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** 每页在事务内登记链接；URL 冲突不更新已有公告及人工修正。 */
@Repository
public class JdbcProcurementDiscoveryStore implements ProcurementDiscovery.Store {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    public JdbcProcurementDiscoveryStore(JdbcTemplate jdbc, TransactionTemplate transaction) {
        this.jdbc = jdbc;
        this.transaction = transaction;
    }
    @Override
    public void create(String id, String date) {
        jdbc.update("INSERT INTO procurement_discovery(id,date,status,create_time,update_time) VALUES(?,?,'RUNNING',?,?)",
                id, date, now(), now());
    }
    @Override
    public void accept(String id, ProcurementDiscovery.Event event) {
        transaction.executeWithoutResult(status -> {
            if ("scope".equals(event.type())) {
                jdbc.update("INSERT INTO procurement_discovery_scope VALUES(?,?,?,?,?,?,?) "
                                + "ON CONFLICT(run_id,source,province) DO UPDATE SET status=excluded.status,"
                                + "pages=excluded.pages,seen=excluded.seen,error=excluded.error", id, event.source(),
                        event.province(), event.status(), event.pages(), event.seen(), event.error());
            } else if ("page".equals(event.type())) {
                for (var link : event.links()) {
                    jdbc.update("INSERT OR IGNORE INTO procurement_discovery_link VALUES(?,?,?,?,?,?,?,?,?)",
                            id, link.url(), link.title(), link.date(), event.source(), link.province(),
                            link.regionStatus(), link.metadata(), event.page());
                    if ("MATCHED".equals(link.regionStatus())) {
                        jdbc.update("INSERT OR IGNORE INTO procurement_notice(id,site_id,url,title,create_time,update_time) "
                                        + "VALUES(?,'www.ggzy.gov.cn',?,?,?,?)", "D_" + UUID.randomUUID(),
                                link.url(), link.title(), now(), now());
                    }
                }
                jdbc.update("UPDATE procurement_discovery SET pages=pages+1,update_time=? WHERE id=?", now(), id);
            }
        });
    }
    @Override
    public void finish(String id, String status, String error) {
        jdbc.update("UPDATE procurement_discovery SET status=?,error=?,update_time=? WHERE id=?", status, error, now(), id);
        jdbc.update("UPDATE procurement_discovery_scope SET status='INTERRUPTED',error='发现进程中断' "
                + "WHERE run_id=? AND status='RUNNING'", id);
    }
    @Override
    public List<Map<String, Object>> batches() {
        return jdbc.queryForList("SELECT d.*, (SELECT COUNT(*) FROM procurement_discovery_link l WHERE l.run_id=d.id "
                        + "AND region_status='MATCHED') AS matched, (SELECT COUNT(*) FROM procurement_discovery_link l "
                        + "WHERE l.run_id=d.id AND region_status='REGION_UNKNOWN') AS unknown "
                        + "FROM procurement_discovery d ORDER BY create_time DESC LIMIT 20");
    }
    @Override
    public Map<String, Object> batch(String id) {
        var rows = jdbc.queryForList("SELECT * FROM procurement_discovery WHERE id=?", id);
        if (rows.isEmpty()) { throw new IllegalArgumentException("发现批次不存在"); }
        var result = rows.getFirst();
        result.put("scopes", jdbc.queryForList("SELECT * FROM procurement_discovery_scope WHERE run_id=? ORDER BY source,province", id));
        return result;
    }
    @Override
    public ProcurementData.Page<Map<String, Object>> links(String id, String regionStatus, int page) {
        String filter = " FROM procurement_discovery_link WHERE run_id=? AND region_status=?";
        Long total = jdbc.queryForObject("SELECT COUNT(*)" + filter, Long.class, id, regionStatus);
        var rows = jdbc.queryForList("SELECT *" + filter + " ORDER BY source,province,page,url LIMIT 50 OFFSET ?",
                id, regionStatus, page * 50);
        return new ProcurementData.Page<>(rows, total == null ? 0 : total, page, 50);
    }
    @Override
    public List<String> noticeIds(String id) {
        return jdbc.queryForList("SELECT DISTINCT n.id FROM procurement_notice n JOIN procurement_discovery_link l "
                + "ON n.url=l.url WHERE l.run_id=? AND l.region_status='MATCHED'", String.class, id);
    }
    @Override
    public void interrupt() {
        jdbc.update("UPDATE procurement_discovery SET status='INTERRUPTED',error='服务重启，发现未完成，请重新执行' WHERE status='RUNNING'");
        jdbc.update("UPDATE procurement_discovery_scope SET status='INTERRUPTED',error='服务重启' WHERE status='RUNNING'");
    }
    private String now() { return Instant.now().toString(); }
}
