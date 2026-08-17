package com.regentech_fashion.supplierquote.infrastructure.srm.persistence.repository;

import com.regentech_fashion.supplierquote.infrastructure.srm.persistence.entity.MarketQuoteCycleEntity;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;

import java.util.Optional;

/** 市场报价当前快照仓储。 */
public interface MarketQuoteCycleRepository extends JpaRepository<MarketQuoteCycleEntity, Long>,
        JpaSpecificationExecutor<MarketQuoteCycleEntity> {

    /**
     * 锁定当前供应商的报价轮次。
     *
     * @param id 报价轮次 ID
     * @param supplierId 供应商 ID
     * @return 未删除的报价轮次
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<MarketQuoteCycleEntity> findByIdAndSupplierIdAndDeletedFalse(Long id, Long supplierId);

    /** 检查产品是否在当前供应商报价范围内。 */
    boolean existsByProductIdAndSupplierIdAndDeletedFalse(Long productId, Long supplierId);
}
