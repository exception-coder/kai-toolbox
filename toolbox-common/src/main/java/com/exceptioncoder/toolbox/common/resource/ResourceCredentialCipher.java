package com.exceptioncoder.toolbox.common.resource;

/** 资源仓储使用的凭据封装端口；实现和密钥管理由现有资源能力提供。 */
public interface ResourceCredentialCipher {
    String encrypt(String value);
    String decrypt(String value);
}
