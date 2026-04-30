package com.exceptioncoder.toolbox;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.exceptioncoder.toolbox")
public class ToolboxApplication {

    public static void main(String[] args) {
        SpringApplication.run(ToolboxApplication.class, args);
    }
}
