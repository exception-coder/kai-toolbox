package com.exceptioncoder.toolbox.lanshare.api;

import com.exceptioncoder.toolbox.lanshare.api.dto.IceConfigResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/lan-share")
public class LanShareController {

    @GetMapping("/health")
    public ResponseEntity<Void> health() {
        return ResponseEntity.ok().build();
    }

    @GetMapping("/ice-config")
    public IceConfigResponse iceConfig() {
        return new IceConfigResponse(List.of(
                new IceConfigResponse.IceServer("stun:stun.l.google.com:19302")
        ));
    }
}
