package com.exceptioncoder.toolbox.resume.config;

import com.exceptioncoder.toolbox.resume.mcp.ResumeMcpTools;
import org.springframework.ai.tool.ToolCallbackProvider;
import org.springframework.ai.tool.method.MethodToolCallbackProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 把 {@link ResumeMcpTools} 的 {@code @Tool} 方法注册到 Spring AI MCP server。
 * MCP server 的 SSE 端点由 {@code spring-ai-starter-mcp-server-webmvc} 自动挂在主端口(:18080)。
 */
@Configuration
public class ResumeMcpConfig {

    @Bean
    public ToolCallbackProvider resumeToolCallbackProvider(ResumeMcpTools resumeMcpTools) {
        return MethodToolCallbackProvider.builder()
                .toolObjects(resumeMcpTools)
                .build();
    }
}
