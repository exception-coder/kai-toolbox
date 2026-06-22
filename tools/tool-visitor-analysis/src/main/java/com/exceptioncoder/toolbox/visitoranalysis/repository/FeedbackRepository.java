package com.exceptioncoder.toolbox.visitoranalysis.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** 人工纠正反馈仓储。纠正记录回流,未来用于扩充竞品名单 / 沉淀确定性规则。 */
@Repository
public class FeedbackRepository {

    private final JdbcTemplate jdbc;

    public FeedbackRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void add(long verdictId, String correctedIdentity, String correctedRelationship,
                    String operator, String note) {
        jdbc.update("""
                INSERT INTO va_feedback
                  (verdict_id, corrected_identity, corrected_relationship, operator, note, created_at)
                VALUES (?,?,?,?,?,?)
                """, verdictId, correctedIdentity, correctedRelationship, operator, note,
                System.currentTimeMillis());
    }

    /** 清空人工纠正反馈。随「一键清空最近判别」一并重置。 */
    public int clear() {
        return jdbc.update("DELETE FROM va_feedback");
    }
}
