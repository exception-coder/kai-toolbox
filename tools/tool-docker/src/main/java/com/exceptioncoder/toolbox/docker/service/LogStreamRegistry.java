package com.exceptioncoder.toolbox.docker.service;

import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;

/** streamId → HostSshStream 映射，供 DELETE /streams/{id} 主动关闭。 */
@Component
public class LogStreamRegistry {

    private final ConcurrentHashMap<String, HostSshStream> streams = new ConcurrentHashMap<>();

    public void register(String streamId, HostSshStream stream) {
        streams.put(streamId, stream);
    }

    public void close(String streamId) {
        HostSshStream s = streams.remove(streamId);
        if (s != null) {
            s.close();
        }
    }

    public boolean contains(String streamId) {
        return streams.containsKey(streamId);
    }
}
