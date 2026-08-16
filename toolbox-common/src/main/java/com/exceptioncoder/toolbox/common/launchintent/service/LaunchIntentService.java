package com.exceptioncoder.toolbox.common.launchintent.service;

import com.exceptioncoder.toolbox.common.launchintent.domain.LaunchIntent;
import com.exceptioncoder.toolbox.common.launchintent.domain.LaunchIntentState;
import com.exceptioncoder.toolbox.common.launchintent.repository.LaunchIntentRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.Set;
import java.util.UUID;

/** 创建、读取和推进 LaunchIntent 生命周期。 */
@Service
public class LaunchIntentService {

    public static final int PROTOCOL_VERSION = 1;
    private static final int MAX_PAYLOAD_BYTES = 65_536;
    private static final int MAX_ERROR_CHARS = 500;
    private static final Duration TIME_TO_LIVE = Duration.ofMinutes(30);
    private static final Set<String> SUPPORTED_TYPES = Set.of(
            "CHAT_OPEN_DRAFT", "CHAT_OPEN_AND_SEND", "CHAT_OPEN_PANEL");

    private final LaunchIntentRepository repository;
    private final Clock clock;

    @Autowired
    public LaunchIntentService(LaunchIntentRepository repository) {
        this(repository, Clock.systemUTC());
    }

    LaunchIntentService(LaunchIntentRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    public LaunchIntent create(int protocolVersion, String type, String payloadJson) {
        validate(protocolVersion, type, payloadJson);
        long now = clock.millis();
        LaunchIntent intent = new LaunchIntent(
                UUID.randomUUID().toString(), protocolVersion, type, payloadJson,
                LaunchIntentState.PENDING, null, now, now + TIME_TO_LIVE.toMillis(), null, now);
        repository.insert(intent);
        return intent;
    }

    public LaunchIntent getExecutable(String id) {
        LaunchIntent intent = requireIntent(id);
        if (intent.expiresAt() <= clock.millis()
                && intent.state() != LaunchIntentState.ACKED
                && intent.state() != LaunchIntentState.EXPIRED) {
            repository.updateState(intent.id(), LaunchIntentState.EXPIRED, "启动意图已过期", null, clock.millis());
            throw conflict("启动意图已过期");
        }
        if (intent.state() == LaunchIntentState.ACKED) {
            throw conflict("启动意图已经消费");
        }
        if (intent.state() == LaunchIntentState.EXPIRED) {
            throw conflict("启动意图已过期");
        }
        return intent;
    }

    public LaunchIntent acknowledge(String id) {
        LaunchIntent intent = requireIntent(id);
        if (intent.state() == LaunchIntentState.ACKED) {
            return intent;
        }
        if (intent.state() == LaunchIntentState.EXPIRED || intent.expiresAt() <= clock.millis()) {
            repository.updateState(intent.id(), LaunchIntentState.EXPIRED, "启动意图已过期", null, clock.millis());
            throw conflict("启动意图已过期");
        }
        long now = clock.millis();
        repository.updateState(intent.id(), LaunchIntentState.ACKED, null, now, now);
        return requireIntent(id);
    }

    public LaunchIntent fail(String id, String error) {
        LaunchIntent intent = getExecutable(id);
        long now = clock.millis();
        repository.updateState(intent.id(), LaunchIntentState.FAILED, abbreviate(error), null, now);
        return requireIntent(id);
    }

    private LaunchIntent requireIntent(String id) {
        if (id == null || id.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "启动意图 ID 不能为空");
        }
        return repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "启动意图不存在"));
    }

    private void validate(int protocolVersion, String type, String payloadJson) {
        if (protocolVersion != PROTOCOL_VERSION) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "不支持的 LaunchIntent 协议版本");
        }
        if (!SUPPORTED_TYPES.contains(type)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "不支持的 LaunchIntent 类型");
        }
        if (payloadJson == null || payloadJson.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "LaunchIntent payload 不能为空");
        }
        if (payloadJson.getBytes(StandardCharsets.UTF_8).length > MAX_PAYLOAD_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "LaunchIntent payload 超过 64 KiB");
        }
    }

    private String abbreviate(String error) {
        String message = error == null || error.isBlank() ? "启动意图执行失败" : error.strip();
        return message.length() <= MAX_ERROR_CHARS ? message : message.substring(0, MAX_ERROR_CHARS);
    }

    private ResponseStatusException conflict(String reason) {
        return new ResponseStatusException(HttpStatus.CONFLICT, reason);
    }
}
