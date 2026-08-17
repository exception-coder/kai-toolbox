package com.regentech_fashion.wyoooni.enterprise.domain.identity;

/**
 * 公司统一业务账号，不限定账号来源系统或具体业务模块。
 *
 * @param accountId 来源系统内账号标识
 * @param username 登录账号
 * @param displayName 账号显示名
 * @param businessPartyId 公司业务伙伴标识
 * @param businessPartyName 公司业务伙伴名称
 * @param sourceSystem 来源系统代码
 */
public record EnterpriseAccount(String accountId, String username, String displayName,
                                String businessPartyId, String businessPartyName, String sourceSystem) {}
