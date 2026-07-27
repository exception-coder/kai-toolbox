package com.exceptioncoder.toolbox.foreconsult.repository;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultPrompt;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class ConsultPromptRepository {

    private static final RowMapper<ConsultPrompt> ROW = (rs, i) -> ConsultPrompt.builder()
            .id(rs.getString("id"))
            .promptKey(rs.getString("prompt_key"))
            .version(rs.getInt("version"))
            .content(rs.getString("content"))
            .note(rs.getString("note"))
            .active(rs.getInt("active") == 1)
            .createdAt(rs.getLong("created_at"))
            .build();

    private final JdbcTemplate jdbc;

    public ConsultPromptRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(ConsultPrompt p) {
        jdbc.update("INSERT INTO consult_prompt (id, prompt_key, version, content, note, active, created_at) "
                        + "VALUES (?,?,?,?,?,?,?)",
                p.getId(), p.getPromptKey(), p.getVersion(), p.getContent(), p.getNote(),
                p.isActive() ? 1 : 0, p.getCreatedAt());
    }

    public Optional<ConsultPrompt> findActive(String promptKey) {
        List<ConsultPrompt> rows = jdbc.query(
                "SELECT * FROM consult_prompt WHERE prompt_key=? AND active=1 ORDER BY version DESC LIMIT 1",
                ROW, promptKey);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public Optional<ConsultPrompt> findByKeyAndVersion(String promptKey, int version) {
        List<ConsultPrompt> rows = jdbc.query(
                "SELECT * FROM consult_prompt WHERE prompt_key=? AND version=?", ROW, promptKey, version);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public List<ConsultPrompt> findByKey(String promptKey) {
        return jdbc.query("SELECT * FROM consult_prompt WHERE prompt_key=? ORDER BY version DESC", ROW, promptKey);
    }

    public int nextVersion(String promptKey) {
        Integer max = jdbc.queryForObject(
                "SELECT COALESCE(MAX(version), 0) FROM consult_prompt WHERE prompt_key=?", Integer.class, promptKey);
        return (max == null ? 0 : max) + 1;
    }

    /** 同 key 下仅保留一条 active，先全清再点亮目标版本。 */
    public void activate(String promptKey, int version) {
        jdbc.update("UPDATE consult_prompt SET active=0 WHERE prompt_key=?", promptKey);
        jdbc.update("UPDATE consult_prompt SET active=1 WHERE prompt_key=? AND version=?", promptKey, version);
    }
}
