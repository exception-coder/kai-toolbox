package com.exceptioncoder.toolbox.mail.api.dto;

/** 批量操作结果，{@code affected} 为实际命中的行数（不存在的 id 不计）。 */
public record MailBatchResultView(int affected) {}
