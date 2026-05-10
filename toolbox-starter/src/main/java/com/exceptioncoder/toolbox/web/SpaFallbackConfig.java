package com.exceptioncoder.toolbox.web;

import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;

/**
 * SPA 路由兜底：让 React Router v7 的 /tools/treesize 等深链直接访问也能加载到 index.html。
 *
 * 兜底规则（按优先级）：
 *   1. /api/** —— 显式拒绝。controller 已匹配的请求到不了这里；到这里说明真 404，
 *      绝不能返回 index.html（否则前端 fetch 会拿到一坨 HTML 解析失败）。
 *   2. 命中真实静态文件 —— 直接返回。
 *   3. 路径含 "." 且未命中 —— 视为缺失的静态资源（图片/js/字体），返回 null 走默认 404。
 *   4. 路径不含 "." 且未命中 —— 视为 SPA 路由，forward 到 /index.html。
 *
 * GET / 由 Spring Boot 内置 WelcomePageHandlerMapping 处理，不需要这里管。
 */
@Configuration
public class SpaFallbackConfig implements WebMvcConfigurer {

    /** 与 Spring Boot 默认 spring.web.resources.static-locations 保持一致，避免覆盖时漏掉。 */
    private static final String[] STATIC_LOCATIONS = {
            "classpath:/META-INF/resources/",
            "classpath:/resources/",
            "classpath:/static/",
            "classpath:/public/"
    };

    /** 前端打包产物会被 frontend-maven-plugin → maven-resources-plugin 拷到这里。 */
    private static final String INDEX_HTML = "/static/index.html";

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
                .addResourceLocations(STATIC_LOCATIONS)
                .resourceChain(true)
                .addResolver(new SpaPathResourceResolver());
    }

    private static final class SpaPathResourceResolver extends PathResourceResolver {
        @Override
        protected Resource getResource(String resourcePath, Resource location) throws IOException {
            if (resourcePath.startsWith("api/")) {
                return null;
            }
            Resource requested = location.createRelative(resourcePath);
            if (requested.exists() && requested.isReadable()) {
                return requested;
            }
            if (resourcePath.contains(".")) {
                return null;
            }
            return new ClassPathResource(INDEX_HTML);
        }
    }
}
