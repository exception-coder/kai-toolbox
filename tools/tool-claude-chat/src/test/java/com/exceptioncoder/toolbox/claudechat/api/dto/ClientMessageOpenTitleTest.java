package com.exceptioncoder.toolbox.claudechat.api.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class ClientMessageOpenTitleTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void readsOptionalTitleAndKeepsOldOpenMessagesCompatible() throws Exception {
        ClientMessage.Open named = (ClientMessage.Open) mapper.readValue(
                "{\"type\":\"open\",\"cwd\":\"D:/work/project\",\"title\":\"新会话\"}", ClientMessage.class);
        ClientMessage.Open old = (ClientMessage.Open) mapper.readValue(
                "{\"type\":\"open\",\"cwd\":\"D:/work/project\"}", ClientMessage.class);

        assertThat(named.cwd()).isEqualTo("D:/work/project");
        assertThat(named.title()).isEqualTo("新会话");
        assertThat(old.title()).isNull();
    }
}
