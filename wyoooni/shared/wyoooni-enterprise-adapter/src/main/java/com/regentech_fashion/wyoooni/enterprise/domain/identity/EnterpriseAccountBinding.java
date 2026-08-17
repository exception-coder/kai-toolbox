package com.regentech_fashion.wyoooni.enterprise.domain.identity;

/**
 * 微信主体与公司业务账号的通用绑定摘要。
 *
 * @param accountId 来源系统内账号标识
 * @param username 登录账号
 * @param displayName 账号显示名
 * @param businessPartyId 公司业务伙伴标识
 * @param businessPartyName 公司业务伙伴名称
 * @param sourceSystem 来源系统代码
 */
public record EnterpriseAccountBinding(String accountId, String username, String displayName,
                                       String businessPartyId, String businessPartyName, String sourceSystem) {}
