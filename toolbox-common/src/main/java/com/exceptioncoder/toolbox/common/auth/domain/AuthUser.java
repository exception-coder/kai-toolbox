package com.exceptioncoder.toolbox.common.auth.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 鉴权用户领域对象。roles 在库中以逗号分隔存储，仓储层负责与 List 互转。
 * passwordHash 永远是 BCrypt 哈希，不持有明文。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuthUser {
    private Long id;
    private String username;
    private String passwordHash;
    private List<String> roles;
    private boolean enabled;
    private long createdAt;
    private long updatedAt;
}
