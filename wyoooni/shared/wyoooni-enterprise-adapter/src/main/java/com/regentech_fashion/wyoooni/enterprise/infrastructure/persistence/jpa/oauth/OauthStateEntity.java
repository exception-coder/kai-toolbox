package com.regentech_fashion.wyoooni.enterprise.infrastructure.persistence.jpa.oauth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** OAuth state 持久化实体。 */
@Entity
@Table(name = "wy_oauth_state")
public class OauthStateEntity {
    @Id
    private String id;
    @Column(name = "return_to", nullable = false)
    private String returnTo;
    @Column(name = "expires_at", nullable = false)
    private long expiresAt;
    @Column(name = "consumed_at")
    private Long consumedAt;
    @Column(name = "create_time", nullable = false)
    private long createTime;
    @Column(name = "update_time", nullable = false)
    private long updateTime;

    protected OauthStateEntity() {}

    OauthStateEntity(String id, String returnTo, long expiresAt, long now) {
        this.id = id;
        this.returnTo = returnTo;
        this.expiresAt = expiresAt;
        this.createTime = now;
        this.updateTime = now;
    }

    String returnTo() { return returnTo; }
}
