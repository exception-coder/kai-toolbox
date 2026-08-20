package com.exceptioncoder.toolbox.assistant.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/** Assistant 到 ReqPool 的幂等登记映射。 */
@Repository
public class AssistantRegistrationRepository {

    private final JdbcTemplate jdbc;

    public AssistantRegistrationRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 尝试预占幂等键，返回是否由当前请求获得。 */
    public boolean reserve(String id, String draftId, String idempotencyKey, long now) {
        return jdbc.update("""
                INSERT OR IGNORE INTO assistant_registration
                  (id, draft_id, idempotency_key, requirement_id, status, create_time, update_time)
                VALUES (?, ?, ?, NULL, 'RESERVED', ?, ?)
                """, id, draftId, idempotencyKey, now, now) == 1;
    }

    /** 完成预占记录。 */
    public void complete(String idempotencyKey, String requirementId, long now) {
        jdbc.update("""
                UPDATE assistant_registration
                   SET requirement_id = ?, status = 'SAVED', update_time = ?
                 WHERE idempotency_key = ?
                """, requirementId, now, idempotencyKey);
    }

    /** 查询幂等键对应的正式需求。 */
    public Optional<String> findRequirementId(String idempotencyKey, String draftId) {
        return jdbc.query("""
                SELECT requirement_id
                  FROM assistant_registration
                 WHERE (idempotency_key = ? OR draft_id = ?) AND status = 'SAVED'
                 ORDER BY create_time ASC
                 LIMIT 1
                """, (resultSet, rowNum) -> resultSet.getString("requirement_id"), idempotencyKey, draftId)
                .stream().findFirst();
    }
}
