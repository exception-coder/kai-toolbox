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
        String s = toHalfWidth(raw).replaceAll("\\s+", "");

        // 城市：直辖市直接取；否则在「省/自治区」前缀之后锚定取「XX市」，防止省尾被并进城市名。
        String city = "";
        String rest = s;
        for (String muni : new String[]{"北京", "上海", "天津", "重庆"}) {
            int idx = s.indexOf(muni);
            if (idx >= 0) {
                city = muni;
                rest = s.substring(idx + muni.length()).replaceFirst("^市", "");
                break;
            }
        }
        if (city.isEmpty()) {
            Matcher cm = Pattern.compile(
                    "(?:[\\u4e00-\\u9fa5]{2,7}?(?:省|自治区|特别行政区))?([\\u4e00-\\u9fa5]{2,4}?)市").matcher(s);
            if (cm.find()) {
                city = cm.group(1);
                rest = s.substring(cm.end());
            }
        }

        // 区/县：仅在城市之后的剩余串里取，避免跨「市/省」误截。
        String district = "";
        Matcher dm = Pattern.compile(
                "([\\u4e00-\\u9fa5]{2,4}?)(新区|高新区|经济技术开发区|经济开发区|经济区|开发区|区|县|旗)")
                .matcher(rest.isEmpty() ? s : rest);
        if (dm.find()) district = dm.group(1);

        String norm = city + district;
        // 兜底：解析不出城市/区时，去省前缀后取前 8 字。
        if (norm.isBlank()) {
            norm = s.replaceFirst("^[\\u4e00-\\u9fa5]{2,4}省", "");
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
