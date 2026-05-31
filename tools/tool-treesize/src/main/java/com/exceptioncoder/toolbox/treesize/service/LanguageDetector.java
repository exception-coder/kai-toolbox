package com.exceptioncoder.toolbox.treesize.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * 从字幕文本里反推 ISO 639-1 语种码。仅作为 whisper 没识别出来时的兜底,
 * 不追求和 cld3 / Tika 这种统计模型对齐的精度——能把 ja/ko/zh/ru/ar/th/hi/拉丁系
 * 这几类大头区分开就够 DeepLXTranslator 跑通了。
 *
 * <p>策略:
 * <ol>
 *   <li>剥掉 WEBVTT header / 时间轴行 / NOTE / inline tag,只留台词文本</li>
 *   <li>按 Unicode 块统计字符,先判非拉丁脚本(各脚本之间正交,阈值简单粗暴够用)</li>
 *   <li>剩下都是拉丁字符时,用常见 stopword 频次区分 en/fr/de/es/it/pt;无明显信号 fallback "en"</li>
 * </ol>
 */
public final class LanguageDetector {

    private LanguageDetector() {}

    /** 直接读 VTT 文件并识别。读不到文件返回 null。 */
    public static String detectFromVtt(Path vttFile) {
        if (vttFile == null) return null;
        try {
            return detect(Files.readString(vttFile, StandardCharsets.UTF_8));
        } catch (IOException e) {
            return null;
        }
    }

    /**
     * 从任意 VTT/SRT/纯文本字符串识别语种。
     * @return ISO 639-1 小写码(如 "ja"/"ko"/"zh"/"en"),识别不出来返回 null
     */
    public static String detect(String text) {
        if (text == null) return null;
        String stripped = stripVttArtifacts(text);
        if (stripped.length() < 10) return null;

        int hiraganaKatakana = 0, hangul = 0, han = 0;
        int cyrillic = 0, arabic = 0, thai = 0, devanagari = 0, hebrew = 0;
        int latin = 0, total = 0;

        for (int i = 0; i < stripped.length(); ) {
            int cp = stripped.codePointAt(i);
            i += Character.charCount(cp);
            if (cp <= 0x20) continue;
            Character.UnicodeBlock blk = Character.UnicodeBlock.of(cp);
            if (blk == null) continue;
            total++;
            if (blk == Character.UnicodeBlock.HIRAGANA
                    || blk == Character.UnicodeBlock.KATAKANA
                    || blk == Character.UnicodeBlock.KATAKANA_PHONETIC_EXTENSIONS) {
                hiraganaKatakana++;
            } else if (blk == Character.UnicodeBlock.HANGUL_SYLLABLES
                    || blk == Character.UnicodeBlock.HANGUL_JAMO
                    || blk == Character.UnicodeBlock.HANGUL_COMPATIBILITY_JAMO
                    || blk == Character.UnicodeBlock.HANGUL_JAMO_EXTENDED_A
                    || blk == Character.UnicodeBlock.HANGUL_JAMO_EXTENDED_B) {
                hangul++;
            } else if (blk == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS
                    || blk == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_A
                    || blk == Character.UnicodeBlock.CJK_COMPATIBILITY_IDEOGRAPHS) {
                han++;
            } else if (blk == Character.UnicodeBlock.CYRILLIC
                    || blk == Character.UnicodeBlock.CYRILLIC_SUPPLEMENTARY) {
                cyrillic++;
            } else if (blk == Character.UnicodeBlock.ARABIC) {
                arabic++;
            } else if (blk == Character.UnicodeBlock.THAI) {
                thai++;
            } else if (blk == Character.UnicodeBlock.DEVANAGARI) {
                devanagari++;
            } else if (blk == Character.UnicodeBlock.HEBREW) {
                hebrew++;
            } else if (blk == Character.UnicodeBlock.BASIC_LATIN
                    || blk == Character.UnicodeBlock.LATIN_1_SUPPLEMENT
                    || blk == Character.UnicodeBlock.LATIN_EXTENDED_A
                    || blk == Character.UnicodeBlock.LATIN_EXTENDED_B) {
                latin++;
            }
        }

        if (total < 5) return null;

        // 假名(平/片)出现即判 ja——汉字单独可能是 zh,但只要有假名就锁定日语。
        if (hiraganaKatakana > 0) return "ja";
        if (hangul > total * 0.10) return "ko";
        if (han > total * 0.20) return "zh";
        if (cyrillic > total * 0.30) return "ru";
        if (arabic > total * 0.30) return "ar";
        if (thai > total * 0.30) return "th";
        if (devanagari > total * 0.30) return "hi";
        if (hebrew > total * 0.30) return "he";
        if (latin > total * 0.50) return detectLatin(stripped);
        return null;
    }

    /**
     * 拉丁字符占主导时用 stopword 频次区分常见欧洲语种。
     * 文本过短或无明显信号时回 "en"——下游 DeepLXTranslator 的 prompt 拿 "en" 当源语言
     * 仍能让多语种 LLM 翻得通,失败成本可控。
     */
    private static String detectLatin(String text) {
        String lower = " " + text.toLowerCase() + " ";
        int en = count(lower, " the ", " and ", " is ", " of ", " to ", " a ", " in ", " you ", " it ");
        int fr = count(lower, " le ", " la ", " les ", " des ", " est ", " une ", " avec ", " que ", " pour ");
        int de = count(lower, " der ", " die ", " das ", " und ", " ist ", " ein ", " mit ", " sie ", " auch ");
        int es = count(lower, " el ", " la ", " los ", " las ", " que ", " con ", " una ", " es ", " por ");
        int it = count(lower, " il ", " la ", " che ", " di ", " un ", " sono ", " con ", " per ", " non ");
        int pt = count(lower, " o ", " a ", " que ", " os ", " com ", " uma ", " do ", " da ", " para ");

        int max = Math.max(en, Math.max(Math.max(fr, de), Math.max(es, Math.max(it, pt))));
        if (max < 2) return "en";
        if (max == en) return "en";
        if (max == fr) return "fr";
        if (max == de) return "de";
        if (max == es) return "es";
        if (max == it) return "it";
        if (max == pt) return "pt";
        return "en";
    }

    private static int count(String text, String... needles) {
        int total = 0;
        for (String n : needles) {
            int idx = 0;
            while ((idx = text.indexOf(n, idx)) != -1) {
                total++;
                idx += n.length();
            }
        }
        return total;
    }

    /**
     * 把 VTT 结构噪音剥掉,只留台词文本——header/时间轴/NOTE/cue id/inline tag 都不参与统计,
     * 否则会被 "WEBVTT" 这类全拉丁字符串拉高拉丁占比误判 en。
     */
    private static String stripVttArtifacts(String vtt) {
        StringBuilder sb = new StringBuilder(vtt.length());
        for (String raw : vtt.split("\n")) {
            String line = raw.trim();
            if (line.isEmpty() || line.equals("WEBVTT") || line.startsWith("WEBVTT ")
                    || line.startsWith("NOTE") || line.contains(" --> ")) {
                continue;
            }
            // 纯数字行 = SRT cue 序号;不参与统计
            if (line.chars().allMatch(Character::isDigit)) continue;
            line = line.replaceAll("<[^>]*>", "");
            if (!line.isEmpty()) sb.append(line).append(' ');
        }
        return sb.toString();
    }
}
