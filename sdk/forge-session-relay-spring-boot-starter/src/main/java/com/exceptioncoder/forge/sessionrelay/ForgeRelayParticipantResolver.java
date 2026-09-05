package com.exceptioncoder.forge.sessionrelay;

import org.springframework.http.HttpHeaders;

import java.security.Principal;

/** 从宿主认证身份取得绑定键，禁止信任浏览器自报用户 ID。 */
@FunctionalInterface
public interface ForgeRelayParticipantResolver {

    /** 默认返回 Forge 用户 ID；邀请绑定模式返回隔离的本地正整数键。无法认证时抛出异常。 */
    long resolve(Principal principal, HttpHeaders headers);
}
