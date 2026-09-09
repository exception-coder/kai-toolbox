package com.exceptioncoder.toolbox.procurement.repository;

import com.exceptioncoder.toolbox.procurement.domain.ProcurementCacheStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import static com.exceptioncoder.toolbox.procurement.domain.ProcurementData.*;

/** 参数化保存完整快照；解析记录保存输入哈希与结果，便于复现。 */
@Repository
public class JdbcProcurementCacheStore implements ProcurementCacheStore {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    public JdbcProcurementCacheStore(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }
    @Override
    public Optional<Capture> find(String noticeId) {
        return jdbc.query("SELECT snapshot FROM procurement_page_cache WHERE notice_id=?",
                (row, index) -> decode(row.getString(1)), noticeId).stream().findFirst();
    }
    @Override
    public void save(String noticeId, Capture capture) {
        try {
            jdbc.update("INSERT OR IGNORE INTO procurement_page_cache(notice_id,snapshot,captured_at) VALUES(?,?,?)",
                    noticeId, mapper.writeValueAsString(capture), Instant.now().toString());
        } catch (java.io.IOException e) { throw new IllegalStateException("页面快照无法保存", e); }
    }
    @Override
    public void record(String noticeId, String runId, String text, String rules, Parsed result) {
        try {
            String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(text.getBytes(StandardCharsets.UTF_8)));
            var analysis = mapper.readTree(result.analysis());
            String engine = analysis.path("attemptedEngine").asText(analysis.path("engine").asText("CODE"));
            jdbc.update("INSERT INTO procurement_parse_attempt(id,notice_id,run_id,content_hash,engine,status,"
                            + "rule_snapshot,analysis,error,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                    UUID.randomUUID().toString(), noticeId, runId, hash, engine, result.status(), rules,
                    result.analysis(), result.error(), Instant.now().toString());
        } catch (java.io.IOException | java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("解析记录无法保存", e);
        }
    }
    private Capture decode(String json) {
        try { return mapper.readValue(json, Capture.class); }
        catch (java.io.IOException e) { throw new IllegalStateException("页面缓存损坏", e); }
    }
    @Override
    public java.util.List<java.util.Map<String, Object>> attempts(String noticeId) {
        return jdbc.queryForList("SELECT id,run_id,content_hash,engine,status,rule_snapshot,analysis,error,created_at "
                + "FROM procurement_parse_attempt WHERE notice_id=? ORDER BY created_at DESC LIMIT 50", noticeId);
    }
    @Override
    public void saveExampleRun(String id, String createdAt, String result) {
        jdbc.update("INSERT INTO procurement_example_run(id,created_at,result) VALUES(?,?,?)", id, createdAt, result);
    }
    @Override
    public java.util.List<String> exampleRuns() {
        return jdbc.query("SELECT result FROM procurement_example_run ORDER BY created_at DESC LIMIT 20",
                (row, index) -> row.getString(1));
    }
}
