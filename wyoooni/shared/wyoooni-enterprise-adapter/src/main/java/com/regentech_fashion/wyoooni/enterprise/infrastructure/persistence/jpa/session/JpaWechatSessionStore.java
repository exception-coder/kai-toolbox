package com.regentech_fashion.wyoooni.enterprise.infrastructure.persistence.jpa.session;

import com.regentech_fashion.wyoooni.enterprise.domain.identity.WechatSessionStore;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/** 基于 JPA 实现微信 H5 会话存储。 */
public class JpaWechatSessionStore implements WechatSessionStore {
    private final WechatSessionJpaRepository repository;

    public JpaWechatSessionStore(WechatSessionJpaRepository repository) {
        this.repository = repository;
    }

    @Override
    @Transactional
    public void save(String tokenHash, String subjectHash, long expiresAt, long now) {
        repository.save(new WechatSessionEntity(tokenHash, subjectHash, expiresAt, now));
    }

    @Override
    @Transactional
    public Optional<WechatSession> find(String tokenHash, long now) {
        Optional<WechatSession> result = repository.findValid(tokenHash, now)
                .map(entity -> new WechatSession(entity.subjectHash(), entity.expiresAt()));
        result.ifPresent(ignored -> repository.touch(tokenHash, now));
        return result;
    }
}
