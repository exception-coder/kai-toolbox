package com.exceptioncoder.toolbox.docker.service;

import com.exceptioncoder.toolbox.docker.api.dto.ScannedAppView;
import com.exceptioncoder.toolbox.docker.repository.DockerAppRepository;
import com.exceptioncoder.toolbox.hosts.service.HostSshExec;
import com.jcraft.jsch.Session;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/** 远端目录扫描：find 出包含 compose 文件的子目录。 */
@Component
public class DockerComposeScanner {

    private final DockerCommandBuilder cmd;
    private final DockerAppRepository repo;

    public DockerComposeScanner(DockerCommandBuilder cmd, DockerAppRepository repo) {
        this.cmd = cmd;
        this.repo = repo;
    }

    public List<ScannedAppView> scan(Session session, String hostId, String baseDir, int maxDepth) throws Exception {
        HostSshExec.Result r = HostSshExec.run(session, cmd.find(baseDir, maxDepth));
        if (!r.ok() && r.stdout().isBlank()) {
            // find 在 baseDir 不存在时 exit code !=0 + stderr，但 2>/dev/null 已吃掉 stderr
            throw new IllegalStateException("find failed: " + r.stderr());
        }
        List<ScannedAppView> out = new ArrayList<>();
        for (String line : r.stdout().split("\n")) {
            if (line.isBlank()) continue;
            int tab = line.indexOf('\t');
            if (tab <= 0 || tab == line.length() - 1) continue;
            String dir = line.substring(0, tab).trim();
            String file = line.substring(tab + 1).trim();
            String name = lastSegment(dir);
            var existing = repo.findByHostAndBaseDir(hostId, dir);
            out.add(new ScannedAppView(
                    dir, file, name,
                    existing.isPresent(),
                    existing.map(a -> a.getId()).orElse(null)
            ));
        }
        return out;
    }

    private static String lastSegment(String path) {
        if (path == null || path.isBlank()) return "";
        int i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
        return i >= 0 ? path.substring(i + 1) : path;
    }
}
