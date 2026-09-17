package com.exceptioncoder.toolbox.common.exception;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mock.web.MockServletContext;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 验证真实 MVC 静态资源兜底不会把已移除接口误报为服务器错误。 */
class GlobalExceptionHandlerTest {

    @Test
    void missingResourceReturnsNotFoundWhileRegisteredEndpointStillWorks() throws Exception {
        try (var context = new AnnotationConfigWebApplicationContext()) {
            context.setServletContext(new MockServletContext());
            context.register(WebConfig.class);
            context.refresh();
            var mvc = MockMvcBuilders.webAppContextSetup(context).build();

            mvc.perform(get("/api/supplier-quote/public/wechat/session"))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.status").value(404))
                    .andExpect(jsonPath("$.error").value("Not Found"));
            mvc.perform(get("/api/health"))
                    .andExpect(status().isOk());
        }
    }

    /** 使用真实资源处理器产生 NoResourceFoundException。 */
    @Configuration
    @EnableWebMvc
    static class WebConfig implements WebMvcConfigurer {
        @Override
        public void addResourceHandlers(ResourceHandlerRegistry registry) {
            registry.addResourceHandler("/**").addResourceLocations("classpath:/static/");
        }

        @Bean
        GlobalExceptionHandler exceptionHandler() {
            return new GlobalExceptionHandler();
        }

        @Bean
        HealthController healthController() {
            return new HealthController();
        }
    }

    /** 正常路由对照。 */
    @RestController
    static class HealthController {
        @GetMapping("/api/health")
        String health() {
            return "ok";
        }
    }
}
