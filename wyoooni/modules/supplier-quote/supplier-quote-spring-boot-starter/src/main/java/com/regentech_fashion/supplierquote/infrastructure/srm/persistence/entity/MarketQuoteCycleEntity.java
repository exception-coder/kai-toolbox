package com.regentech_fashion.supplierquote.infrastructure.srm.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 供应商产品当前报价快照。 */
@Entity
@Table(name = "srm_sup_update_product_cycle")
@Getter
@Setter
public class MarketQuoteCycleEntity {
    @Id
    private Long id;
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
    @Column(name = "tenant_id")
    private Long tenantId;
    @Column(name = "price_id")
    private Long priceId;
    private BigDecimal price;
    @Column(name = "price_is_tax")
    private Integer priceIsTax;
    @Column(name = "price_status")
    private Integer priceStatus;
    @Column(name = "refresh_time")
    private LocalDateTime refreshTime;
    @Column(name = "price_update_time")
    private LocalDateTime priceUpdateTime;
    @Column(name = "update_time")
    private LocalDateTime updateTime;
    private Boolean deleted;
}
