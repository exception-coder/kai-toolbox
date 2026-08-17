package com.regentech_fashion.wyoooni.enterprise.domain.identity;

import java.util.Optional;

/** 微信 H5 会话存储端口。 */
public interface WechatSessionStore {
    /** 保存微信 H5 会话摘要。 */
    void save(String tokenHash, String subjectHash, long expiresAt, long now);

    /** 查询仍有效的微信 H5 会话。 */
    Optional<WechatSession> find(String tokenHash, long now);

    /** 有效微信会话摘要。 */
    record WechatSession(String subjectHash, long expiresAt) {}
}
