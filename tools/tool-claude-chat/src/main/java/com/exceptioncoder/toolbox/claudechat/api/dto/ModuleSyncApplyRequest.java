package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.List;

/**
 * 「更新项目模块」应用请求：把 owner 在预览里勾选的新增候选追加进 modules.json（只新增、不删除）。
 *
 * @param path    项目绝对路径（须在配置工作区根内）
 * @param modules 要追加的模块（来自预览 added，owner 已剔除非业务目录）
 */
public record ModuleSyncApplyRequest(String path, List<Ref> modules) {

    public record Ref(String key, String codePath) {
    }
}
