# quiet-luxury-ui — Quiet Luxury Enterprise UI 视觉与体验设计规范

当需要设计、开发、重构或评审前端 UI、页面布局、表单、组件、错误/空状态时，强制应用本技能规范。

> **审美触发词与架构**：
> `Quiet Luxury Enterprise UI` = Swiss editorial layout + Apple HIG hierarchy + Linear-level product restraint + Vercel-level implementation precision.
> **核心关键词**：`Quiet` · `Precise` · `Minimal` · `Editorial` · `Premium` · `Calm` · `Intentional`

---

## 一、核心设计哲学

- **Less UI, more hierarchy**：页面首先是一个成熟业务系统，而不是 UI Demo。
- **杜绝 AI 味**：高级感来自清晰的信息层级、精确的间距节奏、克制的色彩、优秀的排版、微妙的材质和边界、强对齐与合理留白。
- **克制原则**：*Do not imitate Apple by adding glass effects. Imitate Apple's restraint, hierarchy, typography, spacing, material discipline, and reduction of unnecessary UI.*

---

## 二、严禁的 AI UI 模式 (Anti-Patterns)

- ❌ **全员 Card 化**：禁止每一个区域都套卡片，严禁 Card 套 Card。
- ❌ **过度圆角**：禁止默认 `rounded-2xl` / `rounded-3xl`（控件应为 6-8px，输入框/按钮 8-10px，面板 10-14px，大容器 12-16px）。
- ❌ **悬浮大白卡 + 重阴影**：改用平铺底色 + 1px 精细 border（`rgba(0,0,0,0.06~0.10)`）。
- ❌ **机械居中**：禁止所有内容死板居中，采用强左对齐与自然阅读流。
- ❌ **巨型 Icon / 插画**：禁止 48-80px 巨大警告/空状态 Icon，Icon 最大 16-24px 或直接省略。
- ❌ **蓝紫渐变、发光 Glow、大面积毛玻璃**：主体内容必须是纯色高对比度，毛玻璃仅限导航/浮层。
- ❌ **无意义的装饰 Badge / 胶囊按钮**：每一个元素都必须为 Hierarchy / Readability / Interaction 服务。

---

## 三、排版与色彩系统

1. **排版阶梯 (Typography)**：
   - 字体：中文 `PingFang SC / SF Pro SC / Noto Sans SC`，英文/数字 `Geist / SF Pro / Inter`。
   - 标题：Page Title 24-28px / 600，Section Title 16-18px / 600。
   - 正文：Body 14-15px / 400，Secondary 13-14px / 400，Caption 12px / 400。
   - 依赖 **Size + Weight + Color + Spacing** 建立层级，避免大面积加粗。
2. **色彩比例 (Neutral-First 90/10 Rule)**：
   - Light 底色：`#F7F8FA` / `#FAFAFA`，Surface `#FFFFFF`，Text 主色 `#18181B`，次色 `#52525B / #6B7280`，边框 `rgba(0,0,0,0.06~0.08)`。
   - Accent 颜色：全产品单一主 Accent，**只用于 Primary Action、Active 选中态、Focus Ring、关键指标**，占比不超过 10%。

---

## 四、异常与状态页面设计 (State & Recovery)

状态不是海报，而是工作流中的阻断与引导：
- **标准结构**：`Context` → `State Title` → `Explanation` → `Next Action (Recovery Path)` → `Meta ID/Trace`。
- **杜绝 Dead End**：必须给用户清晰的恢复路径（返回、重新获取、联系处理人）。
- **去卡片化**：状态信息自然嵌入页面，无需包裹巨大卡片和巨型黄色感叹号。

---

## 五、间距与嵌套准则

- **严格 4 的倍数间距 Scale**：4 / 8 / 12 / 16 / 24 / 32 / 48 / 64px。
- **内容最大宽度**：单列/表单/状态 640–720px，紧凑型 960px，宽幅 1200–1440px。
- **同心嵌套圆角**：`Inner Radius < Outer Radius`，嵌套必须符合几何同心关系。

---

## 六、Visual QA 自检

代码提交或生成后检查：
1. 是否有不必要的 Card 或嵌套 Card？
2. 是否有大阴影、发光或无意义渐变？
3. 状态页是否提供了 Next Action？
4. **尝试删除 20% 的装饰 UI 后，页面是否更加清晰有力？**
