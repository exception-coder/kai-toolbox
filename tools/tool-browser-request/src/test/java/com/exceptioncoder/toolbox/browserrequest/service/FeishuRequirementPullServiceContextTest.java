package com.exceptioncoder.toolbox.browserrequest.service;

import com.exceptioncoder.toolbox.browserrequest.config.BrowserSessionManager;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class FeishuRequirementPullServiceContextTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withBean(BrowserSessionManager.class, () -> mock(BrowserSessionManager.class))
            .withBean(ObjectMapper.class, ObjectMapper::new)
            .withBean(FeishuRequirementPullService.class);

    @Test
    void createsServiceThroughSpringConstructorInjection() {
        contextRunner.run(context ->
                assertThat(context).hasSingleBean(FeishuRequirementPullService.class));
    }
}
