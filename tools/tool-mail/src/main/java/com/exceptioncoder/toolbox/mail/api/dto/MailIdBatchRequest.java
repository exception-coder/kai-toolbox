package com.exceptioncoder.toolbox.mail.api.dto;

import java.util.List;

/** 批量操作请求 body，例：{@code {"ids": ["a","b"]}}。 */
public record MailIdBatchRequest(List<String> ids) {}
