package com.regentech_fashion.wyoooni.enterprise.infrastructure.persistence.jpa.session;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

/** 微信 H5 会话的 Spring Data 仓储。 */
public interface WechatSessionJpaRepository extends JpaRepository<WechatSessionEntity, String> {
    @Query("select session from WechatSessionEntity session where session.id = :id and session.expiresAt >= :now")
    Optional<WechatSessionEntity> findValid(@Param("id") String id, @Param("now") long now);

    @Modifying(clearAutomatically = true)
    @Query("update WechatSessionEntity session set session.lastSeenAt = :now, session.updateTime = :now "
            + "where session.id = :id")
    int touch(@Param("id") String id, @Param("now") long now);
}
