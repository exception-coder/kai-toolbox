package com.exceptioncoder.toolbox.mail.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/** 收到的邮件归档实体，对应 {@code mail_inbox} 表。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MailInbox {

    /** 邮件唯一 ID（UUID）。 */
    private String id;

    /** SMTP Message-ID header，可能为 null。 */
    private String messageId;

    /** 信封发件人地址。 */
    private String fromAddr;

    /** 收件人地址（RCPT TO），多收件人时每人一行。 */
    private String toAddr;

    /** 邮件主题，可能为 null。 */
    private String subject;

    /** 纯文本正文，超过 2MB 时截断。 */
    private String bodyText;

    /** HTML 正文，超过 2MB 时截断。 */
    private String bodyHtml;

    /** 附件元数据列表，不含文件内容。 */
    private List<MailAttachment> attachments;

    /** 接收时间（epoch 毫秒）。 */
    private long receivedAt;

    /** 是否已读。注意不加 is 前缀，避免序列化歧义。 */
    private boolean read;

    /** 原始邮件字节大小，{@code null} 表示未知。 */
    private Long rawSize;
}
