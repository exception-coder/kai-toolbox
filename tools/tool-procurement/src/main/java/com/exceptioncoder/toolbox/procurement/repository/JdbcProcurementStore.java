package com.exceptioncoder.toolbox.procurement.repository;

import com.exceptioncoder.toolbox.procurement.domain.ProcurementStore;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import static com.exceptioncoder.toolbox.procurement.domain.ProcurementData.*;

/** 参数化 SQLite 存储，列表不加载正文与历史大字段。 */
@Repository
public class JdbcProcurementStore implements ProcurementStore {
    private static final int PAGE_SIZE = 30;
    private static final String NOTICE_COLUMNS = "id,site_id,url,title,capture_status,parse_status,raw_text,"
            + "final_url,frame_url,http_status,captured_at,error,candidates,analysis,source_data,run_id,update_time";
    private static final String SUMMARY_COLUMNS = "id,site_id,url,title,capture_status,parse_status,'' AS raw_text,"
            + "final_url,frame_url,http_status,captured_at,error,'{}' AS candidates,analysis,"
            + "'{}' AS source_data,run_id,update_time";
    private static final RowMapper<Notice> NOTICE = (r, n) -> new Notice(r.getString("id"),
            r.getString("site_id"), r.getString("url"), r.getString("title"), r.getString("capture_status"),
            r.getString("parse_status"), r.getString("raw_text"), r.getString("final_url"), r.getString("frame_url"),
            (Integer) r.getObject("http_status"), r.getString("captured_at"), r.getString("error"),
            r.getString("candidates"), r.getString("analysis"), r.getString("source_data"),
            r.getString("run_id"), r.getString("update_time"));
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public JdbcProcurementStore(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    @Override
    public List<Site> sites() {
        return jdbc.query("SELECT id,name,host,enabled,list_url,notes FROM procurement_site ORDER BY id",
                (r, n) -> new Site(r.getString(1), r.getString(2), r.getString(3), r.getBoolean(4),
                        r.getString(5), r.getString(6)));
    }

    @Override
    public void saveSite(Site s) {
        jdbc.update("UPDATE procurement_site SET name=?,enabled=?,list_url=?,notes=?,update_time=? WHERE id=?",
                s.name(), s.enabled(), s.listUrl(), s.notes(), Instant.now().toString(), s.id());
    }

    @Override
    public List<Rule> rules() {
        return jdbc.query("SELECT id,category,name,enabled,fields FROM procurement_rule ORDER BY category,id",
                (r, n) -> new Rule(r.getString(1), r.getString(2), r.getString(3), r.getBoolean(4),
                        readFields(r.getString(5))));
    }

    @Override
    public void saveRule(Rule r) {
        String now = Instant.now().toString();
        jdbc.update("INSERT INTO procurement_rule(id,category,name,enabled,fields,create_time,update_time) "
                        + "VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET category=excluded.category,"
                        + "name=excluded.name,enabled=excluded.enabled,fields=excluded.fields,update_time=excluded.update_time",
                r.id(), r.category(), r.name(), r.enabled(), json(r.fields()), now, now);
    }

    @Override
    public void deleteRule(String id) {
        jdbc.update("DELETE FROM procurement_rule WHERE id=?", id);
    }

    @Override
    public Page<Notice> notices(NoticeQuery q) {
        String where = " WHERE (?='' OR site_id=?) AND (?='' OR capture_status=?) "
                + "AND (?='' OR instr(title,?)>0)";
        if (q.discoveredOnly()) {
            where += " AND EXISTS (SELECT 1 FROM procurement_discovery_link l WHERE l.url=procurement_notice.url"
                    + " AND l.region_status='MATCHED')";
        }
        Object[] args = {q.siteId(), q.siteId(), q.status(), q.status(), q.search(), q.search()};
        Long total = jdbc.queryForObject("SELECT count(*) FROM procurement_notice" + where, Long.class, args);
        List<Notice> items = jdbc.query("SELECT " + SUMMARY_COLUMNS + " FROM procurement_notice" + where
                        + " ORDER BY update_time DESC,id LIMIT ? OFFSET ?", NOTICE,
                q.siteId(), q.siteId(), q.status(), q.status(), q.search(), q.search(), PAGE_SIZE, q.page() * PAGE_SIZE);
        return new Page<>(items, total, q.page(), PAGE_SIZE);
    }

    @Override
    public Notice notice(String id) {
        return jdbc.query("SELECT " + NOTICE_COLUMNS + " FROM procurement_notice WHERE id=?", NOTICE, id)
                .stream().findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "公告不存在"));
    }

    @Override
    public boolean addNotice(Notice n) {
        String now = Instant.now().toString();
        return jdbc.update("INSERT OR IGNORE INTO procurement_notice(id,site_id,url,title,source_data,create_time,update_time)"
                + " VALUES(?,?,?,?,?,?,?)", n.id(), n.siteId(), n.url(), n.title(), n.sourceData(), now, now) > 0;
    }

    @Override
    public List<Notice> targets(String siteId, String noticeId) {
        return jdbc.query("SELECT " + NOTICE_COLUMNS + " FROM procurement_notice WHERE "
                        + "(?='' OR site_id=?) AND (?='' OR id=?) "
                        + "AND site_id IN (SELECT id FROM procurement_site WHERE enabled=1) "
                        + "ORDER BY CASE capture_status WHEN 'PENDING' THEN 0 WHEN 'FAILED' THEN 1 ELSE 2 END,"
                        + "update_time,id LIMIT 100", NOTICE, siteId, siteId, noticeId, noticeId);
    }

    @Override
    public void saveCapture(Notice n) {
        jdbc.update("UPDATE procurement_notice SET title=?,capture_status=?,parse_status=?,raw_text=?,final_url=?,"
                        + "frame_url=?,http_status=?,captured_at=?,error=?,candidates=?,analysis=?,run_id=?,update_time=? WHERE id=?",
                n.title(), n.captureStatus(), n.parseStatus(), n.rawText(), n.finalUrl(), n.frameUrl(), n.httpStatus(),
                n.capturedAt(), n.error(), n.candidates(), n.analysis(), n.runId(), Instant.now().toString(), n.id());
    }

    @Override
    public Map<String, Long> overview() {
        return Map.of("sites", count("SELECT count(*) FROM procurement_site WHERE enabled=1"),
                "notices", count("SELECT count(*) FROM procurement_notice"),
                "captured", count("SELECT count(*) FROM procurement_notice WHERE capture_status='SUCCESS'"),
                "failed", count("SELECT count(*) FROM procurement_notice WHERE capture_status='FAILED'"),
                "rules", count("SELECT count(*) FROM procurement_rule WHERE enabled=1"),
                "review", count("SELECT count(*) FROM procurement_notice WHERE parse_status IN ('MANUAL_CHECK','PARTIAL')"));
    }

    @Override
    public List<Run> runs() {
        return jdbc.query("SELECT id,status,total,processed,succeeded,failed,error,create_time,update_time "
                + "FROM procurement_run ORDER BY create_time DESC LIMIT 20", (r, n) -> new Run(r.getString(1),
                r.getString(2), r.getInt(3), r.getInt(4), r.getInt(5), r.getInt(6), r.getString(7),
                r.getString(8), r.getString(9)));
    }

    @Override
    public void createRun(Run r, String snapshot) {
        jdbc.update("INSERT INTO procurement_run(id,status,total,rule_snapshot,create_time,update_time) VALUES(?,?,?,?,?,?)",
                r.id(), r.status(), r.total(), snapshot, r.createTime(), r.updateTime());
    }

    @Override
    public void updateRun(Run r) {
        jdbc.update("UPDATE procurement_run SET status=?,total=?,processed=?,succeeded=?,failed=?,error=?,update_time=? WHERE id=?",
                r.status(), r.total(), r.processed(), r.succeeded(), r.failed(), r.error(), r.updateTime(), r.id());
    }

    private long count(String sql) { return jdbc.queryForObject(sql, Long.class); }

    private Map<String, String> readFields(String value) {
        try {
            return mapper.readValue(value, new TypeReference<>() { });
        } catch (java.io.IOException e) {
            throw new IllegalStateException("关键词字段存储损坏", e);
        }
    }

    private String json(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalArgumentException("无法序列化规则", e);
        }
    }
}
