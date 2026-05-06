package com.exceptioncoder.toolbox.treesize.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SshHost {
    private String id;
    private String name;
    private String host;
    private int port;
    private String username;
    private SshAuthType authType;
    private String password;
    private String privateKey;
    private String passphrase;
    private long createdAt;
    private long updatedAt;

    public String label() {
        return "%s@%s:%d".formatted(username, host, port);
    }
}
