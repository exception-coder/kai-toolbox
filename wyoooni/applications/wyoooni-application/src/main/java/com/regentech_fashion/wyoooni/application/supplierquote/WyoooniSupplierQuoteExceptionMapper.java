package com.regentech_fashion.wyoooni.application.supplierquote;

import com.regentech_fashion.supplierquote.api.SupplierQuoteApiException;
import com.regentech_fashion.wyoooni.enterprise.application.gateway.EnterpriseGatewayException;
import org.springframework.http.HttpStatus;

import java.util.function.Supplier;

/** 将企业网关技术异常映射为供应商报价稳定错误契约。 */
final class WyoooniSupplierQuoteExceptionMapper {
    private WyoooniSupplierQuoteExceptionMapper() {}

    static <T> T call(Supplier<T> call) {
        try {
            return call.get();
        } catch (EnterpriseGatewayException exception) {
            HttpStatus status = HttpStatus.resolve(exception.statusCode());
            throw new SupplierQuoteApiException(status == null ? HttpStatus.BAD_GATEWAY : status,
                    exception.errorCode(), exception.getMessage());
        }
    }
}
