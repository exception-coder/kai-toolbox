package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 附件上传句柄。{@code path} 是服务端绝对路径，供 send 引用让 Claude 用 Read 读取；
 * 前端只透传，不展示给用户。
 */
public record AttachmentView(String id, String name, String mime, long size, String path) {}
