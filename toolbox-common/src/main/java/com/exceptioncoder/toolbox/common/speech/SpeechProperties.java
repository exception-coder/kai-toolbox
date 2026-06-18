package com.exceptioncoder.toolbox.common.speech;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 语音转写共享配置。指向本机 faster-whisper ASR 服务，多个工具（字幕、claude-chat 语音输入）共用。
 * 默认端口与 tool-treesize 的字幕 ASR 服务保持一致，单机通常一份服务即可。
 */
@Data
@Component
@ConfigurationProperties(prefix = "toolbox.speech")
public class SpeechProperties {

    /** faster-whisper ASR 服务基地址，仅本机。 */
    private String asrBaseUrl = "http://127.0.0.1:9500";

    /** 单次转写最长等待秒数，0 = 不限。 */
    private long timeoutSeconds = 120;

    /** 本地 Kokoro TTS（文字转语音）服务基地址，仅本机。 */
    private String ttsBaseUrl = "http://127.0.0.1:9600";

    /** 默认音色（Kokoro voice id），中文女声。 */
    private String ttsVoice = "zf_xiaobei";

    /** 单次合成最长等待秒数，0 = 不限。 */
    private long ttsTimeoutSeconds = 60;
}
