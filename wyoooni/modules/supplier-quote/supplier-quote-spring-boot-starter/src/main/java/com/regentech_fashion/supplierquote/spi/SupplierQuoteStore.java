package com.regentech_fashion.supplierquote.spi;

import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.BindingView;

import java.util.Optional;

/**
 * 微信报价身份存储端口，由具体宿主提供数据库实现。
 */
public interface SupplierQuoteStore {
    /** 保存一次性 OAuth state。 */
    void saveOauthState(String stateHash, String returnTo, long expiresAt, long now);

    /** 消费仍有效且未使用的 OAuth state。 */
    Optional<String> consumeOauthState(String stateHash, long now);

    /** 保存 H5 会话摘要。 */
    void saveSession(String tokenHash, String subjectHash, long expiresAt, long now);

    /** 查询仍有效的 H5 会话。 */
    Optional<WechatSessionRecord> findSession(String tokenHash, long now);

    /** 按微信身份摘要查询公司业务账号绑定。 */
    Optional<BindingView> findBindingBySubject(String subjectHash);

    /** 按公司业务账号查询已有绑定。 */
    Optional<BindingSubjectRecord> findBindingByAccount(String accountId, String sourceSystem);

    /** 新增微信与公司业务账号绑定。 */
    BindingView insertBinding(String subjectHash, BindingView binding, long now);

    /** 有效微信会话记录。 */
    record WechatSessionRecord(String subjectHash, long expiresAt) {}

    /** 公司业务账号绑定主体记录。 */
    record BindingSubjectRecord(String subjectHash, String accountId, String sourceSystem) {}
}
