package com.exceptioncoder.toolbox.procurement.domain;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Set;
import java.util.regex.Pattern;
import static com.exceptioncoder.toolbox.procurement.domain.ProcurementStructure.*;

/** 仅转换明确表达的单位与日期，不汇总、不推测币种或缺失年月。 */
public final class ProcurementValueTypes {
    private static final Set<String> MONEY = Set.of("procurement_amount", "total_investment");
    public static final Pattern AMOUNT = Pattern.compile("(?<![0-9.,])(?:人民币)?\\s*([0-9]+(?:,[0-9]{3})*(?:\\.[0-9]+)?)\\s*(亿元|万元|元)(?:\\h*人民币)?");
    private static final Pattern DATE = Pattern.compile("(\\d{4})[-/年](\\d{1,2})[-/月](\\d{1,2})日?");
    public static final Pattern LABELED_AMOUNT = Pattern.compile("(?:预算金额|最高限价|中标金额|成交金额|合同金额)\\h*[（(](亿元|万元|元)[）)]\\h*[：:]\\s*([0-9]+(?:,[0-9]{3})*(?:\\.[0-9]+)?)(?![0-9.,])");

    private ProcurementValueTypes() { }

    public static String normalize(Field field, String value, boolean modelValue) {
        if (value == null || value.length() > 4000) { throw new IllegalArgumentException("字段值为空或超过 4000 字符"); }
        if (value.isBlank()) { return ""; }
        try {
            if ("DECIMAL".equals(field.type())) {
                BigDecimal number;
                if (modelValue && MONEY.contains(field.key())) {
                    var labeled = LABELED_AMOUNT.matcher(value.strip());
                    String amount = labeled.matches() ? labeled.group(2) + labeled.group(1) : value.strip();
                    var match = AMOUNT.matcher(amount);
                    if (!match.matches()) { throw new IllegalArgumentException("金额必须包含明确的元、万元或亿元单位"); }
                    number = new BigDecimal(match.group(1).replace(",", ""));
                    number = switch (match.group(2)) {
                        case "元" -> number.movePointLeft(4);
                        case "亿元" -> number.movePointRight(4);
                        default -> number;
                    };
                } else {
                    if (!value.matches("-?\\d{1,20}(?:\\.\\d{1,10})?")) { throw new IllegalArgumentException("请输入数字，不含单位或千位分隔符"); }
                    number = new BigDecimal(value);
                }
                if (number.precision() > 30 || number.scale() > 14 || (MONEY.contains(field.key()) && number.signum() < 0)) {
                    throw new IllegalArgumentException("金额或数字超出范围");
                }
                return number.stripTrailingZeros().toPlainString();
            }
            if ("DATE".equals(field.type())) {
                var date = DATE.matcher(value.strip());
                if (!date.matches()) { throw new IllegalArgumentException("请输入完整日期，例如 2026-09-05"); }
                return LocalDate.of(Integer.parseInt(date.group(1)), Integer.parseInt(date.group(2)),
                        Integer.parseInt(date.group(3))).toString();
            }
            return value;
        } catch (java.time.DateTimeException | NumberFormatException e) {
            throw new IllegalArgumentException("字段类型不匹配：" + field.label(), e);
        }
    }
}
