package com.exceptioncoder.toolbox.foreconsult.service.orchestration;

import org.springframework.core.io.ClassPathResource;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** 随应用打包的咨询表达Skill，不读取用户目录或业务项目提供的指令。 */
public final class ConsultPlainWritingSkill {
    private static final String CONTENT = load();

    private ConsultPlainWritingSkill() { }

    public static String instructions() {
        return "\n【平台表达Skill：consult-plain-writing】\n" + CONTENT;
    }

    private static String load() {
        try {
            String content = new ClassPathResource("fore-consult-skills/consult-plain-writing/SKILL.md")
                    .getContentAsString(StandardCharsets.UTF_8).strip();
            if (content.isEmpty()) {
                throw new IllegalStateException("业务咨询表达Skill为空，请检查模块资源打包");
            }
            return content;
        } catch (IOException error) {
            throw new IllegalStateException("业务咨询表达Skill未打包，无法装配咨询提示词", error);
        }
    }
}
