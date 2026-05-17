package com.exceptioncoder.toolbox.treesize.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.exceptioncoder.toolbox.treesize.config.DeepLXProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.DoubleConsumer;
import java.util.stream.Collectors;

/**
 * Translates WebVTT subtitle files via a locally running DeepLX instance.
 *
 * <p>Strategy:
 * <ol>
 *   <li>Parse the VTT into cues (timing + text).</li>
 *   <li>Strip VTT markup tags ({@code <00:00:01.000>}, {@code <c>}, etc.) from each cue's text.</li>
 *   <li>Translate all cue texts in parallel, capped by {@link DeepLXProperties#getMaxConcurrent()}.</li>
 *   <li>Write a new {@code .zh.vtt} alongside the original, preserving timing lines verbatim.</li>
 * </ol>
 *
 * <p>Failures per cue fall back to the original text so a partial translation failure does not
 * blank the whole subtitle track.
 */
@Component
public class DeepLXTranslator {

    private static final Logger log = LoggerFactory.getLogger(DeepLXTranslator.class);

    private final DeepLXProperties props;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http;

    public DeepLXTranslator(DeepLXProperties props) {
        this.props = props;
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    public boolean isEnabled() {
        return props.isEnabled();
    }

    /**
     * Returns true if {@code whisperLang} is worth translating to the configured target.
     * Skips when source == target (e.g. Chinese source → ZH target).
     */
    public boolean shouldTranslate(String whisperLang) {
        if (whisperLang == null || whisperLang.isBlank()) return false;
        String norm = whisperLang.toLowerCase();
        String target = props.getTargetLang().toLowerCase();
        // "zh" / "zho" / "zh-cn" → skip if target is ZH
        if (target.startsWith("zh") && (norm.startsWith("zh") || norm.equals("zho"))) return false;
        if (target.startsWith("en") && norm.startsWith("en")) return false;
        return true;
    }

    /** 无进度回调版本,兼容旧调用方;新调用方应传 progressListener 让 SSE 能下发翻译进度。 */
    public Path translateVtt(Path sourceVtt, String whisperLang) throws IOException, InterruptedException {
        return translateVtt(sourceVtt, whisperLang, null);
    }

    /**
     * Translate {@code sourceVtt} and write {@code {hash}.zh.vtt} in the same directory.
     * Returns the path of the translated file, or {@code null} if there is nothing to translate.
     *
     * @param progressListener 每条 cue 翻完后回调一次,参数为 {@code completed/total} (0..1);
     *                         {@code null} 表示不关心进度。回调在 CompletableFuture 工作线程
     *                         上触发,实现里短逻辑即可,长操作请自己 dispatch。
     */
    public Path translateVtt(Path sourceVtt, String whisperLang, DoubleConsumer progressListener)
            throws IOException, InterruptedException {
        String sourceLangUpper = whisperLang.toUpperCase().split("[-_]")[0]; // "ja" → "JA"

        List<VttCue> cues = parseCues(sourceVtt);
        if (cues.isEmpty()) {
            log.warn("translateVtt: no cues found in {}", sourceVtt);
            return null;
        }

        log.info("translateVtt: translating {} cues {} → {} for {}",
                cues.size(), sourceLangUpper, props.getTargetLang(), sourceVtt.getFileName());

        List<String> texts = cues.stream().map(VttCue::cleanText).collect(Collectors.toList());
        List<String> translated = translateAll(texts, sourceLangUpper, progressListener);

        String baseName = sourceVtt.getFileName().toString();
        // "{hash}.vtt" → "{hash}.zh.vtt"
        String outName = baseName.endsWith(".vtt")
                ? baseName.substring(0, baseName.length() - 4) + ".zh.vtt"
                : baseName + ".zh.vtt";
        Path outPath = sourceVtt.resolveSibling(outName);
        writeVtt(outPath, cues, translated);
        log.info("translateVtt: wrote {}", outPath.getFileName());
        return outPath;
    }

    // -------------------------------------------------------------------------
    // VTT parsing
    // -------------------------------------------------------------------------

    private record VttCue(String preTiming, String timing, String rawText) {
        /** Strip VTT inline tags like {@code <00:00:01.000>}, {@code <c>}, {@code </c>}. */
        String cleanText() {
            return rawText.replaceAll("<[^>]*>", "").trim();
        }
    }

    private List<VttCue> parseCues(Path vttFile) throws IOException {
        String content = Files.readString(vttFile, StandardCharsets.UTF_8)
                .replace("\r\n", "\n").replace("\r", "\n");

        List<VttCue> cues = new ArrayList<>();
        // VTT blocks are separated by one or more blank lines.
        String[] blocks = content.split("\n{2,}");

        for (String block : blocks) {
            String trimmed = block.trim();
            if (trimmed.isEmpty() || trimmed.startsWith("WEBVTT") || trimmed.startsWith("NOTE")) {
                continue;
            }
            String[] lines = trimmed.split("\n");
            int timingIdx = -1;
            for (int i = 0; i < lines.length; i++) {
                if (lines[i].contains(" --> ")) {
                    timingIdx = i;
                    break;
                }
            }
            if (timingIdx < 0) continue;

            String preTiming = timingIdx > 0
                    ? String.join("\n", Arrays.copyOfRange(lines, 0, timingIdx)) + "\n"
                    : "";
            String timing = lines[timingIdx];
            String rawText = timingIdx + 1 < lines.length
                    ? String.join("\n", Arrays.copyOfRange(lines, timingIdx + 1, lines.length))
                    : "";

            if (!rawText.isBlank()) {
                cues.add(new VttCue(preTiming, timing, rawText));
            }
        }
        return cues;
    }

    private void writeVtt(Path outPath, List<VttCue> cues, List<String> translations) throws IOException {
        StringBuilder sb = new StringBuilder("WEBVTT\n");
        for (int i = 0; i < cues.size(); i++) {
            VttCue cue = cues.get(i);
            sb.append('\n');
            if (!cue.preTiming().isBlank()) sb.append(cue.preTiming());
            sb.append(cue.timing()).append('\n');
            sb.append(translations.get(i)).append('\n');
        }
        Files.writeString(outPath, sb.toString(), StandardCharsets.UTF_8);
    }

    // -------------------------------------------------------------------------
    // Translation
    // -------------------------------------------------------------------------

    private List<String> translateAll(List<String> texts, String sourceLang, DoubleConsumer progressListener)
            throws InterruptedException {
        Semaphore sem = new Semaphore(props.getMaxConcurrent());
        List<CompletableFuture<String>> futures = new ArrayList<>(texts.size());
        int total = texts.size();
        // 每条 cue 翻完(成功 / 失败均算)就 incrementAndGet → progressListener.accept(done/total)。
        // CompletableFuture 的工作线程并发触发,AtomicInteger 保证计数原子;listener 自己负责
        // 重入安全(下游 SubtitleService 用 SSE publish + DB update,二者都是线程安全的)。
        AtomicInteger done = new AtomicInteger(0);

        for (String text : texts) {
            sem.acquire();
            String captured = text;
            CompletableFuture<String> f = CompletableFuture.supplyAsync(() -> {
                try {
                    return translateText(captured, sourceLang);
                } catch (Exception e) {
                    log.debug("translation failed for cue, keeping original: {}", e.getMessage());
                    return captured.replaceAll("<[^>]*>", "").trim();
                } finally {
                    sem.release();
                    int d = done.incrementAndGet();
                    if (progressListener != null) {
                        try {
                            progressListener.accept((double) d / total);
                        } catch (Exception cb) {
                            log.warn("progressListener threw, ignoring: {}", cb.toString());
                        }
                    }
                }
            });
            futures.add(f);
        }

        return futures.stream().map(f -> {
            try {
                return f.get();
            } catch (Exception e) {
                return "";
            }
        }).collect(Collectors.toList());
    }

    private String translateText(String rawText, String sourceLang) throws IOException, InterruptedException {
        String text = rawText.replaceAll("<[^>]*>", "").trim();
        if (text.isEmpty()) return rawText;
        return "ollama".equals(props.getProvider())
                ? translateViaOllama(text, sourceLang)
                : translateViaDeepLX(text, sourceLang);
    }

    private String translateViaOllama(String text, String sourceLang) throws IOException, InterruptedException {
        // Map ISO codes to natural language names for the prompt.
        String srcName = switch (sourceLang.toLowerCase()) {
            case "ja" -> "日语";
            case "en" -> "英语";
            case "ko" -> "韩语";
            case "zh" -> "中文";
            case "fr" -> "法语";
            case "de" -> "德语";
            default  -> sourceLang;
        };
        String tgtName = switch (props.getTargetLang().toUpperCase()) {
            case "ZH", "ZH-HANS" -> "中文";
            case "EN"             -> "英语";
            case "JA"             -> "日语";
            default               -> props.getTargetLang();
        };

        // Keep the prompt terse — small models drift when given verbose instructions.
        String prompt = "将下面的" + srcName + "翻译成" + tgtName + "，只输出翻译结果，不要解释：\n" + text;

        String body = mapper.writeValueAsString(Map.of(
                "model", props.getOllamaModel(),
                "prompt", prompt,
                "stream", false
        ));

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(props.getUrl().replaceAll("/+$", "") + "/api/generate"))
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(props.getTimeoutSeconds()))
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> resp = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() != 200) {
            throw new IOException("Ollama HTTP " + resp.statusCode() + ": " + resp.body());
        }
        String result = mapper.readTree(resp.body()).path("response").asText("").trim();
        return result.isBlank() ? text : result;
    }

    private String translateViaDeepLX(String text, String sourceLang) throws IOException, InterruptedException {
        String body = mapper.writeValueAsString(Map.of(
                "text", text,
                "source_lang", sourceLang,
                "target_lang", props.getTargetLang()
        ));

        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(props.getUrl()))
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(props.getTimeoutSeconds()))
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
        if (!props.getToken().isBlank()) {
            builder.header("Authorization", "Bearer " + props.getToken());
        }

        HttpResponse<String> resp = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() != 200) {
            throw new IOException("DeepLX HTTP " + resp.statusCode());
        }
        JsonNode node = mapper.readTree(resp.body());
        int code = node.path("code").asInt(-1);
        if (code != 200) {
            throw new IOException("DeepLX error code=" + code + " body=" + resp.body());
        }
        String result = node.path("data").asText("");
        return result.isBlank() ? text : result;
    }
}
