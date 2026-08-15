# Product

## Register

product

## Users

独立开发者本人，整天在 DSH Web GUI 里工作。需要一个随手可达、可随意拖动、
不遮挡视线的悬浮工具容器；面板内容后续逐步接入。

## Product Purpose

悬浮于 DSH 页面之上的独立工具面板（骨架阶段）：证明自有客户端插件的
叠加、拖动、动效与热更能力，后续承载各类自定义操作。

## Brand Personality

安静、利落、专业。签名色是 indigo（oklch 260° 色相），像深夜编辑器里
那一抹专注的蓝；除此之外不喧哗。

## Anti-references

- 喧宾夺主的营销式浮层、全局遮罩。
- 刺眼的纯色大按钮（初版 #2f6feb 蓝色拉手就是反面教材）。
- 无动画的硬闪现。

## Design Principles

- 融入但不隐形：浮在 DSH 之上，有自己的签名色，但体量克制。
- 每个动效都传达状态：展开/收起有方向感，不做装饰性动效。
- 位置由用户决定：一切可拖动，拖完记住。
- 工具消失在任务里：点开即用，关掉即无。

## Accessibility & Inclusion

- `prefers-reduced-motion` 时所有动画退化为 120ms 纯淡入淡出。
- 正文/占位文字对比度 ≥ 4.5:1。
- 面板打开时 Esc 可关闭；按钮均有 title。
