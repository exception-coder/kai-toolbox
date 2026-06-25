package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 拉取（git clone）新项目到工作区请求。
 *
 * @param url  git 远端地址（http(s) / git@ / ssh）
 * @param root 目标工作区根（须为配置的 workspace 根之一；与新建会话的工作区一致）
 */
public record CloneRequest(String url, String root) {
}
