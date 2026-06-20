package com.exceptioncoder.toolbox.llm.monitor.api;

import com.exceptioncoder.toolbox.llm.monitor.dto.CallFilter;
import com.exceptioncoder.toolbox.llm.monitor.dto.CallRow;
import com.exceptioncoder.toolbox.llm.monitor.dto.PageResult;
import com.exceptioncoder.toolbox.llm.monitor.dto.QuotaSnapshot;
import com.exceptioncoder.toolbox.llm.monitor.dto.SummaryResult;
import com.exceptioncoder.toolbox.llm.monitor.dto.TimeseriesResult;
import com.exceptioncoder.toolbox.llm.monitor.service.LlmMonitorService;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;

/**
 * LLM 网关监控只读查询接口。本地单用户、无鉴权（遵循项目约定）。
 * 时间参数 from/to 接受 ISO-8601（OffsetDateTime / Instant / yyyy-MM-dd），缺省=今日。
 */
@RestController
@RequestMapping("/api/llm/monitor")
public class LlmMonitorController {

    private final LlmMonitorService service;
    private final ZoneId zone = ZoneId.systemDefault();

    public LlmMonitorController(LlmMonitorService service) {
        this.service = service;
    }

    @GetMapping("/summary")
    public SummaryResult summary(@RequestParam(required = false) String from,
                                 @RequestParam(required = false) String to,
                                 @RequestParam(required = false, defaultValue = "model") String groupBy) {
        return service.summary(parseMs(from), parseMs(to), groupBy);
    }

    @GetMapping("/timeseries")
    public TimeseriesResult timeseries(@RequestParam(required = false) String from,
                                       @RequestParam(required = false) String to,
                                       @RequestParam(required = false, defaultValue = "hour") String bucket,
                                       @RequestParam(required = false, defaultValue = "tokens") String metric) {
        return service.timeseries(parseMs(from), parseMs(to), bucket, metric);
    }

    @GetMapping("/calls")
    public PageResult<CallRow> calls(@RequestParam(required = false) String from,
                                     @RequestParam(required = false) String to,
                                     @RequestParam(required = false) String status,
                                     @RequestParam(required = false) String modelId,
                                     @RequestParam(required = false) String toolId,
                                     @RequestParam(required = false, defaultValue = "0") int page,
                                     @RequestParam(required = false, defaultValue = "50") int size) {
        CallFilter filter = new CallFilter(parseMs(from), parseMs(to),
                StringUtils.hasText(status) ? status : null,
                StringUtils.hasText(modelId) ? modelId : null,
                StringUtils.hasText(toolId) ? toolId : null);
        return service.calls(filter, page, size);
    }

    @GetMapping("/slow")
    public List<CallRow> slow(@RequestParam(required = false) String from,
                              @RequestParam(required = false) String to,
                              @RequestParam(required = false, defaultValue = "20") int limit) {
        return service.slow(parseMs(from), parseMs(to), limit);
    }

    @GetMapping("/quota")
    public QuotaSnapshot quota() {
        return service.quota();
    }

    /** 宽松解析 ISO-8601 时间为 epoch 毫秒；空返回 null。支持带偏移时间 / Instant / 纯日期。 */
    private Long parseMs(String s) {
        if (!StringUtils.hasText(s)) {
            return null;
        }
        String v = s.trim();
        try {
            return OffsetDateTime.parse(v).toInstant().toEpochMilli();
        } catch (Exception ignore) {
            // 继续尝试其它格式
        }
        try {
            return Instant.parse(v).toEpochMilli();
        } catch (Exception ignore) {
            // 继续尝试纯日期
        }
        try {
            return LocalDate.parse(v).atStartOfDay(zone).toInstant().toEpochMilli();
        } catch (Exception ex) {
            throw new IllegalArgumentException("无法解析时间参数: " + s);
        }
    }
}
