package com.exceptioncoder.toolbox.common.forge.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 权限码领域对象。由代码声明为权威源，启动时同步进库；后台只读。
 * code 形如 {@code <module>:<type>:<action>}，如 forge:role:menu、tool-downloader:btn:delete。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Permission {
    private Long id;
    private String code;
    private String name;
    private PermissionType type;
    private String module;
    private String parentCode;
    private int sort;
    private PermissionStatus status;
    private long createdAt;
    private long updatedAt;
}
