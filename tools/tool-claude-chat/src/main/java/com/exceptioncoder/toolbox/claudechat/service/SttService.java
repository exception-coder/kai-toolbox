package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.common.media.FfmpegProcessRegistry;
import com.exceptioncoder.toolbox.common.media.FfmpegProperties;
import com.exceptioncoder.toolbox.common.media.FfmpegUnavailableException;
import com.exceptioncoder.toolbox.common.speech.SpeechToTextClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * 录音转文字编排：上传音频 → ffmpeg 转 16kHz mono wav → faster-whisper 转写 → 纯文本。
 *
 * <p>ffmpeg 命令对齐 tool-treesize 的 AudioExtractor（同款参数：dynaudnorm 提升弱音、单声道 16kHz s16le），
 * 但不依赖其类，直接复用 common 的 {@link FfmpegProcessRegistry}。临时文件用完即删。
 */
@Slf4j
@Service
public class SttService {

    private static final long FFMPEG_TIMEOUT_MINUTES = 5;

    private final FfmpegProperties ffmpegProps;
    private final FfmpegProcessRegistry ffmpeg;
    private final SpeechToTextClient speech;

    public SttService(FfmpegProperties ffmpegProps,
                      FfmpegProcessRegistry ffmpeg,
                      SpeechToTextClient speech) {
        this.ffmpegProps = ffmpegProps;
        this.ffmpeg = ffmpeg;
        this.speech = speech;
    }

    /** ASR 服务是否就绪，前端据此启用/禁用麦克风。 */
    public boolean isAvailable() {
        return speech.isAvailable();
    }

    /**
     * 把上传音频转写为文本。
     *
     * @param audio    原始音频字节流（任意 ffmpeg 可读容器：webm/opus、mp4/aac、wav 等）
     * @param language ISO 639-1 码或 "auto"
     */
    public String transcribe(InputStream audio, String language) throws IOException, InterruptedException {
        if (ffmpegProps.getBinary().isEmpty()) {
            throw new FfmpegUnavailableException("FFmpeg 不可用，请在 application.yml 配置 toolbox.ffmpeg.binary");
        }
        Path raw = Files.createTempFile("claude-chat-stt-", ".bin");
        Path wav = Files.createTempFile("claude-chat-stt-", ".wav");
        try {
            long bytes = Files.copy(audio, raw, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            if (bytes == 0) {
                return "";
            }
            toWav(raw, wav);
            return speech.transcribeToText(wav, language);
        } finally {
            deleteQuietly(raw);
            deleteQuietly(wav);
        }
    }

    /** ffmpeg 转 16kHz mono PCM s16le wav。 */
    private void toWav(Path in, Path outWav) throws IOException, InterruptedException {
        List<String> cmd = List.of(
                ffmpegProps.getBinary(),
                "-loglevel", "warning",
                "-nostdin",
                "-y",
                "-i", in.toAbsolutePath().toString(),
                "-vn",
                "-af", "dynaudnorm=f=200:g=15:p=0.95",
                "-ac", "1",
                "-ar", "16000",
                "-acodec", "pcm_s16le",
                "-f", "wav",
                outWav.toAbsolutePath().toString());

        Process process = ffmpeg.spawn(new ProcessBuilder(cmd).redirectErrorStream(true));
        process.getInputStream().readAllBytes(); // 排空输出避免管道阻塞
        if (!process.waitFor(FFMPEG_TIMEOUT_MINUTES, TimeUnit.MINUTES)) {
            process.destroyForcibly();
            throw new IOException("ffmpeg 录音转码超时");
        }
        if (process.exitValue() != 0) {
            throw new IOException("ffmpeg 录音转码失败 (exit " + process.exitValue() + ")");
        }
    }

    private void deleteQuietly(Path p) {
        try {
            Files.deleteIfExists(p);
        } catch (IOException e) {
            log.debug("[claude-chat] 删除临时文件失败 {}: {}", p, e.toString());
        }
    }
}
