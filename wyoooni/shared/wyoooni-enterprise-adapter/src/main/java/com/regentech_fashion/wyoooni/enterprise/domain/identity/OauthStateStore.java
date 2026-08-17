package com.regentech_fashion.wyoooni.enterprise.domain.identity;

import java.util.Optional;

/** 微信 OAuth 一次性 state 存储端口。 */
public interface OauthStateStore {
    /** 保存一次性 OAuth state。 */
    void save(String stateHash, String returnTo, long expiresAt, long now);

    /** 消费仍有效且未使用的 OAuth state。 */
    Optional<String> consume(String stateHash, long now);
}
