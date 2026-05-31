package com.exceptioncoder.toolbox.frp.service;

import com.exceptioncoder.toolbox.frp.api.dto.ReadConfigRequest;
import com.exceptioncoder.toolbox.frp.api.dto.ReadConfigResult;
import com.exceptioncoder.toolbox.frp.api.dto.ServiceActionRequest;
import com.exceptioncoder.toolbox.frp.api.dto.ServiceActionResult;
import com.exceptioncoder.toolbox.frp.api.dto.TestConnectionRequest;
import com.exceptioncoder.toolbox.frp.api.dto.TestConnectionResult;
import com.exceptioncoder.toolbox.frp.api.dto.WriteConfigRequest;
import com.exceptioncoder.toolbox.frp.api.dto.WriteConfigResult;
import com.exceptioncoder.toolbox.frp.domain.FrpMode;
import com.exceptioncoder.toolbox.frp.domain.FrpTarget;
import com.exceptioncoder.toolbox.hosts.domain.Host;
import com.exceptioncoder.toolbox.hosts.service.HostSshExec;
import com.exceptioncoder.toolbox.hosts.service.HostSshSessions;
import com.exceptioncoder.toolbox.hosts.service.HostsService;
import com.jcraft.jsch.Session;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR;

/**
 * 远端 frp 操作总入口：体检、读写 *.toml、控制服务。
 * 主机本身由 {@link HostsService} 统一管理；这里只持有 hostId 引用。
 */
@Service
public class FrpService {

    private final HostsService hostsService;
    private final HostSshSessions sessions;

    public FrpService(HostsService hostsService, HostSshSessions sessions) {
        this.hostsService = hostsService;
        this.sessions = sessions;
    }

    /* -------- 体检 -------- */

    public TestConnectionResult testConnection(TestConnectionRequest req) {
        Host host;
        try {
            host = resolveHost(req);
        } catch (Exception e) {
            return new TestConnectionResult(false, null, false, false, false, false, false, null, e.getMessage());
        }
        Session session = null;
        try {
            session = sessions.open(host);
            String installDir = normalizeInstallDir(req.getInstallDir());

            String script = String.join(" && ",
                    "echo --UNAME-- && uname -srm",
                    "echo --DIR-- && (test -d " + HostSshExec.singleQuote(installDir) + " && echo yes || echo no)",
                    "echo --FRPS-- && (test -x " + HostSshExec.singleQuote(installDir + "/frps") + " && echo yes || echo no)",
                    "echo --FRPC-- && (test -x " + HostSshExec.singleQuote(installDir + "/frpc") + " && echo yes || echo no)",
                    "echo --FRPS_TOML-- && (test -f " + HostSshExec.singleQuote(installDir + "/frps.toml") + " && echo yes || echo no)",
                    "echo --FRPC_TOML-- && (test -f " + HostSshExec.singleQuote(installDir + "/frpc.toml") + " && echo yes || echo no)",
                    "echo --VER-- && (" + HostSshExec.singleQuote(installDir + "/frps") + " -v 2>/dev/null || "
                            + HostSshExec.singleQuote(installDir + "/frpc") + " -v 2>/dev/null || echo unknown)"
            );

            HostSshExec.Result r = HostSshExec.run(session, script);
            java.util.Map<String, String> blocks = parseBlocks(r.stdout());

            return new TestConnectionResult(
                    true,
                    blocks.getOrDefault("UNAME", "").trim(),
                    "yes".equals(blocks.getOrDefault("DIR", "").trim()),
                    "yes".equals(blocks.getOrDefault("FRPS", "").trim()),
                    "yes".equals(blocks.getOrDefault("FRPC", "").trim()),
                    "yes".equals(blocks.getOrDefault("FRPS_TOML", "").trim()),
                    "yes".equals(blocks.getOrDefault("FRPC_TOML", "").trim()),
                    blocks.getOrDefault("VER", "").trim(),
                    null
            );
        } catch (Exception e) {
            return new TestConnectionResult(false, null, false, false, false, false, false, null, e.getMessage());
        } finally {
            if (session != null) session.disconnect();
        }
    }

    /* -------- 读取 -------- */

    public ReadConfigResult readConfig(ReadConfigRequest req) {
        requireMode(req.getMode());
        Host host = resolveHost(req);
        String remotePath = configPath(req, req.getMode());
        Session session = null;
        try {
            session = sessions.open(host);
            String cmd = "if [ -f " + HostSshExec.singleQuote(remotePath) + " ]; then "
                    + "base64 -w 0 " + HostSshExec.singleQuote(remotePath)
                    + "; else echo __MISSING__; fi";
            HostSshExec.Result r = HostSshExec.run(session, cmd);
            if (!r.ok()) {
                throw new ResponseStatusException(INTERNAL_SERVER_ERROR, "读取远端文件失败: " + r.stderr());
            }
            String stdout = r.stdout().trim();
            if ("__MISSING__".equals(stdout)) {
                return new ReadConfigResult(req.getMode(), remotePath, false, "");
            }
            byte[] bytes = java.util.Base64.getDecoder().decode(stdout);
            return new ReadConfigResult(req.getMode(), remotePath, true, new String(bytes, StandardCharsets.UTF_8));
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(INTERNAL_SERVER_ERROR, "SSH 读取失败: " + e.getMessage());
        } finally {
            if (session != null) session.disconnect();
        }
    }

    /* -------- 写入 -------- */

    public WriteConfigResult writeConfig(WriteConfigRequest req) {
        requireMode(req.getMode());
        if (req.getContent() == null) {
            throw new ResponseStatusException(BAD_REQUEST, "content 不能为空");
        }
        Host host = resolveHost(req);
        String remotePath = configPath(req, req.getMode());
        String stamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
        String backupPath = remotePath + ".bak." + stamp;
        Session session = null;
        try {
            session = sessions.open(host);

            HostSshExec.Result backup = HostSshExec.run(session,
                    "if [ -f " + HostSshExec.singleQuote(remotePath) + " ]; then "
                            + "cp -p " + HostSshExec.singleQuote(remotePath) + " " + HostSshExec.singleQuote(backupPath)
                            + " && echo backed-up; else echo skip; fi");
            String backedUp = backup.stdout().trim();

            String b64 = java.util.Base64.getEncoder().encodeToString(req.getContent().getBytes(StandardCharsets.UTF_8));
            String writeCmd = "mkdir -p " + HostSshExec.singleQuote(parentOf(remotePath))
                    + " && echo " + HostSshExec.singleQuote(b64) + " | base64 -d > " + HostSshExec.singleQuote(remotePath);
            HostSshExec.Result w = HostSshExec.run(session, writeCmd);
            if (!w.ok()) {
                throw new ResponseStatusException(INTERNAL_SERVER_ERROR, "写入失败: " + w.stderr());
            }

            HostSshExec.Result size = HostSshExec.run(session, "wc -c < " + HostSshExec.singleQuote(remotePath));
            long bytes = parseLongSafe(size.stdout().trim());

            return new WriteConfigResult(
                    remotePath,
                    "backed-up".equals(backedUp) ? backupPath : null,
                    bytes
            );
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(INTERNAL_SERVER_ERROR, "SSH 写入失败: " + e.getMessage());
        } finally {
            if (session != null) session.disconnect();
        }
    }

    /* -------- 服务控制 -------- */

    public ServiceActionResult serviceAction(ServiceActionRequest req) {
        requireMode(req.getMode());
        String action = req.getAction() == null ? "status" : req.getAction().toLowerCase();
        if (!java.util.Set.of("status", "restart", "stop", "start").contains(action)) {
            throw new ResponseStatusException(BAD_REQUEST, "action 仅支持 status / restart / stop / start");
        }
        Host host = resolveHost(req);
        String unit = req.getMode() == FrpMode.FRPS ? "frps" : "frpc";
        String installDir = normalizeInstallDir(req.getInstallDir());

        // 后台拉起 frp 二进制的关键点：
        //   1) `setsid` 让子进程成为新 session 领导，彻底脱离 SSH 控制终端；
        //   2) `</dev/null` 把 stdin 从 SSH 通道拿掉——否则即使重定向了 stdout/stderr，
        //      SSH 仍会因 stdin 管道未关闭而无限挂起（这就是 "启动中..." 卡死的根因）；
        //   3) 用嵌套子 shell `( ... & )` 让 `wait` 不会回头等这个后台任务；
        //   4) sleep 0.3 是为了让随后的 pgrep 能命中刚 fork 出来的 frp 进程。
        String spawn = "( cd " + HostSshExec.singleQuote(installDir)
                + " && setsid ./" + unit + " -c ./" + unit + ".toml"
                + " </dev/null >/tmp/" + unit + ".log 2>&1 & )";

        String cmd = switch (action) {
            case "status" -> "pgrep -fa " + HostSshExec.singleQuote("(^|/)" + unit + "( |$)") + " || echo __NONE__";
            case "stop" -> "(sudo -n systemctl stop " + unit + " 2>/dev/null && echo via-systemctl) "
                    + "|| (pkill -f " + HostSshExec.singleQuote("(^|/)" + unit + "( |$)") + " ; echo killed)";
            case "start" -> "(sudo -n systemctl start " + unit + " 2>/dev/null && echo via-systemctl) "
                    + "|| (" + spawn + " ; sleep 0.3 ; echo started)";
            case "restart" -> "(sudo -n systemctl restart " + unit + " 2>/dev/null && echo via-systemctl) "
                    + "|| (pkill -f " + HostSshExec.singleQuote("(^|/)" + unit + "( |$)") + " 2>/dev/null ; "
                    + "sleep 0.4 ; " + spawn + " ; sleep 0.3 ; echo restarted)";
            default -> "true";
        };

        Session session = null;
        try {
            session = sessions.open(host);
            HostSshExec.Result r = HostSshExec.run(session, cmd);

            HostSshExec.Result p = HostSshExec.run(session,
                    "pgrep -fa " + HostSshExec.singleQuote("(^|/)" + unit + "( |$)") + " || echo __NONE__");
            String pidsBlock = p.stdout().trim();
            boolean running = !pidsBlock.equals("__NONE__") && !pidsBlock.isEmpty();
            String pids = running ? pidsBlock : "";

            return new ServiceActionResult(cmd, r.exitCode(), r.stdout(), r.stderr(), running, pids);
        } catch (Exception e) {
            throw new ResponseStatusException(INTERNAL_SERVER_ERROR, "SSH 执行失败: " + e.getMessage());
        } finally {
            if (session != null) session.disconnect();
        }
    }

    /* -------- 辅助 -------- */

    private Host resolveHost(FrpTarget target) {
        if (target.getHostId() == null || target.getHostId().isBlank()) {
            throw new ResponseStatusException(BAD_REQUEST, "hostId 不能为空，请先在「主机管理」里登记");
        }
        return hostsService.findRequired(target.getHostId());
    }

    private static void requireMode(FrpMode mode) {
        if (mode == null) {
            throw new ResponseStatusException(BAD_REQUEST, "mode 不能为空 (frps | frpc)");
        }
    }

    private static String configPath(FrpTarget target, FrpMode mode) {
        String dir = normalizeInstallDir(target.getInstallDir());
        return dir + "/" + (mode == FrpMode.FRPS ? "frps.toml" : "frpc.toml");
    }

    private static String normalizeInstallDir(String dir) {
        if (dir == null || dir.isBlank()) {
            throw new ResponseStatusException(BAD_REQUEST, "installDir 不能为空");
        }
        String trimmed = dir.trim();
        while (trimmed.length() > 1 && trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed;
    }

    private static String parentOf(String path) {
        int idx = path.lastIndexOf('/');
        return idx <= 0 ? "/" : path.substring(0, idx);
    }

    private static long parseLongSafe(String s) {
        try { return Long.parseLong(s.trim()); } catch (Exception ignore) { return 0L; }
    }

    private static java.util.Map<String, String> parseBlocks(String stdout) {
        java.util.Map<String, String> out = new java.util.HashMap<>();
        if (stdout == null) return out;
        String[] lines = stdout.split("\\r?\\n");
        String curKey = null;
        StringBuilder buf = new StringBuilder();
        for (String line : lines) {
            if (line.startsWith("--") && line.endsWith("--")) {
                if (curKey != null) out.put(curKey, buf.toString());
                curKey = line.substring(2, line.length() - 2);
                buf.setLength(0);
            } else if (curKey != null) {
                if (buf.length() > 0) buf.append('\n');
                buf.append(line);
            }
        }
        if (curKey != null) out.put(curKey, buf.toString());
        return out;
    }
}
