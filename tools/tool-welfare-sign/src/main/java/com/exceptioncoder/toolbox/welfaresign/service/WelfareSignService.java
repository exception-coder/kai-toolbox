package com.exceptioncoder.toolbox.welfaresign.service;

import com.exceptioncoder.toolbox.welfaresign.api.dto.WelfareSignDtos.ConfigRequest;
import com.exceptioncoder.toolbox.welfaresign.api.dto.WelfareSignDtos.ConfigView;
import com.exceptioncoder.toolbox.welfaresign.api.dto.WelfareSignDtos.EmployeeRequest;
import com.exceptioncoder.toolbox.welfaresign.api.dto.WelfareSignDtos.EmployeeView;
import com.exceptioncoder.toolbox.welfaresign.api.dto.WelfareSignDtos.LoginRequest;
import com.exceptioncoder.toolbox.welfaresign.api.dto.WelfareSignDtos.LoginResponse;
import com.exceptioncoder.toolbox.welfaresign.api.dto.WelfareSignDtos.SignRecordView;
import com.exceptioncoder.toolbox.welfaresign.api.dto.WelfareSignDtos.SignRequest;
import com.exceptioncoder.toolbox.welfaresign.api.dto.WelfareSignDtos.SignResponse;
import com.exceptioncoder.toolbox.welfaresign.repository.WelfareSignRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.NoSuchElementException;

@Service
public class WelfareSignService {
    private final WelfareSignRepository repo;
    private final ObjectMapper mapper;

    public WelfareSignService(WelfareSignRepository repo, ObjectMapper mapper) {
        this.repo = repo;
        this.mapper = mapper;
    }

    public ConfigView config() {
        return repo.config();
    }

    public ConfigView updateConfig(ConfigRequest request) {
        return repo.updateConfig(request, System.currentTimeMillis());
    }

    public List<EmployeeView> employees() {
        return repo.employees();
    }

    public EmployeeView createEmployee(EmployeeRequest request) {
        return repo.createEmployee(request, System.currentTimeMillis());
    }

    public EmployeeView updateEmployee(long id, EmployeeRequest request) {
        return repo.updateEmployee(id, request, System.currentTimeMillis());
    }

    public void deleteEmployee(long id) {
        repo.deleteEmployee(id);
    }

    public LoginResponse login(LoginRequest request) {
        String loginId = request.loginId() == null ? "" : request.loginId().trim();
        if (loginId.isBlank()) throw new IllegalArgumentException("请输入登录标识");
        ConfigView config = config();
        EmployeeView employee = "PASSWORD".equals(config.loginMode())
                ? repo.findForAccountLogin(loginId, request.password()).orElseThrow(() -> new NoSuchElementException("账号或密码不正确"))
                : repo.findForSmsLogin(loginId).orElseThrow(() -> new NoSuchElementException("不在签收白名单中"));
        return new LoginResponse(employee, config);
    }

    public SignResponse sign(SignRequest request, String ip, String userAgent) {
        if (request.signatureData() == null || request.signatureData().isBlank()) {
            throw new IllegalArgumentException("签名不能为空");
        }
        EmployeeView employee = repo.employee(request.employeeId())
                .orElseThrow(() -> new NoSuchElementException("员工不存在"));
        if (!employee.enabled()) throw new IllegalArgumentException("员工已停用");
        String extraJson;
        try {
            extraJson = request.extra() == null || request.extra().isEmpty()
                    ? null
                    : mapper.writeValueAsString(request.extra());
        } catch (Exception e) {
            throw new IllegalArgumentException("个性化信息格式不正确");
        }
        ConfigView config = config();
        repo.upsertRecord(employee, request.signatureData(), extraJson, System.currentTimeMillis(), ip, userAgent);
        return new SignResponse(true, config.redirectUrl());
    }

    public List<SignRecordView> records() {
        return repo.records();
    }

    public String exportCsv() {
        StringBuilder sb = new StringBuilder();
        sb.append("员工编号,姓名,手机号,部门,签收时间,个性化信息,签名DataURL\n");
        for (SignRecordView r : records()) {
            sb.append(csv(r.employeeNo())).append(',')
                    .append(csv(r.name())).append(',')
                    .append(csv(r.phone())).append(',')
                    .append(csv(r.department())).append(',')
                    .append(csv(String.valueOf(r.signedAt()))).append(',')
                    .append(csv(r.extraJson())).append(',')
                    .append(csv(r.signatureData())).append('\n');
        }
        return sb.toString();
    }

    private static String csv(String value) {
        if (value == null) return "";
        return "\"" + value.replace("\"", "\"\"") + "\"";
    }
}
