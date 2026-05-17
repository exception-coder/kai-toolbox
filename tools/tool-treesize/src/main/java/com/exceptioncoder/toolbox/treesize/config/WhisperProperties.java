package com.exceptioncoder.toolbox.treesize.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

/**
 * Binds {@code toolbox.whisper.*} from application.yml. Configures the {@code whisper-cli}
 * subprocess used to transcribe audio to VTT subtitles.
 *
 * <p>{@code whisper-cli} is the renamed-since-Q4-2024 binary in upstream whisper.cpp builds
 * (older releases call it {@code main.exe}); both accept the same flags. Use the CUDA build
 * for NVIDIA GPUs — it auto-detects the device, no flag is needed to enable it. Set
 * {@link #disableGpu} to force CPU mode for debugging or thermal throttling.
 *
 * <p>The model file is the gguf/ggml weights (e.g. {@code ggml-medium.bin}). {@code medium}
 * is a sensible default for English / Japanese films on a discrete GPU; switch to
 * {@code large-v3} if quality matters more than speed.
 */
@ConfigurationProperties(prefix = "toolbox.whisper")
public class WhisperProperties {
    /**
     * 后端选择：
     * <ul>
     *   <li>{@code cli}（默认）— 调本地 whisper-cli.exe 子进程，需要 binary + modelPath</li>
     *   <li>{@code asr-service} — 调本地 faster-whisper Python HTTP 服务（推荐），
     *       需要 serviceUrl；CJK 路径 / 参数兼容性问题彻底绕过</li>
     * </ul>
     */
    private String mode = "cli";
    /** ASR 服务地址，仅当 {@link #mode} = {@code asr-service} 时使用。 */
    private String serviceUrl = "http://127.0.0.1:9500";
    /** Absolute path to {@code whisper-cli.exe} (or {@code main.exe} on older builds). */
    private String binary = "";
    /** Absolute path to the ggml model file, e.g. {@code ggml-medium.bin}. */
    private String modelPath = "";
    /** Free-form tag stored on each job so we know which model produced the VTT. */
    private String modelName = "medium";
    /** Where to write {@code .vtt} files. Falls back to {@code ${toolbox.data-dir}/subtitles} via app config. */
    private String outputDir = "";
    /** Threads for whisper.cpp. Leave at 0 to let whisper.cpp pick (= number of CPU cores). */
    private int threads = 0;
    /** Pass {@code --no-gpu} to whisper-cli even on a CUDA build. Useful for benchmarking or when GPU is busy. */
    private boolean disableGpu = false;
    /** How many subtitle jobs may run in parallel. Whisper is GPU-bound; 1 is the right answer for almost everyone. */
    private int maxConcurrentJobs = 1;
    /** Maximum wall-clock seconds for a single transcription before we kill the process. 0 = no limit. */
    private long timeoutSeconds = 0;
    /**
     * 在 GPU 模式下传 {@code -fa} 给 whisper-cli。Flash Attention 是 CUDA 专用的融合 kernel
     * 实现，加速 30-50%。但**实测部分 whisper.cpp 构建（即使是 v1.8+）传 {@code -fa} 后
     * 会让 transcribe 跑完不写 VTT**，原因不明。默认关闭，由用户在 yml 显式 opt-in 验证。
     */
    private boolean flashAttention = false;
    /**
     * 是否传 {@code -su / --split-on-word}。理论上能防止 whisper 在 30s chunk 边界把一个
     * 词切两半导致整词丢失。但部分 whisper.cpp 构建对此参数解析有异常，加上后整段不写 VTT。
     * 默认关闭，避免引入兼容性风险；用户在 yml 显式 opt-in 验证后保留。
     */
    private boolean splitOnWord = false;
    /**
     * Optional default prompt prepended to every transcription via {@code --prompt}. Use it
     * to seed whisper with proper-noun spellings ({@code "GPT-4o, ChatGPT, Anthropic"}) or
     * domain vocabulary; the model becomes more willing to emit those tokens and less prone
     * to dropping a word it would otherwise consider out-of-distribution. Per-job prompts
     * passed at enqueue time override this default.
     */
    private String defaultInitialPrompt = "";
    /**
     * Absolute path to a Silero VAD ggml model (e.g. {@code ggml-silero-v5.1.2.bin}). When
     * present and the file exists, whisper.cpp pre-segments audio into speech regions via
     * {@code --vad --vad-model <path>}, skipping silence entirely. Long videos with sparse
     * speech see both a speed win and an accuracy win (hallucination on silence drops).
     *
     * <p>Download from <a href="https://huggingface.co/ggml-org/whisper-vad/tree/main">
     * huggingface.co/ggml-org/whisper-vad</a>. Empty = VAD disabled.
     */
    private String vadModelPath = "";

    /**
     * 反幻觉三件套之一,对应 whisper-cli 的 {@code --no-speech-thold}。
     * 默认 0.6;提高到 0.75 让 no-speech 概率较高的段直接判静音,避免在哭声/喘息/配乐段
     * 输出 "(泣き声)" 之类的 non-speech 标签。
     */
    private double noSpeechThreshold = 0.6;

    /**
     * 对应 whisper-cli 的 {@code --logprob-thold}。
     * 默认 -1.0;提高到 -0.5 让平均对数概率低的段触发 temperature fallback / 整段丢弃,
     * 减少模型在低置信区瞎编的概率。
     */
    private double logprobThreshold = -1.0;

    /**
     * 对应 whisper-cli 的 {@code --entropy-thold}。命名误导:实际语义是
     * "compression ratio threshold",检测输出文本是否过度重复(同一短语反复输出时压缩比飙升)。
     * 默认 2.4;降低到 2.0 让重复检测更敏感,中后段陷入 "(泣き声)" 复读时能提前 fallback。
     */
    private double entropyThreshold = 2.4;

    /**
     * 等价于 faster-whisper 的 {@code condition_on_previous_text=False}。默认开启(true):
     * 每段独立解码,上一段的转写文本不再拼进下一段的 prompt。能阻止长视频中段一次幻觉
     * 沿着 prompt 链一路传染到结尾(典型表现:后半段整段空白或反复 "(泣き声)")。
     * 代价是跨段语境一致性略降,人名/术语建议靠 {@link #defaultInitialPrompt} 喂。
     * 与 Python 端 server.py 的行为保持一致。
     *
     * <p>CLI 映射:老版 whisper.cpp (≤v1.5) 是 {@code -nc / --no-context},
     * 新版 (≥v1.7,user 当前 cuBLAS 12.4 build) 该 flag 删了,WhisperRunner 改用
     * {@code --max-context 0} 等价实现(保留 0 个上文 token = 不带 context)。
     */
    private boolean noContext = true;

    /**
     * CLI flag 字面值集中维护。whisper.cpp 各 build 间 flag 名漂移频繁(`-nc` 被 `-mc 0` 取代,
     * `--no-speech-thold` 在 v1.4- 是 `--no-speech-threshold` 等),把所有字面值放到 yml 让升级
     * whisper.cpp 后只改 yml 就能继续工作,不需要重新编译。
     *
     * <p>所有字段都有合理默认值(对齐 user 当前 cuBLAS 12.4 build),只在新 build 跑不通时按需 override。
     */
    private CliFlags cli = new CliFlags();

    public String getBinary() { return binary; }
    public void setBinary(String binary) { this.binary = binary == null ? "" : binary.trim(); }

    public String getModelPath() { return modelPath; }
    public void setModelPath(String modelPath) { this.modelPath = modelPath == null ? "" : modelPath.trim(); }

    public String getModelName() { return modelName; }
    public void setModelName(String modelName) { this.modelName = modelName == null ? "medium" : modelName.trim(); }

    public String getOutputDir() { return outputDir; }
    public void setOutputDir(String outputDir) { this.outputDir = outputDir == null ? "" : outputDir.trim(); }

    public int getThreads() { return threads; }
    public void setThreads(int threads) { this.threads = Math.max(0, threads); }

    public boolean isDisableGpu() { return disableGpu; }
    public void setDisableGpu(boolean disableGpu) { this.disableGpu = disableGpu; }

    public int getMaxConcurrentJobs() { return maxConcurrentJobs; }
    public void setMaxConcurrentJobs(int maxConcurrentJobs) { this.maxConcurrentJobs = Math.max(1, maxConcurrentJobs); }

    public long getTimeoutSeconds() { return timeoutSeconds; }
    public void setTimeoutSeconds(long timeoutSeconds) { this.timeoutSeconds = Math.max(0, timeoutSeconds); }

    public boolean isFlashAttention() { return flashAttention; }
    public void setFlashAttention(boolean flashAttention) { this.flashAttention = flashAttention; }

    public boolean isSplitOnWord() { return splitOnWord; }
    public void setSplitOnWord(boolean splitOnWord) { this.splitOnWord = splitOnWord; }

    public String getDefaultInitialPrompt() { return defaultInitialPrompt; }
    public void setDefaultInitialPrompt(String defaultInitialPrompt) {
        this.defaultInitialPrompt = defaultInitialPrompt == null ? "" : defaultInitialPrompt;
    }

    public String getVadModelPath() { return vadModelPath; }
    public void setVadModelPath(String vadModelPath) {
        this.vadModelPath = vadModelPath == null ? "" : vadModelPath.trim();
    }

    public double getNoSpeechThreshold() { return noSpeechThreshold; }
    public void setNoSpeechThreshold(double noSpeechThreshold) {
        this.noSpeechThreshold = noSpeechThreshold;
    }

    public double getLogprobThreshold() { return logprobThreshold; }
    public void setLogprobThreshold(double logprobThreshold) {
        this.logprobThreshold = logprobThreshold;
    }

    public double getEntropyThreshold() { return entropyThreshold; }
    public void setEntropyThreshold(double entropyThreshold) {
        this.entropyThreshold = entropyThreshold;
    }

    public boolean isNoContext() { return noContext; }
    public void setNoContext(boolean noContext) { this.noContext = noContext; }

    public CliFlags getCli() { return cli; }
    public void setCli(CliFlags cli) { this.cli = cli == null ? new CliFlags() : cli; }

    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode == null ? "cli" : mode.trim().toLowerCase(); }

    public String getServiceUrl() { return serviceUrl; }
    public void setServiceUrl(String serviceUrl) {
        this.serviceUrl = serviceUrl == null ? "" : serviceUrl.trim();
    }

    public boolean isAsrServiceMode() {
        return "asr-service".equals(mode);
    }

    /**
     * 字幕功能是否可用。两种模式下检查不同的必填项：
     * CLI 模式需要 binary + modelPath；ASR 模式只需 serviceUrl 非空（服务存活与否运行时再判）。
     */
    public boolean isAvailable() {
        if (isAsrServiceMode()) {
            return !serviceUrl.isEmpty();
        }
        return !binary.isEmpty() && !modelPath.isEmpty();
    }

    /**
     * whisper-cli 各 build 间漂移的 flag 字面值集中维护。所有字段默认对齐当前
     * <a href="https://github.com/ggml-org/whisper.cpp/releases">whisper.cpp v1.7+ cuBLAS build</a>;
     * 升级到新版本后命令行 flag 重命名,只需改这里的字符串即可,不用重新编译 Java。
     *
     * <p>历史踩坑:
     * <ul>
     *   <li>{@code -nc / --no-context} 在 v1.7+ 被删,只剩 {@code --max-context N}(N=0 等价)</li>
     *   <li>{@code -fa} 默认值在 cuBLAS build 间反复改(true/false 都见过)</li>
     *   <li>{@code -su} (split-on-word) 在某些 build 上传了反而不写 VTT</li>
     * </ul>
     */
    public static class CliFlags {
        /** {@code -m <model>}:gguf/ggml 模型文件路径。 */
        private String modelFlag = "-m";
        /** {@code -f <wav>}:输入音频文件。 */
        private String fileFlag = "-f";
        /** {@code -l <lang>}:语言代码("auto" 或 "ja" / "en" 等)。 */
        private String languageFlag = "-l";
        /** {@code -ovtt}:输出 VTT 格式开关(无参数)。注意必须是 ovtt,不是 srt/txt,否则前端拿不到字幕。 */
        private String outputVttFlag = "-ovtt";
        /** {@code -of <prefix>}:输出文件名前缀(whisper 自动加 .vtt 后缀)。 */
        private String outputPrefixFlag = "-of";
        /** {@code -pp}:打印 {@code progress = X%} 行,Java 端 stderr 正则依赖它。删了进度条就动不了。 */
        private String printProgressFlag = "-pp";
        /** {@code -np}:抑制大部分非结果打印,减少日志噪音。 */
        private String suppressPrintsFlag = "-np";
        /** {@code --prompt <text>}:initial prompt 文本参数名。 */
        private String promptFlag = "--prompt";
        /** {@code -t <N>}:线程数参数名。{@link WhisperProperties#getThreads()} 为 0 时不传此 flag。 */
        private String threadsFlag = "-t";
        /** {@code --no-gpu}:强制 CPU(无参数)。 */
        private String noGpuFlag = "--no-gpu";
        /** {@code -fa}:启用 Flash Attention(无参数,CUDA build 上 30-50% 加速)。 */
        private String flashAttnFlag = "-fa";
        /** {@code -su / --split-on-word}:按词切 chunk 防吞字(无参数)。 */
        private String splitOnWordFlag = "-su";
        /** {@code --vad}:启用 VAD 预分段(无参数)。需要配合 {@link #vadModelFlag}。 */
        private String vadFlag = "--vad";
        /** {@code --vad-model <path>}:Silero VAD ggml 模型路径。 */
        private String vadModelFlag = "--vad-model";
        /** {@code --no-speech-thold <N>}:no-speech 概率阈值。值由 {@link WhisperProperties#getNoSpeechThreshold()} 提供。 */
        private String noSpeechTholdFlag = "--no-speech-thold";
        /** {@code --logprob-thold <N>}:log probability 阈值。值由 {@link WhisperProperties#getLogprobThreshold()} 提供。 */
        private String logprobTholdFlag = "--logprob-thold";
        /** {@code --entropy-thold <N>}:实际是压缩比阈值。值由 {@link WhisperProperties#getEntropyThreshold()} 提供。 */
        private String entropyTholdFlag = "--entropy-thold";
        /** {@code -mc / --max-context <N>}:上文 token 数。{@link WhisperProperties#isNoContext()} 开启时,
         *  WhisperRunner 会把这个 flag 加上 {@link #maxContextValueForNoContext} 一起传(等价于老版 -nc)。 */
        private String maxContextFlag = "-mc";
        /** 与 {@link #maxContextFlag} 搭配的"零上文"参数值。老版 {@code -nc} 是开关,新版必须传 0。 */
        private String maxContextValueForNoContext = "0";
        /** 在所有上述 flag 之后追加的任意额外 args(每个 token 单独一项),空列表表示不加。
         *  典型用法:加 {@code -bs 5} / {@code --temperature 0.0} / 实验性 flag,无需改 Java 代码。 */
        private List<String> extraArgs = new ArrayList<>();

        public String getModelFlag() { return modelFlag; }
        public void setModelFlag(String s) { this.modelFlag = nullSafe(s, "-m"); }
        public String getFileFlag() { return fileFlag; }
        public void setFileFlag(String s) { this.fileFlag = nullSafe(s, "-f"); }
        public String getLanguageFlag() { return languageFlag; }
        public void setLanguageFlag(String s) { this.languageFlag = nullSafe(s, "-l"); }
        public String getOutputVttFlag() { return outputVttFlag; }
        public void setOutputVttFlag(String s) { this.outputVttFlag = nullSafe(s, "-ovtt"); }
        public String getOutputPrefixFlag() { return outputPrefixFlag; }
        public void setOutputPrefixFlag(String s) { this.outputPrefixFlag = nullSafe(s, "-of"); }
        public String getPrintProgressFlag() { return printProgressFlag; }
        public void setPrintProgressFlag(String s) { this.printProgressFlag = nullSafe(s, "-pp"); }
        public String getSuppressPrintsFlag() { return suppressPrintsFlag; }
        public void setSuppressPrintsFlag(String s) { this.suppressPrintsFlag = nullSafe(s, "-np"); }
        public String getPromptFlag() { return promptFlag; }
        public void setPromptFlag(String s) { this.promptFlag = nullSafe(s, "--prompt"); }
        public String getThreadsFlag() { return threadsFlag; }
        public void setThreadsFlag(String s) { this.threadsFlag = nullSafe(s, "-t"); }
        public String getNoGpuFlag() { return noGpuFlag; }
        public void setNoGpuFlag(String s) { this.noGpuFlag = nullSafe(s, "--no-gpu"); }
        public String getFlashAttnFlag() { return flashAttnFlag; }
        public void setFlashAttnFlag(String s) { this.flashAttnFlag = nullSafe(s, "-fa"); }
        public String getSplitOnWordFlag() { return splitOnWordFlag; }
        public void setSplitOnWordFlag(String s) { this.splitOnWordFlag = nullSafe(s, "-su"); }
        public String getVadFlag() { return vadFlag; }
        public void setVadFlag(String s) { this.vadFlag = nullSafe(s, "--vad"); }
        public String getVadModelFlag() { return vadModelFlag; }
        public void setVadModelFlag(String s) { this.vadModelFlag = nullSafe(s, "--vad-model"); }
        public String getNoSpeechTholdFlag() { return noSpeechTholdFlag; }
        public void setNoSpeechTholdFlag(String s) { this.noSpeechTholdFlag = nullSafe(s, "--no-speech-thold"); }
        public String getLogprobTholdFlag() { return logprobTholdFlag; }
        public void setLogprobTholdFlag(String s) { this.logprobTholdFlag = nullSafe(s, "--logprob-thold"); }
        public String getEntropyTholdFlag() { return entropyTholdFlag; }
        public void setEntropyTholdFlag(String s) { this.entropyTholdFlag = nullSafe(s, "--entropy-thold"); }
        public String getMaxContextFlag() { return maxContextFlag; }
        public void setMaxContextFlag(String s) { this.maxContextFlag = nullSafe(s, "-mc"); }
        public String getMaxContextValueForNoContext() { return maxContextValueForNoContext; }
        public void setMaxContextValueForNoContext(String s) { this.maxContextValueForNoContext = nullSafe(s, "0"); }
        public List<String> getExtraArgs() { return extraArgs; }
        public void setExtraArgs(List<String> extraArgs) { this.extraArgs = extraArgs == null ? new ArrayList<>() : extraArgs; }

        private static String nullSafe(String s, String fallback) {
            return s == null || s.isBlank() ? fallback : s.trim();
        }
    }
}
