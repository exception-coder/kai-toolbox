package com.exceptioncoder.toolbox.visitoranalysis.service;

import org.springframework.stereotype.Component;

import java.util.regex.Pattern;

/**
 * 确定性归一化（纯代码，无 LLM）。手机号与公司名的归一化结果是匹配的唯一键，
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
