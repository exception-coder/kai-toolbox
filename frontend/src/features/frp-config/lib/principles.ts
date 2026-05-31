/**
 * 每个配置项的「实际原理」说明文案。
 * UI 在 hover / 折叠面板里展示这些内容，让用户理解：
 *   1. 这个字段写进 TOML 后，frp 在网络栈上实际做了什么；
 *   2. 配错了会出什么症状。
 */
export interface PrincipleEntry {
  title: string
  /** 一行短描述，UI 紧凑模式展示 */
  oneLiner: string
  /** 详细的多段说明 */
  detail: string[]
}

export const PRINCIPLES = {
  // ---------- 服务端通用 ----------
  bindPort: {
    title: 'bindPort（控制端口）',
    oneLiner: '所有 frpc 客户端通过这个 TCP 端口跟 frps 建主连接；不是穿透流量端口。',
    detail: [
      'frps 启动时会在 bindPort 上 listen，客户端 frpc 拿配置里的 serverAddr:serverPort 主动 dial 这个端口。',
      '握手后 frps 会为每个 proxy 在自己进程里再开对应的 remotePort 监听；用户访问 remotePort 的流量被 frps 通过这个主连接「反向喂」给 frpc。',
      '常见踩坑：bindPort 必须能从客户端公网访问，云厂商安全组、本机 iptables/firewalld 都要放行。',
    ],
  },
  authToken: {
    title: 'auth.token（共享密钥）',
    oneLiner: '客户端连进来时携带的口令；不对就直接 reject，防止陌生 frpc 蹭你的服务器。',
    detail: [
      'frps / frpc 双方必须配同一个 token。握手期 frpc 会用 token 算一个 HMAC，frps 校验。',
      '没配 token 等于公网裸奔——任何人扫到 7000 端口都能连进来开 proxy。',
      '强烈建议用 32 位随机字符串，例如 `openssl rand -hex 16`。',
    ],
  },
  vhostHttp: {
    title: 'vhostHTTPPort / vhostHTTPSPort（HTTP 多路复用）',
    oneLiner: '所有 type="http" 的代理共用一个端口，按 Host 头分流到不同后端。',
    detail: [
      '原理：frps 在 vhostHTTPPort 上做 7 层反代，根据请求里的 Host: header 找到对应 customDomains 的 proxy，再扔给 frpc 的 localPort。',
      '这就是为什么 HTTP 代理可以「N 个站共用 80 端口」而 TCP 代理必须一站一个 remotePort。',
      '前提：要穿透的域名 DNS A 记录都得指向 frps 的公网 IP。',
    ],
  },
  dashboard: {
    title: 'Dashboard（webServer 节）',
    oneLiner: 'frps 自带的小型管理 UI，浏览器看连接数、流量、每个 proxy 在线状态。',
    detail: [
      '只是个查看工具，不影响穿透本身。但 webServer.port（默认 7500）必须独立、不能跟 bindPort 撞。',
      '生产环境务必设强密码并用 iptables 限制源 IP，因为接口里能看到所有 proxy 配置。',
    ],
  },
  allowPorts: {
    title: 'allowPorts（端口白名单）',
    oneLiner: '限制客户端能申请的 remotePort 范围，防止 frpc 滥用端口。',
    detail: [
      'frps 收到 frpc 注册 proxy 请求时会校验 remotePort 是否在 allowPorts 列表里。不在就直接拒绝注册。',
      '范围语法：`{ start = 6000, end = 7000 }` 区间，`{ single = 8080 }` 单点，可以混用。',
      '不配 = 全放行；多人共享 frps 时强烈建议配上。',
    ],
  },

  // ---------- 客户端通用 ----------
  serverAddr: {
    title: 'serverAddr / serverPort',
    oneLiner: 'frps 公网入口；frpc 启动时 dial 这两个值建立主连接。',
    detail: [
      'serverAddr 写 frps 的公网 IP 或域名；serverPort 必须和 frps.bindPort 一致。',
      '注意是 frpc 主动连 frps（出站连接），所以即使内网完全没公网 IP 也能用——这就是「反向代理」三个字的来源。',
    ],
  },

  // ---------- proxy 公共 ----------
  proxyTcp: {
    title: '[[proxies]] type = "tcp"（最常用）',
    oneLiner: 'frps 在 remotePort 上 listen，每条入站连接通过主通道转给 frpc 的 localIP:localPort。',
    detail: [
      '原理：用户连 frps:remotePort → frps 开通道 → frpc 在内网开 socket 连 localIP:localPort → 两边对拷字节流。',
      'localIP 不一定是 127.0.0.1，可以是同内网其他机器，frpc 充当跳板。',
      'remotePort 是 4 层端口，一个端口只能对应一个 proxy。',
    ],
  },
  proxyUdp: {
    title: 'type = "udp"',
    oneLiner: 'UDP 数据报封进 frpc/frps 的主通道转发；适合 DNS、游戏、部分音视频协议。',
    detail: [
      'frps 在 remotePort 上 udp listen，每个报文加 (src, port) 标记封装到主通道，frpc 解封后发到本地 localPort。',
      '注意：因为 UDP 无连接，会话状态由 frp 自己维护超时表，长会话（如游戏）要留意 frp 的 NAT 表过期。',
    ],
  },
  proxyHttp: {
    title: 'type = "http"（按域名分流）',
    oneLiner: '不占独立 remotePort；由 frps 的 vhostHTTPPort 按 Host 头转给对应 frpc。',
    detail: [
      '前置条件：frps.toml 里要配 vhostHTTPPort（一般就是 80）。',
      '把要穿透的域名解析到 frps 公网 IP，浏览器访问域名→进 frps 80 端口→frps 看 Host 头分发。',
      '相比 type=tcp 优势：N 个网站共用一个 80 端口；劣势：只能转 HTTP/HTTPS，不能转裸 TCP。',
    ],
  },
  proxyRange: {
    title: '范围模式 localPortsRange / remotePortsRange',
    oneLiner: '一条 proxy 一次性穿透多段端口，省得写 100 个 [[proxies]] 块。',
    detail: [
      '语法支持区间和离散：`6000-6010,7000,8080-8090`。',
      'frpc 启动时会按映射关系展开成多个内部 proxy；端口对应关系是 1:1（本地 6000 ↔ 远程 6000）。',
      '适合「把内网一整段 RPC 端口或 docker 端口段全部暴露出去」的场景。',
    ],
  },

  // ---------- SSH 部分 ----------
  ssh: {
    title: 'SSH 连接 + installDir',
    oneLiner: '本工具用 SSH 把生成的 TOML scp 到远端 frp 安装目录，再调 systemctl 让 frp 热加载。',
    detail: [
      '所有「保存」「重启」按钮的动作都是：SSH 进远端→写入 ${installDir}/frps.toml（或 frpc.toml）→sudo systemctl restart frps/frpc。',
      '保存前会自动把旧文件备份成 *.bak.yyyyMMddHHmmss，改炸了 cp 回来就行。',
      '如果远端没装 systemd unit，会回退到 pkill + nohup ./frps -c ./frps.toml & 的方式启动（适合压根没注册服务的临时部署）。',
    ],
  },
} satisfies Record<string, PrincipleEntry>

export type PrincipleKey = keyof typeof PRINCIPLES
