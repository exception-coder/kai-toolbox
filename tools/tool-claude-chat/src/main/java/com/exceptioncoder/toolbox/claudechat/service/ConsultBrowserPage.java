package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.repository.ConsultRuntimeRepository.BrowserEvent;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.net.URI;
import java.util.List;
import java.util.regex.Pattern;

/** Resolves the last observed public page. Only the current user's instruction can authorize a new click. */
final class ConsultBrowserPage {
    private static final String BROWSER_TOOL = "forge_browser/browser_open_and_click";
    private static final Pattern NAVIGATION = Pattern.compile(
            "点击|点开|点一下|点一次|链接|菜单|\\b(?:click|link|menu)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern CONFIRM = Pattern.compile(
            "(?:我)?(?:授权|允许|同意)(?:你)?(?:访问|执行|操作|点击){0,2}[。！!]?");

    private ConsultBrowserPage() { }

    static boolean isNavigationQuestion(String text) {
        return text != null && !CONFIRM.matcher(text.strip()).matches() && NAVIGATION.matcher(text).find();
    }

    static String previousRequest(List<BrowserEvent> events) {
        for (var event : events) {
            if ("user".equals(event.kind())) {
                String text = event.userText();
                return text != null && text.toLowerCase(java.util.Locale.ROOT).contains("https://") ? text : null;
            }
            if ((BROWSER_TOOL.equals(event.toolName()) && (event.failed() || event.receipt() != null))
                    || ("cua_repl/js".equals(event.toolName()) && event.failed())) { continue; }
            return null;
        }
        return null;
    }

    static String resolve(List<BrowserEvent> events, ObjectMapper mapper) {
        boolean failedBrowserAttempt = false;
        for (var event : events) {
            if ("user".equals(event.kind())) {
                // A failed browser turn can be followed by a retry; a different task/site ends continuity.
                String text = event.userText();
                if (!failedBrowserAttempt || text == null || text.contains("://")
                        || (!isNavigationQuestion(text) && !CONFIRM.matcher(text.strip()).matches())) {
                    return null;
                }
                failedBrowserAttempt = false;
                continue;
            }
            if (BROWSER_TOOL.equals(event.toolName()) && !event.failed()) {
                return observedPage(event.receipt(), mapper);
            }
            if (event.failed() && (BROWSER_TOOL.equals(event.toolName()) || "cua_repl/js".equals(event.toolName()))) {
                failedBrowserAttempt = true;
                continue;
            }
            return null;
        }
        return null;
    }

    private static String observedPage(String output, ObjectMapper mapper) {
        if (output == null) { return null; }
        try {
            var envelope = mapper.readTree(output);
            if (envelope == null) { return null; }
            var content = envelope.path("content");
            if (!content.isArray() || content.size() != 1 || !"text".equals(content.get(0).path("type").asText())) {
                return null;
            }
            var receipt = mapper.readTree(content.get(0).path("text").asText());
            if (receipt == null || !receipt.isObject()) { return null; }
            String url = receipt.path("url").asText("");
            if (receipt.has("afterUrl")) {
                int status = receipt.path("status").asInt(0);
                if (!url.equals(receipt.path("afterUrl").asText()) || status < 200 || status >= 300) { return null; }
            } else if (!url.equals(receipt.path("beforeUrl").asText())) {
                return null;
            }
            URI page = URI.create(url);
            return url.length() <= 4096 && "https".equalsIgnoreCase(page.getScheme()) && page.getHost() != null
                    && page.getUserInfo() == null && page.getPort() == -1 ? url : null;
        } catch (JsonProcessingException | IllegalArgumentException malformedReceipt) {
            return null;
        }
    }
}
