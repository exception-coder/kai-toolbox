package com.regentech_fashion.supplierquote.infrastructure.srm.persistence.repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.List;

/** 报价待办的供应商隔离查询与逻辑删除。 */
public class MarketQuoteTaskRepository {
    private static final int MARKET_QUOTE_TASK_TYPE = 0;

    @PersistenceContext(unitName = "marketQuoteMysql")
    private EntityManager entityManager;

    /** 查询当前供应商的待报价轮次 ID。 */
    public List<Long> findPendingCycleIds(Long supplierId) {
        List<?> rows = entityManager.createNativeQuery("""
                        SELECT business_id
                        FROM srm_product_update_tasks
                        WHERE sup_id = :supplierId AND type = :type AND deleted = 0
                        """)
                .setParameter("supplierId", supplierId)
                .setParameter("type", MARKET_QUOTE_TASK_TYPE)
                .getResultList();
        return rows.stream().map(row -> ((Number) row).longValue()).toList();
    }

    /** 统计当前供应商待报价数量。 */
    public long countPending(Long supplierId) {
        Number count = (Number) entityManager.createNativeQuery("""
                        SELECT COUNT(*)
                        FROM srm_product_update_tasks
                        WHERE sup_id = :supplierId AND type = :type AND deleted = 0
                        """)
                .setParameter("supplierId", supplierId)
                .setParameter("type", MARKET_QUOTE_TASK_TYPE)
                .getSingleResult();
        return count.longValue();
    }

    /** 逻辑删除已完成的报价待办。 */
    public void complete(Long cycleId, Long supplierId, String actor) {
        entityManager.createNativeQuery("""
                        UPDATE srm_product_update_tasks
                        SET deleted = 1, updater = :actor, update_time = CURRENT_TIMESTAMP
                        WHERE business_id = :cycleId AND sup_id = :supplierId
                          AND type = :type AND deleted = 0
                        """)
                .setParameter("actor", actor)
                .setParameter("cycleId", cycleId)
                .setParameter("supplierId", supplierId)
                .setParameter("type", MARKET_QUOTE_TASK_TYPE)
                .executeUpdate();
    }

    /** 重新激活撤回报价对应的供应商待办。 */
    public int reopen(Long cycleId, Long supplierId, String actor) {
        return entityManager.createNativeQuery("""
                        UPDATE srm_product_update_tasks
                        SET deleted = 0, updater = :actor, update_time = CURRENT_TIMESTAMP
                        WHERE business_id = :cycleId AND sup_id = :supplierId
                          AND type = :type AND deleted = 1
                        """)
                .setParameter("actor", actor)
                .setParameter("cycleId", cycleId)
                .setParameter("supplierId", supplierId)
                .setParameter("type", MARKET_QUOTE_TASK_TYPE)
                .executeUpdate();
    }
}
