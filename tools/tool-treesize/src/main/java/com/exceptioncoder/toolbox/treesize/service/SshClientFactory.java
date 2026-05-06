package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.treesize.domain.SshAuthType;
import com.exceptioncoder.toolbox.treesize.domain.SshHost;
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

@Component
public class SshClientFactory {

    private static final int CONNECT_TIMEOUT_MS = 15_000;

    // Forces direct TCP connection, bypasses any system proxy (Clash/V2Ray TUN mode, SOCKS, etc.)
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

    public Session openSession(SshHost host) throws JSchException {
        JSch jsch = new JSch();
        if (host.getAuthType() == SshAuthType.KEY) {
            if (host.getPrivateKey() == null || host.getPrivateKey().isBlank()) {
                throw new IllegalArgumentException("private key path is required");
            }
            if (host.getPassphrase() == null || host.getPassphrase().isBlank()) {
                jsch.addIdentity(host.getPrivateKey());
            } else {
                jsch.addIdentity(host.getPrivateKey(), host.getPassphrase().getBytes(StandardCharsets.UTF_8));
            }
        }

        Session session = jsch.getSession(host.getUsername(), host.getHost(), host.getPort());
        session.setConfig("StrictHostKeyChecking", "no");
        session.setConfig("PreferredAuthentications", preferredAuthentications(host));
        if (host.getAuthType() == SshAuthType.PASSWORD) {
            if (host.getPassword() == null || host.getPassword().isBlank()) {
                throw new IllegalArgumentException("password is required");
            }
            session.setPassword(host.getPassword());
        }
        session.setSocketFactory(DIRECT);
        session.connect(CONNECT_TIMEOUT_MS);
        return session;
    }

    private static String preferredAuthentications(SshHost host) {
        if (host.getAuthType() == SshAuthType.KEY) {
            return "publickey";
        }
        return "password,keyboard-interactive";
    }
}
