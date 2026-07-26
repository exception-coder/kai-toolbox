package com.exceptioncoder.toolbox.eval.adapter;

import com.exceptioncoder.toolbox.eval.service.EvalPromptService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.ApplicationArguments;
import org.springframework.stereotype.Component;

/**
 * 首次启动时植入 bug-extraction 的 v1 提示词。
 * 已存在任何版本则不动——提示词的演进由用户在「提示词版本」里显式新增，代码不覆盖运行时资产。
 */
@Slf4j
@Component
public class BugExtractionPromptSeed implements ApplicationRunner {

    private static final String V1 = """
            你是业务系统咨询助手的 BUG 判定器。给定一轮「用户提问 + AI 回答」，判断其中是否暴露了被咨询业务系统的缺陷，
            并抽取结构化记录。

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
              "title": "一句话问题描述，不超过 40 字"
            }
            isBug 为 false 时，其余字段全部省略。
            """;

    private final EvalPromptService promptService;

    public BugExtractionPromptSeed(EvalPromptService promptService) {
        this.promptService = promptService;
    }

    @Override
    public void run(ApplicationArguments args) {
        boolean seeded = promptService.seedIfAbsent(BugExtractionAdapter.PROMPT_KEY, V1, "内置初始版本");
        if (seeded) {
            log.info("已植入 bug-extraction 提示词 v1");
        }
    }
}
