package com.exceptioncoder.toolbox.webterm.api.dto;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type", visible = true)
@JsonSubTypes({
        @JsonSubTypes.Type(value = ClientMessage.Open.class,   name = "open"),
        @JsonSubTypes.Type(value = ClientMessage.Input.class,  name = "input"),
        @JsonSubTypes.Type(value = ClientMessage.Resize.class, name = "resize"),
        @JsonSubTypes.Type(value = ClientMessage.Close.class,  name = "close"),
})
public sealed interface ClientMessage
        permits ClientMessage.Open, ClientMessage.Input, ClientMessage.Resize, ClientMessage.Close {

    record Open(String shell, String cwd, int cols, int rows) implements ClientMessage {}

    record Input(String data) implements ClientMessage {}

    record Resize(int cols, int rows) implements ClientMessage {}

    record Close() implements ClientMessage {}
}
