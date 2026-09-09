package com.exceptioncoder.forge.quality.mcp;

import io.modelcontextprotocol.json.McpJsonDefaults;
import io.modelcontextprotocol.server.McpServer;
import io.modelcontextprotocol.server.transport.StdioServerTransportProvider;
import io.modelcontextprotocol.spec.McpSchema;

import java.util.concurrent.CountDownLatch;

/** stdio MCP server entry point for coding agents. */
public final class ForgeQualityMcpServer {
    private ForgeQualityMcpServer() {
    }

    /** Starts the protocol server. Standard output is reserved for MCP frames. */
    public static void main(String[] args) throws InterruptedException {
        ForgeVerifyTool tool = new ForgeVerifyTool();
        StdioServerTransportProvider transport = new StdioServerTransportProvider(McpJsonDefaults.getMapper());
        McpServer.sync(transport)
                .serverInfo("forge-quality-mcp", "0.1.0")
                .instructions("Use forge_verify as the single verification entry point.")
                .capabilities(McpSchema.ServerCapabilities.builder().tools(false).build())
                .toolCall(tool.specification(), (exchange, request) -> tool.call(request.arguments()))
                .build();
        new CountDownLatch(1).await();
    }
}
