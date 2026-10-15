package com.exceptioncoder.toolbox.common.attachment;

import java.io.IOException;

/** 附件存储拥有方按会话身份提供有界文本读取，不允许业务模块直接扫描存储目录。 */
public interface SessionAttachmentReader {
    /** @return 原附件的文本片段及继续读取位置；路径必须归属当前会话 */
    Page read(String sessionId, String path, long maxBytes, int offset, int maxChars) throws IOException;

    /** name为文件名，offset/nextOffset为字符位置，complete标记是否读到末尾。 */
    record Page(String name, long sizeBytes, int offset, int nextOffset, boolean complete, String text) { }
}
