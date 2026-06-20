package com.exceptioncoder.toolbox.llm.config;

import com.exceptioncoder.toolbox.llm.model.ModelSpec;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

/**
 * 共享 LLM 网关配置：toolbox.llm.models 列出模型池成员。
 * 未配置任何成员时，路由器兜底用本地 Ollama，保证开箱即用。
 */
@Data
@ConfigurationProperties("toolbox.llm")
public class LlmProperties {

    private List<ModelSpec> models = new ArrayList<>();

    /** 网关监控配置（token/成本计量、调用追踪、配额告警）。 */
    private MonitorProperties monitor = new MonitorProperties();
}
