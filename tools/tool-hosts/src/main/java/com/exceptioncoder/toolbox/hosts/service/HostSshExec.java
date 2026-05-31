package com.exceptioncoder.toolbox.hosts.service;

import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** 在已建立的 Session 上跑一条 shell 命令，捕获 stdout / stderr / exitCode。 */
public final class HostSshExec {

    public record Result(int exitCode, String stdout, String stderr) {
        public boolean ok() { return exitCode == 0; }
    }

    private HostSshExec() {}

    public static Result run(Session session, String command) throws JSchException, IOException, InterruptedException {
        ChannelExec channel = (ChannelExec) session.openChannel("exec");
        try {
            channel.setCommand(command);
            channel.setInputStream(null);
            ByteArrayOutputStream err = new ByteArrayOutputStream();
            channel.setErrStream(err);

            InputStream in = channel.getInputStream();
            channel.connect();

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            while (true) {
                while (in.available() > 0) {
                    int n = in.read(buf, 0, buf.length);
                    if (n < 0) break;
                    out.write(buf, 0, n);
                }
                if (channel.isClosed()) {
                    if (in.available() > 0) continue;
                    break;
                }
                Thread.sleep(30);
            }
            return new Result(
                    channel.getExitStatus(),
                    out.toString(StandardCharsets.UTF_8),
                    err.toString(StandardCharsets.UTF_8)
            );
        } finally {
            channel.disconnect();
        }
    }

    /** 把任意字符串安全嵌进 bash 单引号字面量。 */
    public static String singleQuote(String raw) {
        if (raw == null) return "''";
        return "'" + raw.replace("'", "'\\''") + "'";
    }
}
