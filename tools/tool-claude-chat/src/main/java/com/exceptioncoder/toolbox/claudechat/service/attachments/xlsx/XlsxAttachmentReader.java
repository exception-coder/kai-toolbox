package com.exceptioncoder.toolbox.claudechat.service.attachments.xlsx;

import com.exceptioncoder.toolbox.common.attachment.SessionAttachmentReader.Request;
import com.exceptioncoder.toolbox.common.attachment.SessionAttachmentReader.WorkbookPage;
import com.exceptioncoder.toolbox.common.attachment.SessionAttachmentReader.SheetInfo;
import org.apache.poi.openxml4j.opc.OPCPackage;
import org.apache.poi.openxml4j.opc.PackageAccess;
import org.apache.poi.xssf.eventusermodel.XSSFReader;
import org.apache.poi.xssf.model.StylesTable;
import org.apache.poi.util.XMLHelper;
import org.xml.sax.Attributes;
import org.xml.sax.InputSource;
import org.xml.sax.helpers.DefaultHandler;

import java.io.InputStream;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Semaphore;

/** 当前会话文件已由附件拥有方验证；此处只作有界SAX读取，不求值公式或加载外部关系。 */
public final class XlsxAttachmentReader {
    private static final Semaphore PARSING_SLOTS = new Semaphore(2);
    private static final String FORMULA_POLICY = "仅返回公式表达式与文件保存的缓存值；缓存可能过期或缺失，"
            + "不执行公式、宏、外链或数据刷新。rows保留原始行号，缺失行/坐标为空，不代表零。";

    private XlsxAttachmentReader() { }

    /** sheet为空列目录，指定sheet使用startRow/maxRows，与文本字符offset相互排斥。 */
    public static WorkbookPage read(Path file, Request request) throws IOException {
        validate(request);
        if (!PARSING_SLOTS.tryAcquire()) {
            throw new IllegalArgumentException("Excel解析繁忙，请稍后重试同一附件");
        }
        try {
            var guard = new XlsxArchiveGuard();
            guard.verify(file);
            try (var archive = OPCPackage.open(file.toFile(), PackageAccess.READ)) {
                var reader = new XSSFReader(archive);
                reader.setUseReadOnlySharedStringsTable(true);
                var metadata = new Metadata();
                try (var workbook = reader.getWorkbookData()) {
                    parse(workbook, metadata);
                }
                guard.checkTime();
                return readSheet(file, request, reader, metadata, guard);
            }
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("无法解析XLSX：文件可能损坏、加密或触发压缩安全限制；"
                    + "请在Excel中另存为未加密.xlsx后重新上传，或导出CSV。这不是写入权限问题", exception);
        } finally {
            PARSING_SLOTS.release();
        }
    }

    private static void validate(Request request) {
        if (request.offset() != null || request.maxChars() != null) {
            throw new IllegalArgumentException("XLSX不用字符offset/maxChars；请用sheet、startRow和maxRows分页");
        }
        int row = request.startRow() == null ? 1 : request.startRow();
        int count = request.maxRows() == null ? 100 : request.maxRows();
        if (row < 1 || row > 50001 || count < 1 || count > 500) {
            throw new IllegalArgumentException("XLSX startRow为1至50001，maxRows为1至500");
        }
        if (request.sheet() != null && (request.sheet().isBlank() || request.sheet().length() > 31)) {
            throw new IllegalArgumentException("工作表名称须为1至31字符，请先列出工作表原名");
        }
        if (request.sheet() == null && (request.startRow() != null || request.maxRows() != null)) {
            throw new IllegalArgumentException("请先列出工作表，再指定sheet名称与行分页");
        }
    }

    private static WorkbookPage readSheet(Path file, Request request, XSSFReader reader,
                                         Metadata metadata, XlsxArchiveGuard guard) throws Exception {
        if (request.sheet() == null) {
            return result(file, metadata, null, null, null);
        }
        var iterator = (XSSFReader.SheetIterator) reader.getSheetsData();
        while (iterator.hasNext()) {
            try (var stream = iterator.next()) {
                if (request.sheet().equals(iterator.getSheetName())) {
                    int start = request.startRow() == null ? 1 : request.startRow();
                    int maxRows = request.maxRows() == null ? 100 : request.maxRows();
                    var formatter = new XlsxCellFormatter(styles(reader), reader.getSharedStringsTable(),
                            metadata.date1904);
                    var handler = new XlsxSheetHandler(start, maxRows, formatter, guard);
                    parse(stream, handler);
                    guard.checkTime();
                    return result(file, metadata, request.sheet(), start, handler);
                }
            }
        }
        throw new IllegalArgumentException("工作表不存在，请先不传sheet列出名称，再按原名选择");
    }

    /** 样式关系可指向非标准文件名，因此在实际关系流上再次限额，不能只相信ZIP条目名。 */
    private static StylesTable styles(XSSFReader reader) throws Exception {
        try (var input = reader.getStylesData()) {
            if (input == null) {
                return new StylesTable();
            }
            byte[] bytes = input.readNBytes(XlsxArchiveGuard.MAX_STYLES_BYTES + 1);
            if (bytes.length > XlsxArchiveGuard.MAX_STYLES_BYTES) {
                throw new IllegalArgumentException("XLSX样式超过1MiB，请移除冗余样式后重新上传");
            }
            return new StylesTable(new ByteArrayInputStream(bytes));
        }
    }

    private static WorkbookPage result(Path file, Metadata metadata, String sheet, Integer start,
                                       XlsxSheetHandler handler) throws IOException {
        return new WorkbookPage("workbook", file.getFileName().toString(), Files.size(file),
                List.copyOf(metadata.sheets), sheet, handler == null ? null : handler.totalRows(), start,
                handler == null ? null : handler.nextRow(), handler != null && handler.nextRow() == null,
                handler == null ? List.of() : handler.rows(), FORMULA_POLICY);
    }

    static void parse(InputStream stream, DefaultHandler handler) throws Exception {
        var parser = XMLHelper.newXMLReader();
        parser.setContentHandler(handler);
        parser.parse(new InputSource(stream));
    }

    /** 仅读取工作簿目录与日期纪元，不解析或请求外链。 */
    private static final class Metadata extends DefaultHandler {
        private final List<SheetInfo> sheets = new ArrayList<>();
        private boolean date1904;

        @Override
        public void startElement(String uri, String local, String qName, Attributes attributes) {
            if ("workbookPr".equals(local)) {
                String epoch = attributes.getValue("date1904");
                date1904 = "1".equals(epoch) || "true".equals(epoch);
            } else if ("sheet".equals(local)) {
                if (sheets.size() >= 100) {
                    throw new IllegalArgumentException("XLSX工作表超过100，请拆分后上传");
                }
                String state = attributes.getValue("state");
                String name = attributes.getValue("name");
                if (name == null || name.isBlank() || name.length() > 31) {
                    throw new IllegalArgumentException("XLSX工作表名称损坏，请重新另存为.xlsx");
                }
                sheets.add(new SheetInfo(name, state == null ? "visible" : state));
            }
        }
    }
}
