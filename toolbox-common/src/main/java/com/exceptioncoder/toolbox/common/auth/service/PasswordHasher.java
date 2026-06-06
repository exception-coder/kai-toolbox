package com.exceptioncoder.toolbox.common.auth.service;

import org.mindrot.jbcrypt.BCrypt;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * 密码哈希封装，基于 jbcrypt（纯静态、零 Spring 依赖）。统一 cost factor，便于后续调强度。
 */
@Component
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class PasswordHasher {

    private static final int COST = 12;

    public String hash(String raw) {
        return BCrypt.hashpw(raw, BCrypt.gensalt(COST));
    }

    /**
     * 比对明文与哈希。哈希格式非法（如历史脏数据）时 jbcrypt 会抛异常，这里吞掉并按校验失败处理，
     * 避免把内部异常冒泡成 500。
     */
    public boolean verify(String raw, String hash) {
        try {
            return BCrypt.checkpw(raw, hash);
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
