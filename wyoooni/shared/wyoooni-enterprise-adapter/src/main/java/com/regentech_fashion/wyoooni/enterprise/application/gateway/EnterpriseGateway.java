package com.regentech_fashion.wyoooni.enterprise.application.gateway;

import com.regentech_fashion.wyoooni.enterprise.domain.identity.EnterpriseAccount;

import java.util.Optional;

/** 公司统一业务网关的应用层端口。 */
public interface EnterpriseGateway {
    /**
     * 校验公司业务账号。
     *
     * @param username 登录账号
     * @param password 登录密码
     * @return 校验成功的业务账号；凭据无效时为空
     */
    Optional<EnterpriseAccount> verifyAccount(String username, String password);

    /**
     * 调用带公司业务主体上下文的网关接口。
     *
     * @param method HTTP 方法
     * @param path 业务接口路径
     * @param body 请求体
     * @param context 业务主体上下文
     * @param idempotencyKey 幂等键
     * @param responseType 响应类型
     * @return 反序列化后的响应
     * @param <T> 响应类型
     */
    <T> T exchange(String method, String path, Object body, EnterpriseRequestContext context,
                   String idempotencyKey, Class<T> responseType);
}
