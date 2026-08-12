package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 将 PRD 文本中的本地图片引用转换为受预算约束的 Agent 图片输入。
 */
@Slf4j
@Component
public class PrdImageInputResolver {

    /** 粘贴图片使用的 Markdown 引用格式。 */
    private static final Pattern PASTED_IMAGE_PATTERN =
            Pattern.compile("!\\[[^]]*]\\(/api/prd-clarify/attachments/image/([a-zA-Z0-9_]+)\\)");

    /** 单次 Agent 调用最多携带的图片数量。 */
    private static final int MAX_IMAGES_PER_CALL = 6;

    /** 单次 Agent 调用允许读取的图片原始字节总量。 */
    private static final long MAX_TOTAL_IMAGE_BYTES = 5L * 1024 * 1024;

    /** Agent 多模态接口支持的图片 MIME。 */
    private static final Set<String> SUPPORTED_IMAGE_MIME =
            Set.of("image/jpeg", "image/png", "image/gif", "image/webp");

    /** 图片附件存储能力。 */
    private final ImageAttachmentStorageService imageAttachmentStorage;

    /**
     * 创建图片输入解析器。
     *
     * @param imageAttachmentStorage 图片附件存储能力
     */
    public PrdImageInputResolver(ImageAttachmentStorageService imageAttachmentStorage) {
        this.imageAttachmentStorage = imageAttachmentStorage;
    }

    /**
     * 解析文本中的唯一图片引用，过滤不支持或超出预算的图片。
     *
     * @param rawInput PRD 原始需求文本
     * @return 可安全交给 Agent 的图片输入
     */
    public List<AgentOneShotRunner.ImageInput> resolve(String rawInput) {
        if (rawInput == null || rawInput.isBlank()) {
            return List.of();
        }

        Set<String> imageIds = collectImageIds(rawInput);
        if (imageIds.isEmpty()) {
            return List.of();
        }

        return loadImages(imageIds);
    }

    /**
     * 按出现顺序收集不重复的图片 ID。
     */
    private static Set<String> collectImageIds(String rawInput) {
        Matcher matcher = PASTED_IMAGE_PATTERN.matcher(rawInput);
        Set<String> imageIds = new LinkedHashSet<>();
        while (matcher.find() && imageIds.size() < MAX_IMAGES_PER_CALL) {
            imageIds.add(matcher.group(1));
        }
        return imageIds;
    }

    /**
     * 读取通过校验且未超过总预算的图片。
     */
    private List<AgentOneShotRunner.ImageInput> loadImages(Set<String> imageIds) {
        List<AgentOneShotRunner.ImageInput> images = new ArrayList<>();
        long totalBytes = 0;
        for (String imageId : imageIds) {
            try {
                ImageAttachmentStorageService.DownloadFile file = imageAttachmentStorage.locate(imageId);
                if (!SUPPORTED_IMAGE_MIME.contains(file.mime())) {
                    log.warn("[prd-clarify] 粘贴图片 {} MIME={} 不受多模态支持，跳过", imageId, file.mime());
                    continue;
                }

                long imageBytes = Files.size(file.path());
                if (totalBytes + imageBytes > MAX_TOTAL_IMAGE_BYTES) {
                    log.warn("[prd-clarify] 粘贴图片总大小超出单次调用预算（{}MB），后续图片不再随请求发送",
                            MAX_TOTAL_IMAGE_BYTES / 1024 / 1024);
                    break;
                }

                images.add(toImageInput(file));
                totalBytes += imageBytes;
            } catch (Exception e) {
                log.warn("[prd-clarify] 读取粘贴图片 {} 失败，跳过", imageId, e);
            }
        }
        return images;
    }

    /**
     * 将已定位图片转换为 Base64 Agent 输入。
     */
    private static AgentOneShotRunner.ImageInput toImageInput(ImageAttachmentStorageService.DownloadFile file)
            throws IOException {
        byte[] bytes = Files.readAllBytes(file.path());
        return new AgentOneShotRunner.ImageInput(Base64.getEncoder().encodeToString(bytes), file.mime());
    }
}
