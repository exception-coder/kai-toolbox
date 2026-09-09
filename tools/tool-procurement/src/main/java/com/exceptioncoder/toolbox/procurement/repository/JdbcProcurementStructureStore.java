package com.exceptioncoder.toolbox.procurement.repository;

import com.exceptioncoder.toolbox.procurement.domain.ProcurementStructureStore;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionTemplate;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import static com.exceptioncoder.toolbox.procurement.domain.ProcurementStructure.*;

/** SQLite 事务和版本条件防止并发编辑静默覆盖。 */
@Repository
public class JdbcProcurementStructureStore implements ProcurementStructureStore {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final TransactionTemplate transactions;

    public JdbcProcurementStructureStore(JdbcTemplate jdbc, ObjectMapper mapper, TransactionTemplate transactions) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.transactions = transactions;
    }

    @Override
    public Schema schema() {
        List<Schema> rows = jdbc.query("SELECT version,fields FROM procurement_structure WHERE id=1",
                (r, n) -> new Schema(r.getInt(1), read(r.getString(2), new TypeReference<List<Field>>() { })));
        if (!rows.isEmpty()) { return rows.getFirst(); }
        try (var stream = new ClassPathResource("procurement/structure.json").getInputStream()) {
            String fields = mapper.readTree(stream).toString();
            transactions.executeWithoutResult(status -> {
                jdbc.update("INSERT OR IGNORE INTO procurement_structure VALUES(1,1,?,?)", fields, now());
                jdbc.update("INSERT OR IGNORE INTO procurement_structure_history VALUES(1,?,?)", fields, now());
            });
            return schema();
        } catch (IOException e) { throw new IllegalStateException("无法读取招采结构模板", e); }
    }

    @Override
    public Schema save(Schema schema) {
        return transactions.execute(status -> {
            int next = schema.version() + 1;
            String fields = json(schema.fields());
            int updated = jdbc.update("UPDATE procurement_structure SET version=?,fields=?,update_time=? WHERE id=1 AND version=?",
                    next, fields, now(), schema.version());
            if (updated != 1) { throw new IllegalArgumentException("数据结构已被修改，请刷新后重试"); }
            jdbc.update("INSERT INTO procurement_structure_history VALUES(?,?,?)", next, fields, now());
            return new Schema(next, schema.fields());
        });
    }

    @Override
    public Overrides overrides(String noticeId) {
        List<Overrides> rows = jdbc.query("SELECT version,values_json FROM procurement_notice_override WHERE notice_id=?",
                (r, n) -> new Overrides(r.getInt(1), read(r.getString(2), new TypeReference<Map<String, String>>() { })), noticeId);
        return rows.isEmpty() ? new Overrides(0, Map.of()) : rows.getFirst();
    }

    @Override
    public void saveOverrides(String noticeId, Correction correction) {
        transactions.executeWithoutResult(status -> {
            // 锁住同一结构版本，使字段验证与覆盖写入使用同一契约。
            if (jdbc.update("UPDATE procurement_structure SET version=version WHERE id=1 AND version=?", correction.schemaVersion()) != 1) {
                throw new IllegalArgumentException("数据结构已被修改，请刷新后重试");
            }
            int updated;
            if (correction.version() == 0) {
                updated = jdbc.update("INSERT OR IGNORE INTO procurement_notice_override VALUES(?,1,?,?)",
                        noticeId, json(correction.values()), now());
            } else {
                updated = jdbc.update("UPDATE procurement_notice_override SET version=version+1,values_json=?,update_time=? "
                                + "WHERE notice_id=? AND version=?", json(correction.values()), now(), noticeId, correction.version());
            }
            if (updated != 1) { throw new IllegalArgumentException("公告修正已被修改，请刷新后重试"); }
        });
    }

    @Override
    public Map<String, Overrides> overrides(List<String> noticeIds) {
        Map<String, Overrides> result = new java.util.HashMap<>();
        if (noticeIds.isEmpty()) { return result; }
        if (noticeIds.size() > 100) { throw new IllegalArgumentException("一次最多读取 100 条公告修正"); }
        String placeholders = String.join(",", java.util.Collections.nCopies(noticeIds.size(), "?"));
        jdbc.query("SELECT notice_id,version,values_json FROM procurement_notice_override WHERE notice_id IN ("
                + placeholders + ")", (org.springframework.jdbc.core.RowCallbackHandler) row -> result.put(row.getString(1),
                new Overrides(row.getInt(2), read(row.getString(3), new TypeReference<Map<String, String>>() { }))),
                noticeIds.toArray());
        return result;
    }

    private String now() { return Instant.now().toString(); }
    private String json(Object value) {
        try { return mapper.writeValueAsString(value); }
        catch (IOException e) { throw new IllegalArgumentException("结构数据无法序列化", e); }
    }
    private <T> T read(String value, TypeReference<T> type) {
        try { return mapper.readValue(value, type); }
        catch (IOException e) { throw new IllegalStateException("存储的结构数据损坏", e); }
    }
}
