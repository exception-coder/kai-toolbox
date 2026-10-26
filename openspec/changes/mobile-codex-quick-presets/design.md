# 设计

Page Anatomy：现有 Composer 模型短标签（含思考强度）→ 手机底部抽屉 → 当前组合标题（可点进自定义）→ 56px 原生离散滑杆 → 模型/强度点选档位 → 自定义入口。无额外常驻行。主对象仍为当前 session ID，model value / effort 为组合身份；不会创建新会话或执行模型请求。

适用 OBJ-01、NAV-01、CTX-01、DENS-01、FEED-01、EVID-01、CTRL-01、IDEM-01，无例外。复用 SessionConfigSheet、CodexSessionOptions 和会话模型目录；自定义切换在同一抽屉，关闭恢复触发器焦点，草稿不变。自定义参数在手机内联展开，让同一个抽屉拥有纵向滚动，不用被裁切的嵌套弹出层。评审会话、第三方服务商及其他引擎不接入快捷组合；桌面保留原弹出配置层，不被手机滚动容器裁切。

按引擎目录优先顺序选取 Luna、Sol、Astra：Luna low、Sol low / medium / high、Astra high / xhigh（无 Astra 则使用 Sol）。目录未列出支持强度的模型不投影，重复组合去重；max / ultra 等保留自定义，不假设额外支持、价格或等比算力阶梯。没有 Sol 时使用目录默认模型或第一项，不编造模型 ID。不是匹配组合的当前参数显示自定义，没有擅自降档。目录为空可进自定义同步；刷新中禁止快捷选择。

滑动只更新预览；pointer up、键盘导航 key up、显式档位点选或辅助输入离焦确认时应用一次。pointer cancel、来源模型/强度/目录变化清掉未确认预览；重复点选已有组合不重复写。现有 setModel 与 setCodexOptions 按原配置协议调用，下轮生效。速度保留当前值，目标模型明确不支持快速模式时回到 default；权限和服务商不变。锁定会话仍禁用原入口。

会话刷新和重连只从 Ready 恢复已保存的强度、速度，缺省字段才读取本机兼容缓存，不发送 setCodexOptions。Ready 可能来自旧事件缓冲，自动回写会把历史标准速度重新存入当前会话；参数写入只由用户修改触发。服务端原有数据库持久化和引擎恢复不变，手机与桌面共用此规则，遵循 CTX-01、IDEM-01，无例外。

视觉使用现有中性主题及品牌色，12px 滑杆承载面、32px 拇指、档位至少 44px 触控范围；标题显示真正的模型与强度，未知强度保留原值。native range step=1，提供名称和 aria-valuetext，保留方向键 / Home / End 及可点击档位。触控及 AT 风险参照 [WAI Slider](https://www.w3.org/WAI/ARIA/apg/patterns/slider/)；原生范围输入契约参照 [MDN range](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/range)，查阅于 2026-10-14。不新增 Slider 库或手写全局手势框架。

验收覆盖拖动预览/确认/取消、键盘、目录缺项、刷新/锁定、自定义保留及桌面回归；真实会话只开关和检查不改用户模型，实际选择在生产组件隔离样例及现有 ChatPage 用例中验证。390×844 / 360×640 及桌面检查溢出、末项可达、焦点恢复；模拟浏览器触控不宣称真实华为设备或 TalkBack 验收。
