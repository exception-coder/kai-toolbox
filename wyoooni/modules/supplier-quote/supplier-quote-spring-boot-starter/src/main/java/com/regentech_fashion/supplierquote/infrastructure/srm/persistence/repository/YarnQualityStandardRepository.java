package com.regentech_fashion.supplierquote.infrastructure.srm.persistence.repository;

import com.regentech_fashion.supplierquote.infrastructure.srm.persistence.entity.YarnQualityStandardEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/** 纱线质量标准只读仓储。 */
public interface YarnQualityStandardRepository extends JpaRepository<YarnQualityStandardEntity, Long> {
    /** 按产品读取关联的质量标准。 */
    @Query(value = """
            SELECT standards.*
            FROM srm_yarn_rating_standards standards
            JOIN srm_yarn_rating_stds_centre centre ON centre.ynrgs_id = standards.id
            WHERE centre.product_id = :productId
              AND centre.deleted = 0 AND standards.deleted = 0
            ORDER BY standards.id
            """, nativeQuery = true)
    List<YarnQualityStandardEntity> findByProductId(@Param("productId") Long productId);
}
