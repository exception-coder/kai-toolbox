package com.exceptioncoder.toolbox.visitoranalysis.service;

import org.springframework.stereotype.Component;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 确定性归一化（纯代码，无 LLM）。手机号、公司名、公司地址的归一化结果是匹配键，
 * 必须在 Java、Python、导入脚本之间保持一致——所以集中在这里，避免多处实现漂移。
 */
@Component
public class Normalizer {

    private static final Pattern NON_DIGIT = Pattern.compile("\\D");
    /** 公司名里对匹配无意义、需剥离的后缀/修饰词。 */
    private static final String[] COMPANY_NOISE = {
            "股份有限公司", "有限责任公司", "有限公司", "(中国)", "（中国）",
            "集团", "公司", "企业", "厂", "店"
    };

    /**
     * 地址提取"城市+区"作为归一化匹配键（不用全地址，精度够用且噪声最小）。
     *
     * <p>策略：
     * <ol>
     *   <li>直辖市（北京/上海/天津/重庆）直接提取，无需"XX市"前缀</li>
     *   <li>普通城市：提取"XX市"中的 XX</li>
     *   <li>区/县：提取"XX区"/"XX县"/"XX新区"中的 XX</li>
     *   <li>两者拼接，如"广州天河"、"深圳南山"</li>
     *   <li>实在解析不出来：取原始字符串前 8 个字符兜底</li>
     * </ol>
     * 有意忽略街道/楼号——地址软匹配只需城市+区粒度，更细反而增加误判。
     */
    public String addr(String raw) {
        if (raw == null || raw.isBlank()) return "";
        String s = toHalfWidth(raw).replaceAll("\\s+", "").trim();

        StringBuilder result = new StringBuilder();

        // 1. 直辖市判断
        for (String muni : new String[]{"北京", "上海", "天津", "重庆"}) {
            if (s.contains(muni)) {
                result.append(muni);
                break;
            }
        }

        // 2. 普通城市：提取"XX市"中的城市名（2-4字）
        if (result.isEmpty()) {
            Matcher cm = Pattern.compile("([\\u4e00-\\u9fa5]{2,4})市").matcher(s);
            if (cm.find()) result.append(cm.group(1));
        }

        // 3. 提取区/县（包括"XX新区"/"XX高新区"/"XX开发区"/"XX区"/"XX县"等常见形式）
        Matcher dm = Pattern.compile("([\\u4e00-\\u9fa5]{2,6}?)(新区|高新区|经济区|开发区|区|县)").matcher(s);
        if (dm.find()) result.append(dm.group(1));

        String norm = result.toString();
        // 兜底：取原始字符串前 8 个字符（去掉省级以上前缀）
        if (norm.isBlank()) {
            norm = s.replaceAll("^[\\u4e00-\\u9fa5]{2,4}省", "");
            norm = norm.length() > 8 ? norm.substring(0, 8) : norm;
        }
        return norm;
    }

    /**
     * 手机号归一化：去掉所有非数字，再剥离 +86 / 86 国家码前缀。
     * 返回空串表示无有效号码（不参与匹配）。
     */
    public String phone(String raw) {
        if (raw == null) return "";
        String digits = NON_DIGIT.matcher(raw).replaceAll("");
        if (digits.startsWith("86") && digits.length() > 11) {
            digits = digits.substring(2);
        }
        return digits;
    }

    /**
     * 公司名归一化：全角转半角、去空白、繁简暂不处理（留待 sidecar/未来增强），
     * 剥离常见后缀。结果用于 company_norm 匹配键。
     */
    public String company(String raw) {
        if (raw == null) return "";
        String s = toHalfWidth(raw).replaceAll("\\s+", "").trim();
        for (String noise : COMPANY_NOISE) {
            s = s.replace(noise, "");
        }
        return s;
    }

    private static String toHalfWidth(String input) {
        char[] cs = input.toCharArray();
        for (int i = 0; i < cs.length; i++) {
            if (cs[i] == 12288) {
                cs[i] = ' ';
            } else if (cs[i] > 65280 && cs[i] < 65375) {
                cs[i] = (char) (cs[i] - 65248);
            }
        }
        return new String(cs);
    }
}
