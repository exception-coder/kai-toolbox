package com.regentech_fashion.supplierquote.infrastructure.srm.persistence.repository;

import com.regentech_fashion.supplierquote.infrastructure.srm.persistence.entity.MarketQuotePriceEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/** 市场报价历史仓储。 */
public interface MarketQuotePriceRepository extends JpaRepository<MarketQuotePriceEntity, Long> {
    /** 读取未删除的当前价格。 */
    Optional<MarketQuotePriceEntity> findByIdAndDeletedFalse(Long id);

    /** 按新到旧读取某轮次的报价历史。 */
    List<MarketQuotePriceEntity> findByCycleIdAndDeletedFalseOrderByIdDesc(Long cycleId);
}
