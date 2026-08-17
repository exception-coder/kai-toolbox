package com.regentech_fashion.supplierquote.infrastructure.srm.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

/** H5 只读展示的纱线质量标准。 */
@Entity
@Table(name = "srm_yarn_rating_standards")
@Getter
@Setter
public class YarnQualityStandardEntity {
    @Id
    private Long id;
    private Long twist;
    @Column(name = "twistCV")
    private BigDecimal twistCV;
    @Column(name = "strongCn")
    private Long strongCn;
    @Column(name = "strongCV")
    private BigDecimal strongCV;
    private BigDecimal evennessmust;
    private Long culars;
    private Long slub;
    private Long nepsmust;
    private BigDecimal hairiness;
    private Long heterocele;
    private Boolean deleted;
}
