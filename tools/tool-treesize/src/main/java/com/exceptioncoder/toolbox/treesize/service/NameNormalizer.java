package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.treesize.config.NameGroupingProperties;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 文件名 → (signature, episode) 归一化器。纯字符串处理，无外部依赖，无状态。
 *
 * <p>核心思路：去掉一切"非内容"的噪音（字幕组/画质/编码/年份/分辨率/语言标签/扩展名），
 * 把 {@code .}/{@code _}/{@code -} 这类分隔符归一为空格，小写化，结果即"系列签名"。
 * 同签名视为同系列；集数单独抽出来供排序。
 *
 * <p>已知不能处理的场景：译名/原名混用（中日英同片）、极端歪命名（如 download_2024.mp4）。
 * 留给未来"视频嵌入与相似聚类"模块用语义聚类补全。
 *
 * <p>规则按经验顺序排，先抽集数（避免数字被一并删掉），再删噪音，最后归一化标点。
 */
@Component
public class NameNormalizer {

    // -------- 集数抽取（注意：要在 stripQualityTags / stripResolution 之前跑，
    //          否则 "S04E15" 里的 E15 集数会被 release group / quality 规则吃掉）---------

    /** 阿拉伯数字集数：E01 / EP01 / 第01话 / 第01集 / #01 / [01]。仅作"抽取"，不删原文。 */
    private static final Pattern EPISODE_NUM_RE = Pattern.compile(
            "(?i)(?:e|ep|第)\\s*(\\d{1,4})\\s*(?:话|集)?|#(\\d{1,4})|\\[(\\d{1,4})\\]");

    /** 中文数字集数：第十五集 / 第二十一话。 */
    private static final Pattern EPISODE_CN_RE = Pattern.compile("第([一二三四五六七八九十百千]+)[话集]");

    // -------- 去噪规则（按顺序应用）---------

    /** 字幕组/压制组标签：[VCB-Studio]、【喵萌】、(组名) 等。 */
    private static final Pattern BRACKET_TAGS_SQUARE = Pattern.compile("\\[[^\\]]*\\]");
    private static final Pattern BRACKET_TAGS_CN = Pattern.compile("【[^】]*】");

    /** 年份：(2024)、【2024】、独立成 token 的 2024。 */
    private static final Pattern YEAR_PAREN = Pattern.compile("[(（]\\s*(19|20)\\d{2}\\s*[)）]");
    private static final Pattern YEAR_CN_BRACKET = Pattern.compile("【\\s*(19|20)\\d{2}\\s*】");
    private static final Pattern YEAR_STANDALONE = Pattern.compile("(?<![0-9])(19|20)\\d{2}(?![0-9])");

    /** 画质 / 编码 / 容器 / 来源标签。\\b 单词边界让 4k 之类的尾标也能识别。 */
    private static final Pattern QUALITY_RE = Pattern.compile(
            "(?i)(\\b1080p\\b|\\b720p\\b|\\b480p\\b|\\b2160p\\b|\\b4k\\b|\\bhdr\\b|\\bsdr\\b" +
                    "|\\bbdrip\\b|\\bwebrip\\b|\\bweb-dl\\b|\\bbluray\\b|\\bbd\\b" +
                    "|\\bx264\\b|\\bx265\\b|\\bh\\.?264\\b|\\bh\\.?265\\b|\\bhevc\\b|\\bavc\\b" +
                    "|\\baac\\b|\\bflac\\b|\\bac3\\b|\\bdts\\b|\\b10bit\\b|\\bhi10p\\b" +
                    "|\\bremux\\b|\\brepack\\b|\\bproper\\b)");

    /** 分辨率数字 1920x1080 / 3840*2160。 */
    private static final Pattern RESOLUTION_RE = Pattern.compile("\\d{3,4}[xX*×]\\d{3,4}");

    /** 中文语言标记。 */
    private static final Pattern LANG_RE = Pattern.compile(
            "(中字|简中|繁中|双语|内嵌|外挂|英字|日字|中日双语|国语|粤语|英语|日语)");

    /** 末尾连字符 release group：'-XXXX'（2-12 个字符）。保守限制避免误删片名。 */
    private static final Pattern RELEASE_GROUP_SUFFIX = Pattern.compile("\\s*-\\s*[A-Za-z0-9]{2,12}\\s*$");

    /** 集数标记（删，因为已经抽到 episode 字段了；如果不删 signature 里就会有 E01 残留导致同系列不同集得到不同 signature）。 */
    private static final Pattern EPISODE_MARKER_DELETE = Pattern.compile(
            "(?i)(?:e|ep|第)\\s*\\d{1,4}\\s*(?:话|集)?|#\\d{1,4}|第[一二三四五六七八九十百千]+[话集]");

    /** 残留空括号。 */
    private static final Pattern EMPTY_BRACKETS = Pattern.compile("\\[\\s*\\]|\\(\\s*\\)|（\\s*）|【\\s*】");

    /** 多空格归一。 */
    private static final Pattern MULTI_SPACE = Pattern.compile("\\s+");

    private final NameGroupingProperties props;

    public NameNormalizer(NameGroupingProperties props) {
        this.props = props;
    }

    /** 入口：原始文件名（可含扩展名）→ 归一化签名 + 可选集数。 */
    public NormalizedName normalize(String filename) {
        if (filename == null) return new NormalizedName("", null);

        String s = stripExtension(filename);

        // 1. 集数先抽（在去噪前；否则 E01 / [01] 可能被 release-group / 残留空括号规则吃掉）
        Integer episode = extractEpisode(s);

        // 2. 去字幕组 / 压制组方括号
        s = BRACKET_TAGS_SQUARE.matcher(s).replaceAll(" ");
        s = BRACKET_TAGS_CN.matcher(s).replaceAll(" ");

        // 3. 去年份（先括号包裹的，再独立 token）
        s = YEAR_PAREN.matcher(s).replaceAll(" ");
        s = YEAR_CN_BRACKET.matcher(s).replaceAll(" ");
        s = YEAR_STANDALONE.matcher(s).replaceAll(" ");

        // 4. 去画质 / 编码
        s = QUALITY_RE.matcher(s).replaceAll(" ");

        // 5. 去分辨率
        s = RESOLUTION_RE.matcher(s).replaceAll(" ");

        // 6. 去语言标签
        s = LANG_RE.matcher(s).replaceAll(" ");

        // 7. 去集数标记
        s = EPISODE_MARKER_DELETE.matcher(s).replaceAll(" ");

        // 8. 用户额外规则（在内置规则之后跑，让用户能针对自家片库微调）
        for (String pattern : props.getExtraNoisePatterns()) {
            try {
                s = Pattern.compile(pattern, Pattern.CASE_INSENSITIVE).matcher(s).replaceAll(" ");
            } catch (Exception ignored) {
                // 用户写错正则不阻断主流程；本期不暴露错误反馈 UI
            }
        }

        // 9. 末尾 release group 后缀（注意要在标点归一前做，因为依赖 '-'）
        s = RELEASE_GROUP_SUFFIX.matcher(s).replaceAll(" ");

        // 10. 残留空括号
        s = EMPTY_BRACKETS.matcher(s).replaceAll(" ");

        // 11. 标点归一：. _ - → 空格
        s = s.replace('.', ' ').replace('_', ' ').replace('-', ' ');

        // 12. 空白合并 + trim
        s = MULTI_SPACE.matcher(s).replaceAll(" ").trim();

        // 13. 小写化（中文不受影响）
        s = s.toLowerCase(Locale.ROOT);

        // 14. fallback：归一化后空了（极端纯噪音文件名），回退到原文件名 lowercase 不归一
        if (s.isBlank()) {
            s = stripExtension(filename).toLowerCase(Locale.ROOT);
        }

        return new NormalizedName(s, episode);
    }

    public Integer extractEpisode(String s) {
        if (s == null) return null;
        Matcher m = EPISODE_NUM_RE.matcher(s);
        if (m.find()) {
            for (int i = 1; i <= 3; i++) {
                String g = m.group(i);
                if (g != null) {
                    try {
                        int n = Integer.parseInt(g);
                        return n > props.getChineseNumeralMax() ? null : n;
                    } catch (NumberFormatException ignored) {
                        // continue
                    }
                }
            }
        }
        Matcher m2 = EPISODE_CN_RE.matcher(s);
        if (m2.find()) {
            int n = chineseToArabic(m2.group(1));
            return n > props.getChineseNumeralMax() || n <= 0 ? null : n;
        }
        return null;
    }

    /** 去文件扩展名（最后一个 '.' 之后的部分），目录分隔符前的部分不动。 */
    private static String stripExtension(String name) {
        int dot = name.lastIndexOf('.');
        // 扩展名只保留 4 字符以内 + 字母数字（避免误把 "v1.0.5" 这类版本号也当扩展名）
        if (dot < 0 || dot == name.length() - 1) return name;
        String tail = name.substring(dot + 1);
        if (tail.length() > 5 || !tail.matches("[A-Za-z0-9]+")) return name;
        return name.substring(0, dot);
    }

    /** 中文数字串 → 阿拉伯数字。仅支持 0-9999 范围（与 props.chineseNumeralMax 一致）。 */
    public static int chineseToArabic(String cn) {
        if (cn == null || cn.isEmpty()) return 0;
        int[] units = new int[]{1, 10, 100, 1000};
        String unitChars = "零十百千";
        String digitChars = "零一二三四五六七八九";

        int total = 0;
        int section = 0;   // 当前累积值（当前数位 × 当前 unit）
        int lastDigit = 0; // 最近一个非单位数字
        for (char c : cn.toCharArray()) {
            int digit = digitChars.indexOf(c);
            if (digit >= 0) {
                lastDigit = digit;
                continue;
            }
            int unitIdx = unitChars.indexOf(c);
            if (unitIdx > 0) {
                int unit = units[unitIdx];
                // 中文习惯："十" 单独出现等价于 "一十"
                if (lastDigit == 0 && unit == 10) lastDigit = 1;
                section += lastDigit * unit;
                lastDigit = 0;
            }
        }
        total = section + lastDigit;
        return total;
    }

    /** 归一化结果。signature 一定非空（fallback 至 lowercase 原文件名）；episode 可空。 */
    public record NormalizedName(String signature, Integer episode) {}
}
