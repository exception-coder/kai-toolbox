package com.exceptioncoder.toolbox.visitoranalysis.repository;

import com.exceptioncoder.toolbox.visitoranalysis.api.dto.CustAddAuditRecord;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;

/**
 * 客户新增审批同步台账（{@code va_cust_add_audit}）读写。
 * 登记按 {@code flowcheckid} 幂等（INSERT OR IGNORE）；判别走「乐观占用 → 回写结果」两步，防重复处理。
 */
@Repository
public class CustAddAuditRepository {

    private final JdbcTemplate jdbc;

    public CustAddAuditRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 幂等登记一条拉取记录。flowcheckid 冲突则跳过（不覆盖已有判定）。返回是否真正插入。 */
    public boolean insertIgnore(CustAddAuditRecord r, Long makeDateMs, long now) {
        int rows = jdbc.update("""
                INSERT OR IGNORE INTO va_cust_add_audit
                    (flowcheckid, apply_no, apply_title, applicant, apply_dept, make_date, make_date_raw,
                     customerup_apply_logid, company_brand_name, customer_name, checkin_address, customer_address,
                     analyze_status, needs_review, fetched_at, created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'PENDING', 0, ?, ?)
                """,
                r.flowcheckid(), r.applyNo(), r.applyTitle(), r.applicant(), r.applyDept(),
                makeDateMs, r.makeDate(), r.customerUpApplyLogId(), r.companyBrandName(),
                r.customerName(), r.checkinAddress(), r.customerAddress(), now, now);
        return rows > 0;
    }

    /** 当前水位：最大 make_date（epoch ms）。无记录返回 null。 */
    public Long maxMakeDateOrNull() {
        return jdbc.queryForObject("SELECT MAX(make_date) FROM va_cust_add_audit", Long.class);
    }

    /** 取待判别记录 id（PENDING），按生成时间升序。 */
    public List<Long> listPendingIds(int limit) {
        return jdbc.queryForList(
                "SELECT id FROM va_cust_add_audit WHERE analyze_status = 'PENDING' "
                        + "ORDER BY make_date, id LIMIT ?",
                Long.class, limit);
    }

    /** 乐观占用：仅当仍为 PENDING 才置 ANALYZING。返回 true 表示本调用抢到，应由本线程判别。 */
    public boolean claim(long id) {
        int rows = jdbc.update(
                "UPDATE va_cust_add_audit SET analyze_status = 'ANALYZING' "
                        + "WHERE id = ? AND analyze_status = 'PENDING'", id);
        return rows == 1;
    }

    /** 强制重置为 PENDING（供手动重判：连已判别 DONE 的也允许重新判别）。 */
    public void resetPending(long id) {
        jdbc.update("UPDATE va_cust_add_audit SET analyze_status = 'PENDING' WHERE id = ?", id);
    }

    /** 读单条（含来源字段，供判别取公司/地址）。 */
    public Map<String, Object> get(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM va_cust_add_audit WHERE id = ?", id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 判别成功回写结果。 */
    public void saveVerdict(long id, Long visitorId, long verdictId, String identity, String relationship,
                            double confidence, boolean duplicate, Long dupCustId, boolean needsReview, long now) {
        jdbc.update("""
                UPDATE va_cust_add_audit SET
                    analyze_status = 'DONE', verdict_id = ?, visitor_id = ?, identity = ?, relationship = ?,
                    confidence = ?, is_duplicate = ?, dup_cust_id = ?, needs_review = ?, analyze_error = NULL,
                    analyzed_at = ?
                WHERE id = ?
                """,
                verdictId, visitorId, identity, relationship, confidence,
                duplicate ? 1 : 0, dupCustId, needsReview ? 1 : 0, now, id);
    }

    /** 判别失败回写：置 FAILED + 错误信息，留待下轮人工/重试。 */
    public void markFailed(long id, String err, long now) {
        jdbc.update(
                "UPDATE va_cust_add_audit SET analyze_status = 'FAILED', analyze_error = ?, analyzed_at = ? WHERE id = ?",
                err == null ? "未知错误" : (err.length() > 500 ? err.substring(0, 500) : err), now, id);
    }

    /**
     * 按 Yoooni 申请单号（apply_no = flowApplyId）查最新一条记录，LEFT JOIN 判别结果补 rationale。
     * 供 ERP 审批列表实时回查 AI 判定用。无记录返回 null。
     */
    public Map<String, Object> findByFlowApplyId(long flowApplyId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT a.*, v.rationale AS verdict_rationale, v.evidence_json AS verdict_evidence
                  FROM va_cust_add_audit a
                  LEFT JOIN va_verdict v ON v.id = a.verdict_id
                 WHERE a.apply_no = ?
                 ORDER BY a.id DESC
                 LIMIT 1
                """, flowApplyId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /**
     * 批量按 apply_no(=flowApplyId) 查记录，一次 IN 查询，LEFT JOIN 判别结果补 rationale。
     * 结果按 id DESC 排序：同一 apply_no 的多条（多节点）中，上层取首个即最新。供 ERP 审批列表批量回查。
     */
    public List<Map<String, Object>> findByFlowApplyIds(List<Long> flowApplyIds) {
        if (flowApplyIds == null || flowApplyIds.isEmpty()) return List.of();
        String placeholders = String.join(",", java.util.Collections.nCopies(flowApplyIds.size(), "?"));
        return jdbc.queryForList(
                "SELECT a.*, v.rationale AS verdict_rationale FROM va_cust_add_audit a "
                        + "LEFT JOIN va_verdict v ON v.id = a.verdict_id "
                        + "WHERE a.apply_no IN (" + placeholders + ") ORDER BY a.id DESC",
                flowApplyIds.toArray());
    }

    /** 列表（前端查看 / 排障），最近优先。 */
    public List<Map<String, Object>> listRecent(int limit) {
        return jdbc.queryForList(
                "SELECT * FROM va_cust_add_audit ORDER BY fetched_at DESC, id DESC LIMIT ?", limit);
    }

    /** 分页：按生成日期(make_date)降序、id 兜底，最新在前。offset/limit 由上层据 page/pageSize 计算。 */
    public List<Map<String, Object>> listPaged(int offset, int limit) {
        return jdbc.queryForList(
                "SELECT * FROM va_cust_add_audit ORDER BY make_date DESC, id DESC LIMIT ? OFFSET ?",
                limit, offset);
    }

    /** 台账总条数（分页用）。 */
    public int countAll() {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM va_cust_add_audit", Integer.class);
        return n == null ? 0 : n;
    }

    /**
     * ERP 反馈回写：把「AI 判定是否正确 + 不正确原因 + 正确结果」写进台账（按主键 id）。
     * correct 用 Integer 直存（1/0），其余可空。返回受影响行数。
     */
    public int saveErpFeedback(long id, boolean correct, String reason,
                               String correctedIdentity, String correctedRelationship,
                               String operator, long now) {
        return jdbc.update("""
                UPDATE va_cust_add_audit SET
                    erp_feedback_correct = ?, erp_feedback_reason = ?,
                    erp_corrected_identity = ?, erp_corrected_relationship = ?,
                    erp_feedback_operator = ?, erp_feedback_at = ?
                WHERE id = ?
                """,
                correct ? 1 : 0, reason, correctedIdentity, correctedRelationship, operator, now, id);
    }
}
