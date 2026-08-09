package com.exceptioncoder.toolbox.foreconsult.config;

import com.exceptioncoder.toolbox.foreconsult.service.BugExtractionService;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultPromptService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * 启动时植入并升级 BUG 抽取提示词。
 *
 * <p>只在该 key 一个版本都没有时写入：提示词是运行期资产，人工调过之后不能被下次启动覆盖回去。
 * 想改口径请新增版本（{@code ConsultPromptService.addVersion}）而不是改这里的常量——
 * 改常量既覆盖不了已有数据，也会让代码与库里实际生效的内容对不上。
 */
@Component
public class BugExtractionPromptSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(BugExtractionPromptSeed.class);

    private static final String V1 = """
            你是业务系统咨询助手的 BUG 判定器。给定一轮「用户提问 + AI 回答」，判断其中是否暴露了
            被咨询业务系统的缺陷，并抽取结构化记录。

            判定口径：
            - 只有「被咨询的业务系统本身行为异常」才算 BUG（功能报错、数据不一致、配置缺失、权限异常）。
            - 用户不会用、需求咨询、AI 自己答错，都不算 BUG。
            - 无法确定时一律 isBug=false，宁可漏报不可误报。

            只输出 JSON，不要 Markdown 代码围栏，不要任何解释文字。格式：
            {
              "isBug": true | false,
              "type": "FUNCTION_BUG" | "DATA_ISSUE" | "CONFIG" | "PERMISSION" | "OTHER",
              "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
              "system": "系统名，如 ERP",
              "module": "模块名，如 采购订单",
              "title": "一句话问题描述，不超过 40 字",
              "reproduce": "复现步骤，没有就省略",
              "expected": "期望行为，没有就省略",
              "actual": "实际行为，没有就省略",
              "suspectArea": "疑似位置（菜单路径/接口/代码/表），没有就省略",
              "confidence": 0-100
            }
            isBug 为 false 时，其余字段全部省略。
            """;

    private static final String V2 = """
            你是业务系统咨询助手的 BUG 判定器。给定一轮「用户提问 + AI 回答」，判断其中是否已经暴露
            被咨询业务系统的缺陷，并抽取结构化记录。

            判定口径：
            - 被咨询系统出现功能异常、数据不一致、配置缺失或权限异常时，应判定为 BUG。
            - AI 回答明确出现“根因已确认”“系统缺少防重复或并发控制”“数据错位”“代码需要修复”等结论时，
              即使数据修复范围、受影响记录数量或最终处置方案仍待确认，也必须判定 isBug=true。
            - 必须区分“BUG 是否成立”和“修复范围是否确定”：后者尚待确认不能推翻已经成立的 BUG。
            - 用户不会用、普通需求咨询、AI 自己答错，或回答仅给出待验证猜测且没有确认系统异常时，不算 BUG。
            - 证据不足且回答未确认系统异常时，才判定 isBug=false。

            只输出 JSON，不要 Markdown 代码围栏，不要任何解释文字。格式：
            {
              "isBug": true | false,
              "type": "FUNCTION_BUG" | "DATA_ISSUE" | "CONFIG" | "PERMISSION" | "OTHER",
              "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
              "system": "系统名，如 ERP",
              "module": "模块名，如 采购订单",
              "title": "一句话问题描述，不超过 40 字",
              "reproduce": "复现步骤，没有就省略",
              "expected": "期望行为，没有就省略",
              "actual": "实际行为，没有就省略",
              "suspectArea": "疑似位置（菜单路径/接口/代码/表），没有就省略",
              "confidence": 0-100
            }
            isBug 为 false 时，其余字段全部省略。
            """;

    private final ConsultPromptService promptService;

    public BugExtractionPromptSeed(ConsultPromptService promptService) {
        this.promptService = promptService;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (promptService.seedIfAbsent(BugExtractionService.PROMPT_KEY, V1, "内置初始版本")) {
            log.info("[fore-consult] 已植入 BUG 抽取提示词 {} v1", BugExtractionService.PROMPT_KEY);
        }
        int latestVersion = promptService.listVersions(BugExtractionService.PROMPT_KEY).stream()
                .mapToInt(prompt -> prompt.getVersion())
                .max()
                .orElse(0);
        if (latestVersion == 1) {
            promptService.addVersion(BugExtractionService.PROMPT_KEY, V2,
                    "区分 BUG 成立与修复范围待确认", true);
            log.info("[fore-consult] 已升级并激活 BUG 抽取提示词 {} v2", BugExtractionService.PROMPT_KEY);
        }
    }
}
