package com.regentech_fashion.wyoooni.enterprise.infrastructure.persistence.jpa.session;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 微信 H5 会话持久化实体。 */
@Entity
@Table(name = "wy_wechat_session")
public class WechatSessionEntity {
    @Id
    private String id;
    @Column(name = "subject_hash", nullable = false)
    private String subjectHash;
    @Column(name = "expires_at", nullable = false)
    private long expiresAt;
    @Column(name = "last_seen_at", nullable = false)
    private long lastSeenAt;
    @Column(name = "create_time", nullable = false)
    private long createTime;
    @Column(name = "update_time", nullable = false)
    private long updateTime;

    protected WechatSessionEntity() {}

    WechatSessionEntity(String id, String subjectHash, long expiresAt, long now) {
        this.id = id;
        this.subjectHash = subjectHash;
        this.expiresAt = expiresAt;
        this.lastSeenAt = now;
        this.createTime = now;
        this.updateTime = now;
    }

    String subjectHash() { return subjectHash; }
    long expiresAt() { return expiresAt; }
}
