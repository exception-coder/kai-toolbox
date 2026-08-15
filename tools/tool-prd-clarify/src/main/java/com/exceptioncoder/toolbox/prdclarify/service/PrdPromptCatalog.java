package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdPromptDefinition;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdPromptPurpose;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.EnumMap;
import java.util.HexFormat;
import java.util.Map;

/** PRD Prompt 版本、资源路径和内容哈希的单一事实源。 */
@Service
public class PrdPromptCatalog {

    private static final Map<PrdPromptPurpose, PromptResource> RESOURCES = Map.of(
            PrdPromptPurpose.DOC_CHANGE_ANALYZER,
            new PromptResource("v3-plain-questions", "prompts/prd/doc-change-analyzer/v3-system.md"),
            PrdPromptPurpose.DOC_CHANGE_VERIFIER,
            new PromptResource("v1", "prompts/prd/doc-change-verifier/v1-system.md"),
            PrdPromptPurpose.PROGRESS_EVALUATION,
            new PromptResource("v1", "prompts/prd/progress-evaluation/v1-system.md")
    );

    private final Map<PrdPromptPurpose, PrdPromptDefinition> definitions;

    public PrdPromptCatalog() {
        EnumMap<PrdPromptPurpose, PrdPromptDefinition> loaded = new EnumMap<>(PrdPromptPurpose.class);
        RESOURCES.forEach((purpose, resource) -> loaded.put(purpose, load(purpose, resource)));
        this.definitions = Map.copyOf(loaded);
    }

    /** 返回指定用途当前启用的不可变 Prompt 定义。 */
    public PrdPromptDefinition get(PrdPromptPurpose purpose) {
        PrdPromptDefinition definition = definitions.get(purpose);
        if (definition == null) {
            throw new IllegalArgumentException("未登记的 PRD Prompt 用途: " + purpose);
        }
        return definition;
    }

    /** 返回双阶段文档分析协议使用的 Prompt 身份指纹。 */
    public String analysisProtocolFingerprint() {
        PrdPromptDefinition analyzer = get(PrdPromptPurpose.DOC_CHANGE_ANALYZER);
        PrdPromptDefinition verifier = get(PrdPromptPurpose.DOC_CHANGE_VERIFIER);
        return sha256(analyzer.version() + ":" + analyzer.sha256()
                + "\n" + verifier.version() + ":" + verifier.sha256());
    }

    private static PrdPromptDefinition load(PrdPromptPurpose purpose, PromptResource promptResource) {
        ClassPathResource resource = new ClassPathResource(promptResource.path());
        try {
            String content = resource.getContentAsString(StandardCharsets.UTF_8).strip();
            if (content.isBlank()) {
                throw new IllegalStateException("PRD Prompt 资源为空: " + promptResource.path());
            }
            return new PrdPromptDefinition(purpose, promptResource.version(), content, sha256(content));
        } catch (IOException error) {
            throw new IllegalStateException("读取 PRD Prompt 资源失败: " + promptResource.path(), error);
        }
    }

    private static String sha256(String content) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(content.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception error) {
            throw new IllegalStateException("计算 PRD Prompt 哈希失败", error);
        }
    }

    /** Catalog 内部的不可变资源注册项。 */
    private record PromptResource(String version, String path) {
    }
}
