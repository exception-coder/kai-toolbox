package com.regentech_fashion.wyoooni.enterprise.infrastructure.persistence.jpa.oauth;

import com.regentech_fashion.wyoooni.enterprise.domain.identity.OauthStateStore;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/** 基于 JPA 实现一次性 OAuth state 存储。 */
public class JpaOauthStateStore implements OauthStateStore {
    private final OauthStateJpaRepository repository;

    public JpaOauthStateStore(OauthStateJpaRepository repository) {
        this.repository = repository;
    }

    @Override
    @Transactional
    public void save(String stateHash, String returnTo, long expiresAt, long now) {
        repository.save(new OauthStateEntity(stateHash, returnTo, expiresAt, now));
    }

    @Override
    @Transactional
    public Optional<String> consume(String stateHash, long now) {
        Optional<String> returnTo = repository.findConsumable(stateHash, now).map(OauthStateEntity::returnTo);
        if (returnTo.isEmpty()) {
            return Optional.empty();
        }
        return repository.consume(stateHash, now) == 1 ? returnTo : Optional.empty();
    }
}
