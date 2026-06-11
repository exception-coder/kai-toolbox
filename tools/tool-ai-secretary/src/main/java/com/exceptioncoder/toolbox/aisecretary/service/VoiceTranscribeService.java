package com.exceptioncoder.toolbox.aisecretary.service;

import com.exceptioncoder.toolbox.common.speech.SpeechToTextClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;

/**
 * 语音转写：上传的音频(浏览器多为 webm/opus) → ffmpeg 转 16k 单声道 wav → {@link SpeechToTextClient} 转文本。
 *
 * <p>确定性优先:格式转换 + ASR 调用全在代码里;LLM 只在后续 capture 分类时介入。
 * 依赖:本机 ffmpeg(toolbox.ffmpeg.binary) + faster-whisper ASR 服务(toolbox.speech.asr-base-url)。
 */
@Service
public class VoiceTranscribeService {

    private static final Logger log = LoggerFactory.getLogger(VoiceTranscribeService.class);

    private final SpeechToTextClient asr;
    private final String ffmpegBinary;

    public VoiceTranscribeService(SpeechToTextClient asr,
                                  @Value("${toolbox.ffmpeg.binary:ffmpeg}") String ffmpegBinary) {
        this.asr = asr;
        this.ffmpegBinary = ffmpegBinary;
    }

    /** 把上传音频转写成纯文本;识别不到内容返回空串。 */
    public String transcribe(MultipartFile audio) throws IOException, InterruptedException {
        if (audio == null || audio.isEmpty()) {
            throw new IllegalArgumentException("空音频");
        }
        Path in = Files.createTempFile("ais-voice-", suffixOf(audio.getOriginalFilename()));
        Path wav = Files.createTempFile("ais-voice-", ".wav");
        try {
            audio.transferTo(in.toFile());
            convertToWav(in, wav);
            return asr.transcribeToText(wav, "auto");
        } finally {
            quietDelete(in);
            quietDelete(wav);
        }
    }

    /** ffmpeg -i in -ar 16000 -ac 1 -f wav out（ASR 要求 16k 单声道 wav）。 */
    private void convertToWav(Path in, Path out) throws IOException, InterruptedException {
        Process p = new ProcessBuilder(
                ffmpegBinary, "-y", "-i", in.toString(),
                "-ar", "16000", "-ac", "1", "-f", "wav", out.toString())
                .redirectErrorStream(true)
                .start();
        // 必须排空输出,否则缓冲区满会让 ffmpeg 阻塞
        String tail;
        try (InputStream is = p.getInputStream()) {
            tail = new String(is.readAllBytes());
        }
        if (!p.waitFor(120, TimeUnit.SECONDS)) {
            p.destroyForcibly();
            throw new IOException("ffmpeg 转码超时");
        }
        if (p.exitValue() != 0) {
            throw new IOException("ffmpeg 转码失败 (exit " + p.exitValue() + ")：" + tailOf(tail));
        }
        log.debug("[ai-secretary] 语音转 wav 完成 -> {}", out);
    }

    private static String suffixOf(String name) {
        if (name == null) {
            return ".bin";
        }
        int dot = name.lastIndexOf('.');
        return dot >= 0 ? name.substring(dot) : ".bin";
    }

    private static String tailOf(String s) {
        if (s == null) {
            return "";
        }
        String t = s.trim();
        return t.length() > 400 ? t.substring(t.length() - 400) : t;
    }

    private static void quietDelete(Path p) {
        try {
            Files.deleteIfExists(p);
        } catch (IOException ignored) {
            // 临时文件清理失败不影响主流程
        }
    }
}
