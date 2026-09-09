package com.exceptioncoder.forge.quality.cli;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ForgeQualityCliTest {
    @TempDir
    Path project;
    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void detectProducesAgentReadableJson() throws IOException {
        Files.writeString(project.resolve("pom.xml"), "<project><artifactId>mybatis</artifactId></project>");
        ByteArrayOutputStream output = new ByteArrayOutputStream();

        int exitCode = ForgeQualityCli.run(new String[]{"quality", "detect", "--project", project.toString(),
                "--format", "json"}, new PrintStream(output), System.err);

        String json = output.toString(StandardCharsets.UTF_8);
        assertEquals(0, exitCode);
        assertTrue(json.contains("forge-quality-java"));
        assertTrue(json.contains("persistence.mybatis"));
    }

    @Test
    void staticFailureSkipsRuntimeWithoutLoadingRuntimeConfiguration() throws IOException {
        Files.writeString(project.resolve("pom.xml"), "<project><artifactId>mybatis</artifactId></project>");
        Path mapper = project.resolve("src/main/java/example/QuoteMapper.java");
        Files.createDirectories(mapper.getParent());
        Files.writeString(mapper, """
                package example;
                import org.apache.ibatis.annotations.Param;
                interface QuoteMapper { Object find(@Param("id") Long id, @Param("state") String state); }
                """);
        Path xml = project.resolve("src/main/resources/QuoteMapper.xml");
        Files.createDirectories(xml.getParent());
        Files.writeString(xml, """
                <mapper namespace="example.QuoteMapper">
                  <select id="find">SELECT id FROM quote WHERE id = #{missing}</select>
                </mapper>
                """);
        ByteArrayOutputStream output = new ByteArrayOutputStream();

        int exitCode = ForgeQualityCli.run(new String[]{"verify", "--project", project.toString(),
                "--format", "json"}, new PrintStream(output), System.err);

        String json = output.toString(StandardCharsets.UTF_8);
        assertEquals(1, exitCode);
        assertTrue(json.contains("\"staticStatus\":\"FAILED\""));
        assertTrue(json.contains("\"runtimeStatus\":\"SKIPPED\""));
    }

    @Test
    void runtimePhaseExecutesConfiguredApiScenario() throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/health", exchange -> {
            byte[] body = "{\"status\":\"UP\"}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        Path config = project.resolve(".forge/verify.yml");
        Files.createDirectories(config.getParent());
        Files.writeString(config, """
                runtime:
                  scenarios:
                    - id: health
                      type: api
                      url: http://127.0.0.1:%d/health
                      expectStatus: 200
                      requiredJsonPaths:
                        - status
                """.formatted(server.getAddress().getPort()));
        ByteArrayOutputStream output = new ByteArrayOutputStream();

        int exitCode = ForgeQualityCli.run(new String[]{"verify", "runtime", "--project", project.toString(),
                "--format", "json"}, new PrintStream(output), System.err);

        String json = output.toString(StandardCharsets.UTF_8);
        assertEquals(0, exitCode);
        assertTrue(json.contains("\"runtimeStatus\":\"PASSED\""));
        assertTrue(json.contains("API-RUNTIME-001"));
    }
}
