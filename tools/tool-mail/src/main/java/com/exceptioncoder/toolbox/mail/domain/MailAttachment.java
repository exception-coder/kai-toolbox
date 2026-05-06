package com.exceptioncoder.toolbox.mail.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 邮件附件元数据，仅记录名称/类型/大小，不落盘文件内容。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MailAttachment {

    /** 文件名。 */
    private String filename;

    /** MIME 类型，如 {@code application/pdf}。 */
    private String mimeType;

    /** 附件大小（字节），{@code -1} 表示未知。 */
    private long size;
}
