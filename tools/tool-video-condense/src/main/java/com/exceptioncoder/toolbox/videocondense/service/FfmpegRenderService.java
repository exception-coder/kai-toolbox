package com.exceptioncoder.toolbox.videocondense.service;

import com.exceptioncoder.toolbox.common.media.FfmpegProcessRegistry;
import com.exceptioncoder.toolbox.common.media.FfmpegProperties;
import com.exceptioncoder.toolbox.videocondense.config.VideoCondenseProperties;
import com.exceptioncoder.toolbox.videocondense.domain.RenderSegment;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/**
 * 按速度曲线渲染 mp4：每段 {@code trim+setpts} 变速后 {@code concat}。v1 恒 {@code a=0} 丢原音，
 * 传了配乐才叠一条音轨并 {@code -shortest}。滤镜图写脚本文件，规避 Windows 命令行 ~32KB 上限。
 */
@Service
public class FfmpegRenderService {

    private static final int STDERR_TAIL_LINES = 40;

    private final FfmpegProperties ffmpeg;
    private final FfmpegProcessRegistry registry;
    private final VideoCondenseProperties props;

    public FfmpegRenderService(FfmpegProperties ffmpeg, FfmpegProcessRegistry registry, VideoCondenseProperties props) {
        this.ffmpeg = ffmpeg;
        this.registry = registry;
        this.props = props;
    }

    /**
     * @param input  源视频
     * @param curve  渲染曲线（已含 ramp），按时间升序、各段不重叠；gap 自然被剔除
     * @param music  背景音乐，可为 null（无声输出）
     * @param outDir  产物目录（已建）
     * @param onStart spawn 后回调出 Process，供调用方取消时强杀，可为 null
     * @return 产物路径 out.mp4
     */
    public Path render(Path input, List<RenderSegment> curve, Path music, Path outDir, Consumer<Process> onStart)
            throws IOException, InterruptedException {
        if (curve.isEmpty()) {
            throw new IllegalArgumentException("速度曲线为空");
        }
        Files.createDirectories(outDir);
        Path out = outDir.resolve("out.mp4");

        StringBuilder fc = new StringBuilder();
        StringBuilder concat = new StringBuilder();
        for (int i = 0; i < curve.size(); i++) {
            RenderSegment seg = curve.get(i);
            fc.append(String.format(Locale.ROOT,
                    "[0:v]trim=start=%.3f:end=%.3f,setpts=(PTS-STARTPTS)/%.4f[v%d];",
                    seg.start(), seg.end(), seg.speed(), i));
            concat.append("[v").append(i).append("]");
        }
        fc.append(concat).append("concat=n=").append(curve.size()).append(":v=1:a=0[outv]");

        Path script = outDir.resolve("filter.txt");
        Files.writeString(script, fc.toString(), StandardCharsets.UTF_8);

        boolean withMusic = music != null;
        List<String> cmd = new ArrayList<>();
        cmd.add(ffmpeg.getBinary());
        cmd.add("-y");
        cmd.add("-i");
        cmd.add(input.toAbsolutePath().toString());
        if (withMusic) {
            cmd.add("-i");
            cmd.add(music.toAbsolutePath().toString());
        }
        cmd.add("-filter_complex_script");
        cmd.add(script.toAbsolutePath().toString());
        cmd.add("-map");
        cmd.add("[outv]");
        if (withMusic) {
            cmd.add("-map");
            cmd.add("1:a");
            cmd.add("-c:a");
            cmd.add("aac");
            cmd.add("-b:a");
            cmd.add("128k");
            cmd.add("-shortest");
        }
        cmd.add("-c:v");
        cmd.add("libx264");
        cmd.add("-preset");
        cmd.add("veryfast");
        cmd.add("-crf");
        cmd.add("23");
        cmd.add(out.toAbsolutePath().toString());

        Process p = registry.spawn(new ProcessBuilder(cmd).redirectErrorStream(true));
        if (onStart != null) onStart.accept(p);
        Deque<String> tail = new ArrayDeque<>();
        Thread drain = startTailDrain(p, tail);
        try {
            if (!p.waitFor(props.getRenderTimeoutSeconds(), TimeUnit.SECONDS)) {
                p.descendants().forEach(ProcessHandle::destroyForcibly);
                p.destroyForcibly();
                throw new IOException("渲染超时（" + props.getRenderTimeoutSeconds() + "s）| " + tailToString(tail));
            }
            if (p.exitValue() != 0) {
                throw new IOException("ffmpeg 渲染失败 exit " + p.exitValue() + " | " + tailToString(tail));
            }
            if (!Files.isRegularFile(out) || Files.size(out) == 0) {
                throw new IOException("渲染产出空文件 | " + tailToString(tail));
            }
        } finally {
            try { drain.join(500); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
        }
        return out;
    }

    private Thread startTailDrain(Process p, Deque<String> tail) {
        return Thread.ofVirtual().name("vc-render-drain").start(() -> {
            try (BufferedReader r = new BufferedReader(
                    new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) {
                    synchronized (tail) {
                        tail.addLast(line);
                        while (tail.size() > STDERR_TAIL_LINES) tail.pollFirst();
                    }
                }
            } catch (IOException ignored) {
            }
        });
    }

    private static String tailToString(Deque<String> tail) {
        synchronized (tail) {
            return tail.isEmpty() ? "<no output>" : String.join(" | ", tail);
        }
    }
}
