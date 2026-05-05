package com.exceptioncoder.toolbox.lanshare.api.dto;

import java.util.List;

public record IceConfigResponse(List<IceServer> iceServers) {
    public record IceServer(String urls) {}
}
