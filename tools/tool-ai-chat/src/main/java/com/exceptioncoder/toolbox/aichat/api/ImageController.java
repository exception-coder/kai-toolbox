package com.exceptioncoder.toolbox.aichat.api;

import com.exceptioncoder.toolbox.aichat.api.dto.ImageGenRequest;
import com.exceptioncoder.toolbox.aichat.api.dto.ImageGenResult;
import com.exceptioncoder.toolbox.aichat.service.ImageService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 绘图：{@code POST /api/ai-chat/images}，同步返回图片地址。 */
@RestController
@RequestMapping("/api/ai-chat/images")
public class ImageController {

    private final ImageService images;

    public ImageController(ImageService images) {
        this.images = images;
    }

    @PostMapping
    public ImageGenResult generate(@RequestBody ImageGenRequest req) {
        return images.generate(req);
    }
}
