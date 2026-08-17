package com.regentech_fashion.supplierquote.infrastructure.srm.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 供应商市场报价历史记录。 */
@Entity
@Table(name = "srm_sup_update_product_price")
@Getter
@Setter
public class MarketQuotePriceEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "supc_id")
    private Long cycleId;
    @Column(name = "product_id")
    private Long productId;
    @Column(name = "product_code")
    private String productCode;
    @Column(name = "product_name")
    private String productName;
    private String dnumber;
    @Column(name = "procolor_id")
    private Long colorId;
    @Column(name = "procolor_code")
    private String colorCode;
    @Column(name = "procolor_name")
    private String colorName;
    @Column(name = "procolor_levels")
    private Integer colorGrade;
    @Column(name = "procolor_certificate")
    private String certification;
    @Column(name = "sup_id")
    private Long supplierId;
    @Column(name = "sup_name")
    private String supplierName;
    private BigDecimal price;
    @Column(name = "price_is_tax")
    private Integer priceIsTax;
    private Integer status;
    @JdbcTypeCode(SqlTypes.TINYINT)
    private Integer source;
    @Column(name = "price_include_tax")
    private BigDecimal priceIncludeTax;
    @Column(name = "price_exclude_tax")
    private BigDecimal priceExcludeTax;
    @Column(name = "tax_rate")
    private BigDecimal taxRate;
    @Column(name = "audit_result")
    @JdbcTypeCode(SqlTypes.TINYINT)
    private Integer auditResult;
    @Column(name = "reject_reason")
    private String rejectReason;
    @Column(name = "is_history")
    @JdbcTypeCode(SqlTypes.TINYINT)
    private Integer history;
    @Column(name = "last_price_id")
    private Long lastPriceId;
    @Column(name = "is_market_price")
    @JdbcTypeCode(SqlTypes.TINYINT)
    private Integer marketPrice;
    private String creator;
    @Column(name = "create_time")
    private LocalDateTime createTime;
    private String updater;
    @Column(name = "update_time")
    private LocalDateTime updateTime;
    private Boolean deleted;
    @Column(name = "tenant_id")
    private Long tenantId;
}
