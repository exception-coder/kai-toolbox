package com.regentech_fashion.wyoooni.enterprise.infrastructure.persistence.jpa.binding;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 企业账号绑定持久化实体。 */
@Entity
@Table(name = "wy_account_binding")
public class AccountBindingEntity {
    @Id
    private String id;
    @Column(name = "account_id", nullable = false)
    private String accountId;
    @Column(nullable = false)
    private String username;
    @Column(name = "display_name", nullable = false)
    private String displayName;
    @Column(name = "business_party_id", nullable = false)
    private String businessPartyId;
    @Column(name = "business_party_name", nullable = false)
    private String businessPartyName;
    @Column(name = "source_system", nullable = false)
    private String sourceSystem;
    @Column(nullable = false)
    private boolean active;
    @Column(name = "create_time", nullable = false)
    private long createTime;
    @Column(name = "update_time", nullable = false)
    private long updateTime;

    protected AccountBindingEntity() {}

    AccountBindingEntity(String id, String accountId, String username, String displayName,
                         String businessPartyId, String businessPartyName, String sourceSystem, long now) {
        this.id = id;
        this.accountId = accountId;
        this.username = username;
        this.displayName = displayName;
        this.businessPartyId = businessPartyId;
        this.businessPartyName = businessPartyName;
        this.sourceSystem = sourceSystem;
        this.active = true;
        this.createTime = now;
        this.updateTime = now;
    }

    String id() { return id; }
    String accountId() { return accountId; }
    String username() { return username; }
    String displayName() { return displayName; }
    String businessPartyId() { return businessPartyId; }
    String businessPartyName() { return businessPartyName; }
    String sourceSystem() { return sourceSystem; }
}
