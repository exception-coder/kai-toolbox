package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.service.ErpMiniProgramConfigService.EnvironmentMode;
import com.exceptioncoder.toolbox.claudechat.service.ErpMiniProgramConfigService.EnvironmentView;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/** ERP 小程序运行模式切换服务测试。 */
class ErpMiniProgramConfigServiceTest {

    @TempDir
    Path temporaryDirectory;

    private String originalUserHome;
    private Path project;
    private ErpMiniProgramConfigService service;

    @BeforeEach
    void setUp() throws IOException {
        originalUserHome = System.getProperty("user.home");
        System.setProperty("user.home", temporaryDirectory.resolve("home").toString());
        project = temporaryDirectory.resolve("mini-program");
        Files.createDirectories(project);
        Files.writeString(project.resolve("project.config.json"), "{\"appid\":\"wx1111111111111111\"}");
        Files.writeString(project.resolve("app.json"), """
                {"pages":[],"plugins":{"WechatSI":{"version":"0.3.6","provider":"wx069ba97219f66d99"}}}
                """);
        Files.writeString(project.resolve("app.js"), """
                App({
                  globalData: {
                    url: wx.getStorageSync('selectedUrl') ? wx.getStorageSync('selectedUrl') : "https://old.example.com",
                  }
                })
                """);
        service = new ErpMiniProgramConfigService(new ObjectMapper());
    }

    @AfterEach
    void tearDown() {
        System.setProperty("user.home", originalUserHome);
    }

    @Test
    void appliesTestModeAndRestoresOriginalFiles() throws IOException {
        String originalProjectConfig = Files.readString(project.resolve("project.config.json"));
        String originalAppConfig = Files.readString(project.resolve("app.json"));
        String originalAppSource = Files.readString(project.resolve("app.js"));

        EnvironmentView test = service.apply(project.toString(), EnvironmentMode.TEST, "http://127.0.0.1:9090/");

        assertThat(test.mode()).isEqualTo(EnvironmentMode.TEST);
        assertThat(test.currentAppId()).isEqualTo("wxe46ae72760c1b8e9");
        assertThat(test.apiBaseUrl()).isEqualTo("http://127.0.0.1:9090");
        assertThat(test.wechatSiEnabled()).isFalse();
        assertThat(Files.readString(project.resolve("app.js"))).doesNotContain("selectedUrl");

        service.restore(project.toString());

        assertThat(Files.readString(project.resolve("project.config.json"))).isEqualTo(originalProjectConfig);
        assertThat(Files.readString(project.resolve("app.json"))).isEqualTo(originalAppConfig);
        assertThat(Files.readString(project.resolve("app.js"))).isEqualTo(originalAppSource);
    }

    @Test
    void appliesFormalModeAsOneConfigurationSet() {
        EnvironmentView formal = service.apply(project.toString(), EnvironmentMode.FORMAL, "");

        assertThat(formal.mode()).isEqualTo(EnvironmentMode.FORMAL);
        assertThat(formal.currentAppId()).isEqualTo("wxfb0d50888e966b01");
        assertThat(formal.apiBaseUrl()).isEqualTo("https://wyoooni.net");
        assertThat(formal.wechatSiEnabled()).isTrue();
    }
}
