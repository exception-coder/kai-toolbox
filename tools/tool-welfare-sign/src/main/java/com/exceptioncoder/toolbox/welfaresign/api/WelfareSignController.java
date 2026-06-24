package com.exceptioncoder.toolbox.welfaresign.api;

import com.exceptioncoder.toolbox.welfaresign.api.dto.WelfareSignDtos.ConfigRequest;
import com.exceptioncoder.toolbox.welfaresign.api.dto.WelfareSignDtos.ConfigView;
import com.exceptioncoder.toolbox.welfaresign.api.dto.WelfareSignDtos.EmployeeRequest;
import com.exceptioncoder.toolbox.welfaresign.api.dto.WelfareSignDtos.EmployeeView;
import com.exceptioncoder.toolbox.welfaresign.api.dto.WelfareSignDtos.LoginRequest;
import com.exceptioncoder.toolbox.welfaresign.api.dto.WelfareSignDtos.LoginResponse;
import com.exceptioncoder.toolbox.welfaresign.api.dto.WelfareSignDtos.SignRecordView;
import com.exceptioncoder.toolbox.welfaresign.api.dto.WelfareSignDtos.SignRequest;
import com.exceptioncoder.toolbox.welfaresign.api.dto.WelfareSignDtos.SignResponse;
import com.exceptioncoder.toolbox.welfaresign.service.WelfareSignService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/welfare-sign")
public class WelfareSignController {
    private final WelfareSignService service;

    public WelfareSignController(WelfareSignService service) {
        this.service = service;
    }

    @GetMapping("/config")
    public ConfigView config() {
        return service.config();
    }

    @PutMapping("/config")
    public ConfigView updateConfig(@RequestBody ConfigRequest request) {
        return service.updateConfig(request);
    }

    @GetMapping("/employees")
    public List<EmployeeView> employees() {
        return service.employees();
    }

    @PostMapping("/employees")
    @ResponseStatus(HttpStatus.CREATED)
    public EmployeeView createEmployee(@RequestBody EmployeeRequest request) {
        return service.createEmployee(request);
    }

    @PutMapping("/employees/{id}")
    public EmployeeView updateEmployee(@PathVariable long id, @RequestBody EmployeeRequest request) {
        return service.updateEmployee(id, request);
    }

    @DeleteMapping("/employees/{id}")
    public ResponseEntity<Void> deleteEmployee(@PathVariable long id) {
        service.deleteEmployee(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/login")
    public LoginResponse login(@RequestBody LoginRequest request) {
        return service.login(request);
    }

    @PostMapping("/sign")
    public SignResponse sign(@RequestBody SignRequest request, HttpServletRequest servletRequest) {
        return service.sign(request, clientIp(servletRequest), servletRequest.getHeader(HttpHeaders.USER_AGENT));
    }

    @GetMapping("/records")
    public List<SignRecordView> records() {
        return service.records();
    }

    @GetMapping("/records/export")
    public ResponseEntity<String> exportRecords() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(new MediaType("text", "csv", StandardCharsets.UTF_8));
        headers.setContentDisposition(ContentDisposition.attachment().filename("welfare-sign-records.csv", StandardCharsets.UTF_8).build());
        return new ResponseEntity<>('\ufeff' + service.exportCsv(), headers, HttpStatus.OK);
    }

    @ExceptionHandler({IllegalArgumentException.class, NoSuchElementException.class})
    public ResponseEntity<Map<String, Object>> handleBadRequest(RuntimeException e) {
        HttpStatus status = e instanceof NoSuchElementException ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
        return ResponseEntity.status(status).body(Map.of(
                "timestamp", Instant.now().toString(),
                "status", status.value(),
                "error", status.getReasonPhrase(),
                "message", e.getMessage() == null ? "" : e.getMessage()
        ));
    }

    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
