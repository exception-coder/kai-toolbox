package com.exceptioncoder.toolbox.common.forge.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * 部门仍有子部门或挂有用户时的删除拦截（FR-DEPT-02），映射 409。
 */
@ResponseStatus(HttpStatus.CONFLICT)
public class DepartmentInUseException extends RuntimeException {
    public DepartmentInUseException(String message) {
        super(message);
    }
}
