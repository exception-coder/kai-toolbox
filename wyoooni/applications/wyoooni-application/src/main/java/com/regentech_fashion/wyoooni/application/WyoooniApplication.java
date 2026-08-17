package com.regentech_fashion.wyoooni.application;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/** Wyoooni 公司 H5 模块独立生产宿主。 */
@SpringBootApplication
public class WyoooniApplication {
    /** 启动独立 Wyoooni Web 宿主。 */
    public static void main(String[] args) {
        SpringApplication.run(WyoooniApplication.class, args);
    }
}
