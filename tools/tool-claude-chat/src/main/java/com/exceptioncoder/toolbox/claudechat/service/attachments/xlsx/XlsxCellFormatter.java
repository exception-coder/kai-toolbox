package com.exceptioncoder.toolbox.claudechat.service.attachments.xlsx;

import com.exceptioncoder.toolbox.common.attachment.SessionAttachmentReader.SheetCell;
import org.apache.poi.ss.usermodel.BuiltinFormats;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.xssf.model.SharedStrings;
import org.apache.poi.xssf.model.StylesTable;
import java.util.Locale;

/** 保留原值和文本标识符，数字样式仅产生display；公式从不求值。 */
final class XlsxCellFormatter {
    private final StylesTable styles;
    private final SharedStrings strings;
    private final boolean date1904;
    private final DataFormatter formatter = new DataFormatter(Locale.ROOT);

    XlsxCellFormatter(StylesTable styles, SharedStrings strings, boolean date1904) {
        this.styles = styles;
        this.strings = strings;
        this.date1904 = date1904;
    }

    SheetCell format(CellInput input) {
        String type = input.type() == null ? "n" : input.type();
        String raw = input.raw();
        String display = raw;
        if ("s".equals(type) && !raw.isEmpty()) {
            display = strings.getItemAt(Integer.parseInt(raw)).getString();
            raw = display;
        } else if ("b".equals(type) && !raw.isEmpty()) {
            display = "1".equals(raw) ? "TRUE" : "FALSE";
        } else if ("n".equals(type) && !raw.isEmpty()) {
            int formatId = 0;
            String format = "General";
            if (input.style() != null) {
                var style = styles.getStyleAt(Integer.parseInt(input.style()));
                formatId = Short.toUnsignedInt(style.getDataFormat());
                format = style.getDataFormatString();
                if (format == null) {
                    format = BuiltinFormats.getBuiltinFormat(formatId);
                }
            }
            display = formatter.formatRawCellContents(Double.parseDouble(raw), formatId, format, date1904);
        }
        return new SheetCell(input.coordinate(), input.formula() == null ? type : "formula", raw, display,
                input.formula(), input.formula() == null ? null : (raw.isEmpty() ? "missing" : type));
    }

    /** 单元格XML字段，formula为空与空的共享公式表达式有意区分。 */
    record CellInput(String coordinate, String type, String style, String raw, String formula) { }
}
