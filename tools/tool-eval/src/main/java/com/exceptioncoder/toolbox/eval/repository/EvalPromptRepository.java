package com.exceptioncoder.toolbox.eval.repository;

import com.exceptioncoder.toolbox.eval.domain.EvalPrompt;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class EvalPromptRepository {

    private static final RowMapper<EvalPrompt> ROW = (rs, i) -> EvalPrompt.builder()
            .id(rs.getString("id"))
            .promptKey(rs.getString("prompt_key"))
            .version(rs.getInt("version"))
            .content(rs.getString("content"))
            .note(rs.getString("note"))
            .active(rs.getInt("active") == 1)
            .createdAt(rs.getLong("created_at"))
            .build();

    private final JdbcTemplate jdbc;

    public EvalPromptRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(EvalPrompt p) {
        jdbc.update("INSERT INTO eval_prompt (id, prompt_key, version, content, note, active, created_at) VALUES (?,?,?,?,?,?,?)",
                p.getId(), p.getPromptKey(), p.getVersion(), p.getContent(), p.getNote(),
                p.isActive() ? 1 : 0, p.getCreatedAt());
    }

    public Optional<EvalPrompt> findActive(String promptKey) {
        List<EvalPrompt> rows = jdbc.query(
                "SELECT * FROM eval_prompt WHERE prompt_key=? AND active=1 ORDER BY version DESC LIMIT 1",
                ROW, promptKey);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public Optional<EvalPrompt> findByKeyAndVersion(String promptKey, int version) {
        List<EvalPrompt> rows = jdbc.query("SELECT * FROM eval_prompt WHERE prompt_key=? AND version=?",
                ROW, promptKey, version);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public List<EvalPrompt> findByKey(String promptKey) {
        return jdbc.query("SELECT * FROM eval_prompt WHERE prompt_key=? ORDER BY version DESC", ROW, promptKey);
    }

    public int nextVersion(String promptKey) {
        Integer max = jdbc.queryForObject("SELECT COALESCE(MAX(version),0) FROM eval_prompt WHERE prompt_key=?",
                Integer.class, promptKey);
        return (max == null ? 0 : max) + 1;
    }

    /** 同 key 下仅一条 active，切换时先全部清零。 */
    public void activate(String promptKey, int version) {
        jdbc.update("UPDATE eval_prompt SET active=0 WHERE prompt_key=?", promptKey);
        jdbc.update("UPDATE eval_prompt SET active=1 WHERE prompt_key=? AND version=?", promptKey, version);
    }
}
