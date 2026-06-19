package com.exceptioncoder.toolbox.aichat.api;

import com.exceptioncoder.toolbox.aichat.api.dto.VideoGenRequest;
import com.exceptioncoder.toolbox.aichat.api.dto.VideoTask;
import com.exceptioncoder.toolbox.aichat.service.VideoService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 视频生成（异步）：提交 {@code POST /api/ai-chat/videos}，轮询 {@code GET /api/ai-chat/videos/{id}}。 */
@RestController
@RequestMapping("/api/ai-chat/videos")
public class VideoController {

    private final VideoService videos;

    public VideoController(VideoService videos) {
        this.videos = videos;
    }

    @PostMapping
    public VideoTask submit(@RequestBody VideoGenRequest req) {
        return videos.submit(req);
    }

    @GetMapping("/{id}")
    public VideoTask query(@PathVariable String id) {
        return videos.query(id);
    }
}
