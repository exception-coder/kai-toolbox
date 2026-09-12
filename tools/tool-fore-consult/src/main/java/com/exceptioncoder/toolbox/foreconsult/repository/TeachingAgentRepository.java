package com.exceptioncoder.toolbox.foreconsult.repository;

import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingConfig;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingEvaluation;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingRun;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** 教学配置扩展与运行证据，版本身份仍由既有 Agent Registry 管理。 */
@Repository
public class TeachingAgentRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public TeachingAgentRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public void saveConfig(long version, TeachingConfig config) {
        jdbc.update("INSERT INTO consult_agent_teaching_config (version, config_json, create_time, update_time) "
                + "VALUES (?, ?, ?, ?)", version, encode(config), System.currentTimeMillis(), System.currentTimeMillis());
    }

    public TeachingConfig config(long version) {
        List<String> matches = jdbc.query("SELECT config_json FROM consult_agent_teaching_config WHERE version = ?",
                (rs, row) -> rs.getString("config_json"), version);
        if (matches.isEmpty()) {
            if (version == 1) {
                jdbc.update("INSERT OR IGNORE INTO consult_agent_teaching_config "
                        + "(version, config_json, create_time, update_time) VALUES (1, ?, ?, ?)",
                        encode(TeachingConfig.defaults()), System.currentTimeMillis(), System.currentTimeMillis());
                return config(version);
            }
            throw new IllegalArgumentException("此版本缺少教学配置");
        }
        return decode(matches.getFirst(), TeachingConfig.class);
    }

    public void saveRun(TeachingRun run) {
        saveEvidence(run.id(), run.version(), "RUN", run, run.createdAt());
    }

    public void saveEvaluation(TeachingEvaluation evaluation) {
        saveEvidence(evaluation.id(), evaluation.version(), "EVALUATION", evaluation, evaluation.createdAt());
    }

    public List<TeachingRun> runs() {
        return history("RUN", TeachingRun.class);
    }

    public List<TeachingEvaluation> evaluations() {
        return history("EVALUATION", TeachingEvaluation.class);
    }

    private void saveEvidence(String id, long version, String kind, Object evidence, long now) {
        jdbc.update("INSERT INTO consult_agent_teaching_run (id, version, kind, result_json, create_time, update_time) "
                + "VALUES (?, ?, ?, ?, ?, ?)", id, version, kind, encode(evidence), now, now);
    }

    private <T> List<T> history(String kind, Class<T> type) {
        return jdbc.query("SELECT result_json FROM consult_agent_teaching_run WHERE kind = ? "
                + "ORDER BY create_time DESC, id DESC LIMIT 20",
                (rs, row) -> decode(rs.getString("result_json"), type), kind);
    }

    private String encode(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (JsonProcessingException failure) {
            throw new IllegalStateException("教学记录序列化失败", failure);
        }
    }

    private <T> T decode(String value, Class<T> type) {
        try {
            return mapper.readValue(value, type);
        } catch (JsonProcessingException failure) {
            throw new IllegalStateException("教学记录读取失败", failure);
        }
    }
}
