package com.exceptioncoder.toolbox.common.auth.service;

import java.util.List;

/**
 * 一次签发时解析出的用户授权快照。作为 auth 与授权体系（Forge）之间的解耦契约：
 * auth 只知道「roles + permissionCodes + 是否超管」这三件事，不关心它们从哪张表算出来。
 *
 * @param roles           角色 code 集合，写入 JWT roles claim
 * @param permissionCodes 权限码集合，写入 JWT perms claim（登录快照，重登/刷新才更新）
 * @param superAdmin      是否超级管理员（bypass 全部权限码校验），供登录响应下发
 */
public record AuthAuthorities(
        List<String> roles,
        List<String> permissionCodes,
        boolean superAdmin
) {
}
