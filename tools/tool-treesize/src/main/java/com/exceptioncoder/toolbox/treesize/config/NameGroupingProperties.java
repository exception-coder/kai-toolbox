package com.exceptioncoder.toolbox.treesize.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 视频名称归类规则配置。默认规则覆盖绝大多数场景；这里只暴露用户最可能想调的参数。
 *
 * <ul>
 *   <li>{@code extra-noise-patterns}：用户自定义的额外去噪正则（用 Java Pattern 语法），
 *       会在内置规则之后再跑一遍，便于补充小众片源的命名习惯。</li>
 *   <li>{@code chinese-numeral-max}：中文数字 ↔ 阿拉伯数字转换的上限，超过此值视为无效集数。</li>
 * </ul>
 */
@ConfigurationProperties(prefix = "toolbox.name-grouping")
@Component
public class NameGroupingProperties {

    private List<String> extraNoisePatterns = List.of();
    private int chineseNumeralMax = 9999;

    public List<String> getExtraNoisePatterns() { return extraNoisePatterns; }
    public void setExtraNoisePatterns(List<String> extraNoisePatterns) {
        this.extraNoisePatterns = extraNoisePatterns == null ? List.of() : extraNoisePatterns;
    }

    public int getChineseNumeralMax() { return chineseNumeralMax; }
    public void setChineseNumeralMax(int chineseNumeralMax) { this.chineseNumeralMax = chineseNumeralMax; }
}
