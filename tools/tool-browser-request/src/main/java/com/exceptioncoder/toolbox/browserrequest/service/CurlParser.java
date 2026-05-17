package com.exceptioncoder.toolbox.browserrequest.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 把浏览器复制的 curl 命令解析成 {method, url, headers, body}。
 * 覆盖 Chrome DevTools「Copy as cURL (bash)」/「Copy as cURL (cmd)」/ PowerShell 风格的常用形态：
 *   - -X / --request 指定方法（缺省时若有 body 自动为 POST，否则 GET）
 *   - -H / --header 头
 *   - -b / --cookie 注入 Cookie 头
 *   - --data / --data-raw / --data-binary / -d 作为请求体
 *   - 行尾续行符 `\` `^` 反引号会先做规整
 *   - 单引号 / 双引号 / 反斜杠转义
 *
 * 不实现 multipart -F / -F @file，超出粘贴回放的常见用途。
 */
public final class CurlParser {

    private CurlParser() {}

    public record ParsedCurl(String method, String url,
                             Map<String, String> headers, String body) {}

    public static ParsedCurl parse(String raw) {
        if (raw == null) throw new IllegalArgumentException("curl 文本为空");
        String normalized = raw.replace("\r\n", "\n")
                .replace("\\\n", " ")
                .replace("^\n", " ")
                .replace("`\n", " ")
                .trim();
        List<String> tokens = tokenize(normalized);
        if (tokens.isEmpty() || !"curl".equalsIgnoreCase(tokens.get(0))) {
            throw new IllegalArgumentException("不是有效的 curl 命令，应以 curl 开头");
        }

        String method = null;
        String url = null;
        String body = null;
        Map<String, String> headers = new LinkedHashMap<>();
        List<String> cookies = new ArrayList<>();

        for (int i = 1; i < tokens.size(); i++) {
            String t = tokens.get(i);
            switch (t) {
                case "-X", "--request" -> method = tokens.get(++i);
                case "-H", "--header" -> {
                    String h = tokens.get(++i);
                    int colon = h.indexOf(':');
                    if (colon > 0) {
                        String k = h.substring(0, colon).trim();
                        String v = h.substring(colon + 1).trim();
                        headers.put(k, v);
                    }
                }
                case "-b", "--cookie" -> cookies.add(tokens.get(++i));
                case "--data", "--data-raw", "--data-binary", "--data-urlencode", "-d" -> {
                    String d = tokens.get(++i);
                    body = (body == null) ? d : body + "&" + d;
                }
                case "--compressed", "-L", "--location", "-k", "--insecure",
                     "-i", "--include", "-s", "--silent", "-v", "--verbose",
                     "-O", "--remote-name" -> { /* 无值/无意义 flag，忽略 */ }
                case "-A", "--user-agent" -> headers.put("User-Agent", tokens.get(++i));
                case "-e", "--referer" -> headers.put("Referer", tokens.get(++i));
                case "-u", "--user" -> {
                    String creds = tokens.get(++i);
                    headers.put("Authorization", "Basic " +
                            java.util.Base64.getEncoder().encodeToString(creds.getBytes()));
                }
                default -> {
                    if (t.startsWith("-")) {
                        // 未识别的带值短/长选项：保守跳过下一个 token 以免错位
                        if (i + 1 < tokens.size() && !tokens.get(i + 1).startsWith("-")
                                && url == null) {
                            // 不吞 URL，留给下一轮判断
                        } else if (i + 1 < tokens.size() && !tokens.get(i + 1).startsWith("-")) {
                            i++;
                        }
                    } else if (url == null) {
                        url = t;
                    }
                }
            }
        }

        if (url == null) throw new IllegalArgumentException("curl 命令缺少 URL");
        if (!cookies.isEmpty()) {
            String joined = String.join("; ", cookies);
            headers.merge("Cookie", joined, (a, b) -> a + "; " + b);
        }
        if (method == null) method = (body != null) ? "POST" : "GET";
        return new ParsedCurl(method.toUpperCase(), url, headers, body);
    }

    /** 简易 shell tokenizer：识别 ' " 和 \ 转义。 */
    private static List<String> tokenize(String s) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean inSingle = false, inDouble = false, hasContent = false;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (inSingle) {
                if (c == '\'') { inSingle = false; }
                else { cur.append(c); }
                hasContent = true;
            } else if (inDouble) {
                if (c == '\\' && i + 1 < s.length()) {
                    char n = s.charAt(i + 1);
                    if (n == '"' || n == '\\' || n == '$' || n == '`') { cur.append(n); i++; }
                    else { cur.append(c); }
                } else if (c == '"') { inDouble = false; }
                else { cur.append(c); }
                hasContent = true;
            } else {
                if (c == '\'') { inSingle = true; hasContent = true; }
                else if (c == '"') { inDouble = true; hasContent = true; }
                else if (c == '\\' && i + 1 < s.length()) { cur.append(s.charAt(++i)); hasContent = true; }
                else if (Character.isWhitespace(c)) {
                    if (hasContent) { out.add(cur.toString()); cur.setLength(0); hasContent = false; }
                } else { cur.append(c); hasContent = true; }
            }
        }
        if (hasContent) out.add(cur.toString());
        return out;
    }
}
