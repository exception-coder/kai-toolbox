package com.exceptioncoder.toolbox.treesize.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

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
     * Pass {@code -fa} to whisper-cli when GPU is enabled. Flash Attention is a CUDA-only
     * fused-kernel implementation of attention that produces numerically identical output
     * 30-50% faster. Safe to leave on for any cuBLAS / CUDA build of whisper.cpp; CPU builds
     * silently ignore the flag.
     */
    private boolean flashAttention = true;
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

    public String getDefaultInitialPrompt() { return defaultInitialPrompt; }
    public void setDefaultInitialPrompt(String defaultInitialPrompt) {
        this.defaultInitialPrompt = defaultInitialPrompt == null ? "" : defaultInitialPrompt;
    }

    public String getVadModelPath() { return vadModelPath; }
    public void setVadModelPath(String vadModelPath) {
        this.vadModelPath = vadModelPath == null ? "" : vadModelPath.trim();
    }

    public boolean isAvailable() {
        return !binary.isEmpty() && !modelPath.isEmpty();
    }
}
