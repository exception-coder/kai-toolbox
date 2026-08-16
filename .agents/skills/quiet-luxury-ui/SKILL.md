---
name: quiet-luxury-ui
description: >-
  Visual quality and UI art direction standard for web applications and components.
  Use this skill whenever designing, building, reviewing, refactoring, or styling UI pages,
  components, layouts, forms, error states, and empty states.
  Enforces "Quiet Luxury Enterprise UI" (Swiss editorial layout + Apple HIG hierarchy +
  Linear-level product restraint + Vercel-level implementation precision), eliminating
  cliché AI-generated SaaS patterns.
---

# Quiet Luxury Enterprise UI — Visual Quality & Art Direction

> **Aesthetic Archetype**: *Quiet Luxury Enterprise UI*
> **Formula**: Swiss editorial layout + Apple HIG hierarchy + Linear-level product restraint + Vercel-level implementation precision.
> **Core Keywords**: `Quiet` · `Precise` · `Minimal` · `Editorial` · `Premium` · `Calm` · `Intentional`

你是一名顶级 Product Designer + Design Engineer。设计目标不是“做一个普通的 SaaS 页面”，而是设计一个具有 Apple / Linear / Vercel 级别克制、精密、成熟感的现代业务系统。设计必须具有明显的人工设计判断，彻底避免任何“AI 默认生成 UI”的视觉套路。

---

## 1. 核心设计原则 (Core Principles)

高级感来自：
- **清晰的信息层级**（Information Hierarchy）
- **精确的间距节奏**（Disciplined Spacing Scale）
- **克制的色彩系统**（Neutral-First + 10% Accent）
- **优秀的排版细节**（Editorial Typography & Line Height）
- **微妙的材质与边界**（Subtle Tonal Borders & Materials）
- **舒适的信息密度**（Comfortable Density for Workflows）
- **强对齐关系与刻意留白**（Intentional Negative Space）
- **极少但准确的视觉强调**（Surgical Visual Accent）

**遵循原则**：
- **Less UI, more hierarchy**：页面首先应该像一个成熟产品，而不是一个 UI Demo。
- **Do not imitate Apple by adding glass effects. Imitate Apple's restraint, hierarchy, typography, spacing, material discipline, and reduction of unnecessary UI.**

---

## 2. 严格禁止的 AI UI 模式 (Forbidden AI Cliché Patterns)

在设计和编写代码时，**绝对禁止**以下 AI 默认生成的视觉模板：

| ❌ 严禁的 AI UI 套路 | 💡 正确做法（Human-Grade Design） |
| :--- | :--- |
| **每一个区域都套 Card** | 采用 `Page → Section → Content`，内容自然处于页面中 |
| **Card 套 Card 套 Card** | 移除多余容器，靠留白、Divider 和 Typography 建立关系 |
| **巨大的 `rounded-2xl` / `rounded-3xl`** | 严格控制圆角：控件 6-8px，面板 10-14px，外层最大 12-16px |
| **大面积白色悬浮大卡片 + 强阴影** | 平铺底色 + 1px 精细 border，极少使用阴影 |
| **机械式所有内容居中排列** | 结构化强左对齐，自然阅读流 |
| **48px–80px 巨型警告/状态 Icon** | 16–24px 辅助 Icon，甚至省略 Icon，以精准文案为主 |
| **Icon + 大标题 + 灰色说明万能 Empty/Error** | 提供工作流上下文（Context → State → Explanation → Recovery Action） |
| **蓝紫渐变、Neon Glow、发光边框** | 纯净中性底色 + 单一功能性 Accent 色 |
| **无意义的大面积毛玻璃（Glassmorphism）** | 毛玻璃仅限 Navigation / Toolbar 等浮动层，内容主体坚决不用 |
| **所有按钮都做成胶囊 Pill** | 规整微圆角按钮（8–10px），视觉稳重克制 |
| **过量浅灰次要文本（低对比度难以阅读）** | 明确的文本阶梯：Primary #18181B, Secondary #6B7280, Tertiary #9CA3AF |
| **使用 Emoji 作为产品/操作图标** | 使用一致线宽的精细矢量图标（如 Lucide / Geist Icons 16–20px） |
| **装饰性插画与无意义装饰元素** | 每一个像素必须为 Hierarchy / Readability / Interaction / Context 服务 |

---

## 3. 布局哲学 (Layout Philosophy)

优先层级结构：
```text
Page → Section → Content
```
**而不是**：
```text
Page → Card → Card → Component (❌ AI 嵌套卡片病)
```

### 何时才允许使用 Card？
仅在满足以下条件之一时使用 Card：
1. 内容本身是一个独立可操作的对象（如数据实体项、拖拽单元）。
2. 需要明确表达卡片整体的可点击交互。
3. 多个平级实体对象需要横向/网格并列对比。
4. 内容浮层需要与背景建立明确物理层级（如 Dropdown / Modal / Popover）。

**对于普通提示、表单、错误信息、页面说明、状态反馈：**
- **严禁习惯性包裹大型白色悬浮 Card**！
- 直接使用留白（Whitespace）、精细分割线（Subtle Divider）、排版（Typography）和对齐（Alignment）构建层级。

---

## 4. 间距系统 (Spacing Scale)

严格使用 4 的倍数间距比例尺：
`4px` · `8px` · `12px` · `16px` · `24px` · `32px` · `48px` · `64px`

- ❌ 禁止随机随意值（如 `13px` / `19px` / `27px` / `37px`）。
- **页面横向 Padding**：
  - Mobile: `20–24px`
  - Tablet: `32–40px`
  - Desktop: `48–64px`
- **内容最大宽度（Max Width Constraint）**：
  - 单列/专注表单/状态页：`640px` ~ `720px`
  - 紧凑仪表盘/阅读流：`960px`
  - 宽幅工作台/数据表格：`1200px` ~ `1440px`
  - 避免无意义拉伸让内容撑满整个屏幕宽度。

---

## 5. 圆角与嵌套 (Border Radius System)

圆角必须克制与精密，保持数学同心嵌套（Nested Radii）：

```text
Small Controls (Badge, Tag, Tiny Button):    6–8px
Inputs / Standard Buttons:                   8–10px
Panels / Drawers:                            10–14px
Large Containers / Modals:                   12–16px
```

- **同心嵌套法则**：`Inner Radius = Outer Radius - Padding`（内部元素的圆角必须小于外部容器圆角，禁止突兀的不协调）。
- 避免全盘 `20px` / `24px` / `32px` 的膨胀感。

---

## 6. 边框与阴影 (Border & Layered Depth)

- **默认优先**：`1px subtle border` (`rgba(0,0,0,0.06~0.10)` 或 `dark: rgba(255,255,255,0.08)`)。
- **次级优先**：`Tonal background difference`（例如底色 `#FAFAFA` 与表面 `#FFFFFF` 的极微对比）。
- **阴影原则**：默认**不使用阴影**。仅在浮层（Popover / Dialog）必须表达物理 Z 轴时，使用多层极低透明度柔和扩散阴影：
  - *目标*：**感觉得到物理层级，但注意不到阴影本身**。
  - ❌ 坚决禁止黑色厚重阴影、漫游光晕（Glow）、Floating Cards Everywhere。

---

## 7. 色彩系统 (Neutral-First 90/10 Rule)

保持 **90% Neutral + 10% Accent** 的克制分配。

### 调色板基准 (Light Theme)
- **App Background**: `#F7F8FA` / `#FAFAFA`
- **Surface / Container**: `#FFFFFF`
- **Primary Text**: `#18181B` (Zinc-900 / 接近纯黑但温和)
- **Secondary Text**: `#52525B` / `#6B7280`
- **Tertiary / Placeholder Text**: `#9CA3AF` / `#A1A1AA`
- **Border**: `rgba(0, 0, 0, 0.06)` ~ `rgba(0, 0, 0, 0.08)`

### Accent 颜色准则
- 整个产品只定义 **一个主要 Accent**（如精炼黑、钛金灰、或克制的墨蓝/钴蓝）。
- Accent 色**仅用于**：Primary Action、Active 选中态、Focus Ring、关键状态指标。
- ❌ 严禁将 Accent 作为大面积装饰色、渐变背景或发光线条。

---

## 8. 排版层级 (Editorial Typography)

- **字体族**：
  - 中文：`PingFang SC`, `SF Pro SC`, `Noto Sans SC`, `Microsoft YaHei`
  - 英文/数字：`Geist`, `SF Pro Display / Text`, `Inter`
- **层级规范**：
  - **Page Title**: `24–28px` / `font-semibold (600)` / `tracking-tight`
  - **Section Title**: `16–18px` / `font-semibold (600)`
  - **Body Text**: `14–15px` / `font-normal (400)` / `leading-relaxed`
  - **Secondary Info**: `13–14px` / `font-normal (400)`
  - **Caption / Meta**: `12px` / `font-normal (400)` / `text-muted`
- **原则**：避免大面积加粗与断崖式字号跳跃，通过 **字号 (Size) + 字重 (Weight) + 色彩明度 (Color) + 间距 (Spacing)** 共同构建优雅的排版流。

---

## 9. 状态与异常设计 (Empty / Error / Invalid States)

### ❌ AI 典型反模式
```text
╭──────────────────────────────────────────────╮
│                     ⚠️                       │  ← 64px 巨大黄色感叹号
│                 链接已失效                   │  ← 居中大粗体
│     当前访问的页面不存在或没有权限...        │  ← 居中灰字
│                [ 知道了 ]                    │  ← 居中死胡同按钮
╰──────────────────────────────────────────────╯
```

### ✅ Human-Grade 产品设计
状态应该被视为**当前工作流中的自然阻断与引导**，而不是一张孤立的海报或卡片。

```text
┌──────────────────────────────────────────────────────────┐
│ 织联协同 · 验证环境                           登记 → 报价  │
└──────────────────────────────────────────────────────────┘

链接已失效
当前邀请链接无法继续使用。它可能已经过期，或报价任务已被关闭。
请联系向你发送链接的采购方，重新获取报价邀请。

[ 返回 ] [ 联系采购方 ]

元信息：邀请编号 RC-20260816-0231 · 错误代码 E-LINK-EXPIRED
```

**状态设计铁律**：
1. **结构流**：`Context` → `State Title` → `Explanation` → `Next Recovery Action` → `Metadata/Trace`。
2. **拒绝 Dead End**：必须提供明确的恢复路径（Recovery Path），如返回、重试、联系支持、返回首页。
3. **辅助 Icon 尺寸**：最大 `16–20px` 内联在标题旁，或直接省略 Icon，依靠精准文案与排版。

---

## 10. 导航与步骤指示 (Quiet Navigation)

- 导航必须保持安静，不与主体内容争夺注意力。
- **步骤表达**：使用字重与细微色彩区分（如 `登记(Semibold/Dark) → 报价(Regular/Muted)`），避免笨重的多彩圆圈节点、大型 Stepper 进度条和粗重连线。

---

## 11. 材质与层级 (Material Discipline)

- **材质三层**：`Background (底色)` → `Content (内容层)` → `Foreground (浮层/导航)`。
- **Translucency & Backdrop Blur**：仅用于浮动顶栏（Header）、悬浮工具栏（Floating Toolbar）或下拉浮层（Popover）。
- **内容主体严禁毛玻璃**：保持纯色实体背景，确保最高的可读性与对比度。

---

## 12. 交互状态 (Stateful Interactions)

每个可交互元素必须具备 6 种完备状态：
`Default` · `Hover` · `Active / Pressed` · `Focus-Visible` · `Disabled` · `Loading`

- **动效标准**：`120ms–200ms` `cubic-bezier(0.16, 1, 0.3, 1)` 或 `ease-out`。
- **变化属性**：仅过渡 `background-color`, `border-color`, `opacity`, `box-shadow`。
- ❌ 严禁夸张弹跳（Bounce）、明显放大（Scale up）或晃动特效。

---

## 13. 信息密度 (Comfortable Density for Workflows)

- 这是业务系统与专业工具，不是营销落地页（Landing Page）。
- 追求 **Comfortable Density**：信息紧凑有序，支持用户高效 **Scan（扫视）→ Understand（理解）→ Act（操作）**。
- 高级感不是空无一物，而是**复杂信息依然秩序井然**。

---

## 14. 视觉 QA 审查清单 (Visual QA Checklist)

任何 UI 实现或修改完成后，必须对照此清单自检：

- [ ] 是否消除了无意义的包裹 Card？页面是否遵循 `Page → Section → Content`？
- [ ] 是否消除了 Card 套 Card 的现象？
- [ ] 圆角是否克制在 `6px–16px` 范围内，并满足内外同心嵌套？
- [ ] 是否去掉了漫游大阴影和发光边框，改用精细 1px border？
- [ ] 是否移除了 48px+ 的 AI 巨型状态 Icon？
- [ ] 文本层级是否通过排版与明度自然表达，而非全盘机械居中？
- [ ] 颜色是否符合 90% Neutral + 10% Accent？Accent 是否只出现在关键交互点？
- [ ] 间距是否严格来自 4 的倍数尺度（4/8/12/16/24/32/48/64）？
- [ ] 异常/空状态是否提供了明确的 Recovery Path，消除了 Dead End？
- [ ] **“删掉 20% 的装饰性 UI 元素后，页面是否反而更清晰有力？”**（如果是，立即删除）。
