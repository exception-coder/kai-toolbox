package com.exceptioncoder.toolbox.common.menuvisibility.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 某登录用户的菜单显隐偏好。
 * visibleIdsJson 是「可见模块 id 白名单」的 JSON 字符串数组，与前端 FeatureManifest.id 对应。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MenuVisibility {
    private long userId;
    private String visibleIdsJson;
    private long updatedAt;
}
