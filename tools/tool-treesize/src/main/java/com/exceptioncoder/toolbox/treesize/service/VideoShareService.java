package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.treesize.domain.VideoShare;
import com.exceptioncoder.toolbox.treesize.repository.VideoShareRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

/**
 * 视频分享凭证的签发与校验。
 *
 * <p>为什么不复用登录 token：前端拼播放地址用的 {@code access_token} 是本人全权限、30 分钟过期的
 * JWT，转发到微信群等于把整个工作台的登录态发出去，而且没法单独收回。这里的 token 是一次一视频、
 * 可撤销、默认 7 天过期的独立凭证，泄露的爆炸半径就是那一个视频。
 */
@Service
public class VideoShareService {

    private static final Logger log = LoggerFactory.getLogger(VideoShareService.class);

    /** 32 字节随机 → base64url 43 字符。够短能贴进聊天窗，也远超暴力枚举成本。 */
    private static final int TOKEN_BYTES = 32;

    /** 默认有效期。发给朋友的片子通常几天内就看了，长期敞着没必要。 */
    private static final Duration DEFAULT_TTL = Duration.ofDays(7);

    /** 允许调用方指定的有效期上限。 */
    private static final Duration MAX_TTL = Duration.ofDays(30);

    /** 过期多久后从表里清掉（保留一段时间，便于用户回看"我分享过什么"）。 */
    private static final Duration PURGE_GRACE = Duration.ofDays(30);

    private final VideoShareRepository repo;
    private final SecureRandom random = new SecureRandom();

    public VideoShareService(VideoShareRepository repo) {
        this.repo = repo;
    }

    /**
     * 为一个视频签发分享链接。
     *
     * <p>同一视频若已有未过期的分享，直接复用 —— 用户连点两次分享不该在列表里堆出两条等价记录，
     * 也让"同一个视频发给不同人"拿到的是同一个可一次性收回的链接。
     */
    public VideoShare create(String scanId, String path, String name, long size, Duration ttl) {
        long now = System.currentTimeMillis();
        Optional<VideoShare> live = repo.findLiveByPath(path, now);
        if (live.isPresent()) return live.get();

        Duration effective = ttl == null || ttl.isZero() || ttl.isNegative() ? DEFAULT_TTL : ttl;
        if (effective.compareTo(MAX_TTL) > 0) effective = MAX_TTL;

        VideoShare share = new VideoShare(
                newToken(), scanId, path, name, size,
                now, now + effective.toMillis(), false, 0, null);
        repo.insert(share);
        log.info("video share created: token={} ttl={} path={}", share.token(), effective, path);
        return share;
    }

    /**
     * 校验并返回分享记录。无效（不存在 / 已撤销 / 已过期）时返回空 —— 三种情况对外一律
     * 404，不区分，免得把"这个 token 存在但过期了"这种信息透给探测者。
     */
    public Optional<VideoShare> resolve(String token) {
        if (token == null || token.isBlank()) return Optional.empty();
        return repo.findByToken(token.trim())
                .filter(s -> !s.isInvalidAt(System.currentTimeMillis()));
    }

    /** 记一次访问。失败不能影响播放，异常吞掉只记 DEBUG。 */
    public void touch(String token) {
        try {
            repo.touch(token, System.currentTimeMillis());
        } catch (DataAccessException e) {
            log.debug("touch share {} failed: {}", token, e.toString());
        }
    }

    public List<VideoShare> list(int limit) {
        return repo.findAll(Math.max(1, Math.min(limit, 200)));
    }

    public boolean revoke(String token) {
        return repo.revoke(token) > 0;
    }

    /** 顺手清理过期很久的记录。在列表接口里调用，省一个定时任务。 */
    public void purgeStale() {
        try {
            int n = repo.deleteExpiredBefore(System.currentTimeMillis() - PURGE_GRACE.toMillis());
            if (n > 0) log.info("purged {} stale video shares", n);
        } catch (DataAccessException e) {
            log.debug("purge stale shares failed: {}", e.toString());
        }
    }

    private String newToken() {
        byte[] buf = new byte[TOKEN_BYTES];
        random.nextBytes(buf);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
    }
}
