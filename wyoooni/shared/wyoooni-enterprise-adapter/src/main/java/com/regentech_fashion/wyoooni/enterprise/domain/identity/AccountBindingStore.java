package com.regentech_fashion.wyoooni.enterprise.domain.identity;

import java.util.Optional;

/** 微信主体与公司业务账号绑定存储端口。 */
public interface AccountBindingStore {
    /** 按微信主体摘要查询公司业务账号绑定。 */
    Optional<EnterpriseAccountBinding> findBySubject(String subjectHash);

    /** 按来源系统和账号标识查询绑定主体。 */
    Optional<BindingOwner> findByAccount(String accountId, String sourceSystem);

    /** 新增微信主体与公司业务账号绑定。 */
    EnterpriseAccountBinding insert(String subjectHash, EnterpriseAccountBinding binding, long now);

    /** 公司业务账号已有绑定主体。 */
    record BindingOwner(String subjectHash, String accountId, String sourceSystem) {}
}
