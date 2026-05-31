package com.exceptioncoder.toolbox.hosts.service;

import com.exceptioncoder.toolbox.hosts.domain.Host;
import com.exceptioncoder.toolbox.hosts.domain.HostAuthType;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.SocketFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/**
 * 全局唯一的 JSch Session 工厂，所有需要 SSH 的工具共用。
 * 强制走系统直连（{@code Proxy.NO_PROXY}），避免 Clash / V2Ray TUN 截胡。
 */
@Component
public class HostSshSessions {

    private static final int CONNECT_TIMEOUT_MS = 15_000;

    private static final SocketFactory DIRECT = new SocketFactory() {
        @Override
        public Socket createSocket(String host, int port) throws IOException {
            Socket socket = new Socket(Proxy.NO_PROXY);
            socket.connect(new InetSocketAddress(host, port), CONNECT_TIMEOUT_MS);
            return socket;
        }
        @Override public InputStream getInputStream(Socket s) throws IOException { return s.getInputStream(); }
        @Override public OutputStream getOutputStream(Socket s) throws IOException { return s.getOutputStream(); }
    };

    public Session open(Host host) throws JSchException {
        if (host.getHost() == null || host.getHost().isBlank()) {
            throw new IllegalArgumentException("host is required");
        }
        if (host.getUsername() == null || host.getUsername().isBlank()) {
            throw new IllegalArgumentException("username is required");
        }
        int port = host.getPort() <= 0 ? 22 : host.getPort();

        JSch jsch = new JSch();
        if (host.getAuthType() == HostAuthType.KEY) {
            if (host.getPrivateKey() == null || host.getPrivateKey().isBlank()) {
                throw new IllegalArgumentException("private key path is required");
            }
            if (host.getPassphrase() == null || host.getPassphrase().isBlank()) {
                jsch.addIdentity(host.getPrivateKey());
            } else {
                jsch.addIdentity(host.getPrivateKey(), host.getPassphrase().getBytes(StandardCharsets.UTF_8));
            }
        }

        Session session = jsch.getSession(host.getUsername(), host.getHost(), port);
        session.setConfig("StrictHostKeyChecking", "no");
        session.setConfig("PreferredAuthentications", preferredAuthentications(host));
        if (host.getAuthType() == HostAuthType.PASSWORD) {
            if (host.getPassword() == null || host.getPassword().isBlank()) {
                throw new IllegalArgumentException("password is required");
            }
            session.setPassword(host.getPassword());
        }
        session.setSocketFactory(DIRECT);
        session.connect(CONNECT_TIMEOUT_MS);
        return session;
    }

    private static String preferredAuthentications(Host host) {
        if (host.getAuthType() == HostAuthType.KEY) {
            return "publickey";
        }
        return "password,keyboard-interactive";
    }
}
