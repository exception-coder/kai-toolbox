package com.regentech_fashion.wyoooni.application.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.Map;

/** 独立 H5 的运行时配置和 History 路由回退。 */
@Controller
public class StandaloneWebConfiguration {
    private final String brandName;

    public StandaloneWebConfiguration(@Value("${regentech.wyoooni.brand-name:织联协同}") String brandName) {
        this.brandName = brandName;
    }

    /** 返回不含密钥的浏览器运行时配置。 */
    @GetMapping("/runtime-config.json")
    @ResponseBody
    public Map<String, String> runtimeConfig() {
        return Map.of("mode", "http", "apiBaseUrl", "", "brandName", brandName);
    }

    /** 将 H5 客户端路由交给 React Router。 */
    @GetMapping({"/", "/q/{ticket}", "/register/{ticket}", "/bind-account", "/bind-scm"})
    public String h5() { return "forward:/index.html"; }
}
