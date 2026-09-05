package com.exceptioncoder.forge.sessionrelay;

import org.springframework.http.HttpHeaders;

import java.security.Principal;

/** 由宿主把自己的认证身份映射为 Forge 用户，禁止信任浏览器自报用户 ID。 */
@FunctionalInterface
public interface ForgeRelayParticipantResolver {

    /** 返回当前宿主身份对应的 Forge 数字用户 ID；无法认证时应抛出异常。 */
    long resolve(Principal principal, HttpHeaders headers);
}
