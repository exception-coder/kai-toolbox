package com.exceptioncoder.toolbox.common.attachment;

import java.io.IOException;
import java.util.List;

/** 附件存储拥有方按会话身份提供有界读取，不允许业务模块直接扫描存储目录。 */
public interface SessionAttachmentReader {
    /** @return 原附件的文本片段及继续读取位置；路径必须归属当前会话 */
    Page read(String sessionId, String path, long maxBytes, int offset, int maxChars) throws IOException;

    /** name为文件名，offset/nextOffset为字符位置，complete标记是否读到末尾。 */
    record Page(String name, long sizeBytes, int offset, int nextOffset, boolean complete, String text)
            implements Content { }

    /** 兼容旧文本实现；表格参数不得被默默当成字符分页。 */
    default Content readContent(String sessionId, long maxBytes, Request request) throws IOException {
        if (request.sheet() != null || request.startRow() != null || request.maxRows() != null) {
            throw new IllegalArgumentException("当前读取器不支持工作表，请使用文本分页参数");
        }
        return read(sessionId, request.path(), maxBytes, request.offset() == null ? 0 : request.offset(),
                request.maxChars() == null ? 12000 : request.maxChars());
    }

    /** 文本响应保持原字段；工作簿响应明确使用1起始行号，不复用字符offset。 */
    interface Content { }
    /** Controlled original image read for authorized consultation history continuation. */
    record ImagePage(String kind, String name, String mimeType, String data) implements Content { }

    /** path为当前会话附件；offset/maxChars用于文本，sheet/startRow/maxRows用于XLSX。 */
    record Request(String path, Integer offset, Integer maxChars, String sheet, Integer startRow,
                   Integer maxRows) { }

    /** 未选择sheet时仅列出工作表；totalRows是最大原始行号，含空行，nextRow为空表示末尾。 */
    record WorkbookPage(String kind, String name, long sizeBytes, List<SheetInfo> sheets, String sheet,
                        Integer totalRows, Integer startRow, Integer nextRow, boolean complete,
                        List<SheetRow> rows, String formulaPolicy) implements Content { }

    /** 工作表名称与hidden/veryHidden/visible状态。 */
    record SheetInfo(String name, String visibility) { }

    /** row为原始1起始行号；cells为稀疏坐标，不把缺失单元格左移。 */
    record SheetRow(int row, List<SheetCell> cells) { }

    /** raw为数值原文或解析后的文本，display为格式化文本，formula仅表达式，cachedType说明缓存类型。 */
    record SheetCell(String coordinate, String type, String raw, String display, String formula,
                     String cachedType) { }
}
