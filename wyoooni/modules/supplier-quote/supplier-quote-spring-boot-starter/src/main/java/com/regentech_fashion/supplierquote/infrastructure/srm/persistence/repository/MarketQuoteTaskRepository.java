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
                        SELECT DISTINCT business_id
                        FROM srm_product_update_tasks
                        WHERE sup_id = :supplierId AND type = :type AND deleted = 0
                        """)
                .setParameter("supplierId", supplierId)
                .setParameter("type", MARKET_QUOTE_TASK_TYPE)
                .getResultList();
        return rows.stream().map(row -> ((Number) row).longValue()).toList();
    }

    /** 按 H5 五态口径统计待报价与待重报轮次。 */
    public long countQuotableCycles(Long supplierId) {
        Number count = (Number) entityManager.createNativeQuery("""
                        SELECT COUNT(*)
                        FROM srm_sup_update_product_cycle cycle
                        LEFT JOIN srm_sup_update_product_price price
                          ON price.id = cycle.price_id AND price.deleted = 0
                        WHERE cycle.sup_id = :supplierId AND cycle.deleted = 0
                          AND (
                            cycle.price_id IS NULL
                            OR cycle.price_status IS NULL
                            OR cycle.price_status = -1
                            OR (
                              cycle.price_status = 2
                              AND (
                                price.audit_result = 3
                                OR EXISTS (
                                  SELECT 1
                                  FROM srm_product_update_tasks task
                                  WHERE task.business_id = cycle.id
                                    AND task.sup_id = :supplierId
                                    AND task.type = :type
                                    AND task.deleted = 0
                                )
                              )
                            )
                          )
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
