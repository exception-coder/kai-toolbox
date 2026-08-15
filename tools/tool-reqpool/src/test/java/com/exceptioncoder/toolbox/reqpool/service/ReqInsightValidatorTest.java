package com.exceptioncoder.toolbox.reqpool.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReqInsightValidatorTest {

    private final ReqInsightValidator validator = new ReqInsightValidator(new ObjectMapper());

    @Test
    void acceptsCompleteItemInsight() {
        String validated = validator.validateItem("""
                {"priority":"HIGH","stars":4,"recommendation":"建议投入","reason":"业务价值明确",
                 "impacts":["订单"],"roi":"HIGH","estimatedHours":24}
                """);

        assertThat(validated).contains("\"priority\":\"HIGH\"");
    }

    @Test
    void rejectsInvalidItemEnumsAndNumbers() {
        assertThatThrownBy(() -> validator.validateItem("""
                {"priority":"URGENT","stars":8,"recommendation":"投入","reason":"价值高",
                 "impacts":["订单"],"roi":"HIGH","estimatedHours":-1}
                """))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("priority");
    }

    @Test
    void rejectsForeignIdsBeforePortfolioPersistence() {
        assertThatThrownBy(() -> validator.validatePortfolio("""
                {"portfolioSummary":"先做核心链路","items":[
                  {"id":"outside","rank":1,"priority":"HIGH","stars":4,
                   "recommendation":"投入","reason":"价值高","impacts":["订单"],
                   "roi":"HIGH","estimatedHours":12,"comparedTo":"影响更广"}
                ]}
                """, Set.of("req-1")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("输入集合外");
    }

    @Test
    void rejectsDuplicatePortfolioRanks() {
        assertThatThrownBy(() -> validator.validatePortfolio("""
                {"portfolioSummary":"排序完成","items":[
                  {"id":"req-1","rank":1,"priority":"HIGH","stars":4,"recommendation":"先做",
                   "reason":"价值高","impacts":["订单"],"roi":"HIGH","estimatedHours":12,"comparedTo":"影响更广"},
                  {"id":"req-2","rank":1,"priority":"MEDIUM","stars":3,"recommendation":"后做",
                   "reason":"价值一般","impacts":["报表"],"roi":"MEDIUM","estimatedHours":8,"comparedTo":"影响较小"}
                ]}
                """, Set.of("req-1", "req-2")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("重复排名");
    }
}
