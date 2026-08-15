/**
 * dsh-overlay-panel 浏览器半边：悬浮工具面板「工具坞」。
 *
 * 手写 lazy-CJS bundle（与 tsdown 产物同构）：window.__ModuleLoader__.load 注册
 * factory，外壳物化时得到 { apply }。React / react-dom 是外壳静态注册表里的
 * 平台外部词，直接 require 即可。
 *
 * 形态：极简圆形 FAB ⇄ 浮动面板。锚点永远属于 FAB——FAB 拖到哪，面板就在
 * 那个位置展开（默认从右到左、从上到下，放不下才换向）；面板被拖动时锚点
 * 才跟随面板，并落在面板靠屏幕边缘一侧的上角（右半屏取右上角、左半屏取
 * 左上角），因此关闭面板时收缩动画的终点就是 FAB 出现的位置，不会跳变；
 * 贴边打开再收起，FAB 回到原处。
 *
 * 内容：多视图工具面板，头部按钮切换——
 * ① token 统计（默认）：全站 token 用量。数据源是客户端运行时会话列表
 * （ctx.get("sessions").list，SnapshotStore 快照订阅），逐行读取宿主投影的
 * tokenUsage（提供方回报的输入/输出/缓存读/缓存写累计）与 sessionStats
 * （轮/步数）。会话排行按 ctx.get("workspaces").list 的工作区视图分组：
 * 同一工作区的会话收进同一个展开/收缩列表，归档集（archivedSessionIds）
 * 里的会话统一收进「已归档」列表，未被任何工作区收纳的进「未分组」。
 * 子代理会话（origin === "subagent"）不单独上榜——侧边栏同样只把它们
 * 嵌在父会话目录下——其用量沿 parentId 链并入发起它的主会话行，主行
 * 以 +N 徽标标注；主会话已不在列表的游离子代理只计入全站合计。
 * 今日/本周/本月维度首选宿主 dailyUsage 投影（宿主半边注册，按自然日折叠
 * 会话日志事件，精确到历史）；投影缺席时退回本地按日基线差值
 * （自启用起累积，localStorage 键 .usageDaily，保留 14 天）。
 * 累计维度为宿主 tokenUsage 投影原值。默认维度为今日；维度标签下方
 * 展示当前统计覆盖的数据日期范围。
 * ② 插件列表：宿主组合插件清单（remote.pluginInventory，entryId/启用态/
 * Fiber 阶段）与本进程动态插件清单（remote.dynamicCordisRunner，包版本与
 * 运行状态），进入视图时懒加载，可手动刷新。
 *
 * client-hmr stat-poll 本文件，保存即热重载（清理逻辑见 apply 返回的 disposer）。
 */
window.__ModuleLoader__.load({
	id: "dsh-overlay-panel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		const React = require("react");
		const { createRoot } = require("react-dom/client");
		const h = React.createElement;
		const { useState, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } = React;

		const K_OPEN = "dsh-overlay-panel.open";
		const K_POS = "dsh-overlay-panel.pos";
		const K_FAB_LEGACY = "dsh-overlay-panel.fabPos";
		const K_PANEL_LEGACY = "dsh-overlay-panel.panelPos";
		const K_DAILY = "dsh-overlay-panel.usageDaily";
		const K_COLLAPSED = "dsh-overlay-panel.collapsed";
		const K_VIEW = "dsh-overlay-panel.view";
		const FAB_SIZE = 44;
		const PANEL_W = 380;
		const PANEL_H_EST = 480;

		const STYLE_TEXT = `
.dop-fab {
	position: fixed; z-index: 900; width: 44px; height: 44px; border-radius: 50%;
	display: flex; align-items: center; justify-content: center;
	border: none; padding: 0; cursor: grab; touch-action: none;
	background: oklch(1 0 0); color: oklch(0.52 0.17 260);
	box-shadow: 0 1px 3px rgba(16,24,40,.14), 0 6px 16px rgba(16,24,40,.12);
	transition: transform 150ms ease-out, box-shadow 150ms ease-out, color 150ms ease-out;
}
.dop-fab:hover { transform: translateY(-2px); color: oklch(0.45 0.17 260); box-shadow: 0 2px 6px rgba(16,24,40,.16), 0 10px 24px rgba(16,24,40,.16); }
.dop-fab:active { transform: scale(.94); }
.dop-fab.dop-dragging, .dop-fab.dop-dragging:hover { cursor: grabbing; transform: none; }
.dop-fab:focus-visible { outline: 2px solid oklch(0.60 0.17 260); outline-offset: 2px; }

.dop-card {
	position: fixed; z-index: 900; width: 380px; max-height: min(560px, calc(100vh - 32px));
	display: flex; flex-direction: column; border-radius: 14px; overflow: hidden;
	background: oklch(1 0 0); color: oklch(0.28 0.02 260);
	box-shadow: 0 4px 12px rgba(16,24,40,.10), 0 16px 40px rgba(16,24,40,.18);
	font-family: inherit; font-size: 13px;
	animation: dopPanelIn 220ms cubic-bezier(0.22,1,0.36,1);
}
.dop-card.dop-closing { animation: dopPanelOut 160ms cubic-bezier(0.4,0,1,1) forwards; }
@keyframes dopPanelIn { from { opacity: 0; transform: scale(.92); } to { opacity: 1; transform: scale(1); } }
@keyframes dopPanelOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(.94); } }

.dop-header {
	display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 8px 0 12px;
	cursor: grab; user-select: none; touch-action: none;
	border-bottom: 1px solid oklch(0.93 0.01 260); flex: none;
}
.dop-header.dop-dragging { cursor: grabbing; }
.dop-grip { color: oklch(0.72 0.03 260); flex: none; display: flex; }
.dop-title { flex: 1; font-weight: 600; font-size: 13px; letter-spacing: .01em; }
.dop-close {
	width: 28px; height: 28px; border: none; border-radius: 8px; background: transparent;
	color: oklch(0.52 0.03 260); cursor: pointer; flex: none;
	display: flex; align-items: center; justify-content: center;
	transition: background 120ms ease-out, color 120ms ease-out;
}
.dop-close:hover { background: oklch(0.95 0.02 260); color: oklch(0.40 0.10 260); }
.dop-close:focus-visible { outline: 2px solid oklch(0.60 0.17 260); outline-offset: -2px; }

.dop-body { display: flex; flex: 1; min-height: 0; flex-direction: column; overflow: hidden; line-height: 1.6; }
.dop-summary { flex: none; padding: 12px 14px 0; }
.dop-desc { margin: 12px 14px; color: oklch(0.52 0.03 260); }

.dop-seg {
	display: flex; gap: 2px; padding: 2px; border-radius: 9px;
	background: oklch(0.96 0.01 260); margin-bottom: 6px;
}
.dop-seg button {
	flex: 1; border: none; border-radius: 7px; padding: 4px 0; cursor: pointer;
	background: transparent; color: oklch(0.50 0.03 260); font-size: 12px; font-family: inherit;
	transition: background 120ms ease-out, color 120ms ease-out;
}
.dop-seg button:hover { color: oklch(0.35 0.05 260); }
.dop-seg button.dop-seg-on {
	background: oklch(1 0 0); color: oklch(0.35 0.10 260); font-weight: 600;
	box-shadow: 0 1px 3px rgba(16,24,40,.10);
}

.dop-total { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.dop-total-num { font-size: 24px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.1; color: oklch(0.30 0.06 260); font-variant-numeric: tabular-nums; }
.dop-total-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; line-height: 1.25; }
.dop-total-unit { font-size: 12px; color: oklch(0.52 0.03 260); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dop-total-sub { font-size: 10.5px; color: oklch(0.59 0.03 260); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dop-cache-badge {
	margin-left: auto; flex: none; font-size: 11px; font-weight: 600;
	padding: 2px 8px; border-radius: 999px;
	background: oklch(0.93 0.04 165); color: oklch(0.42 0.10 165);
}
.dop-status-line { display: flex; align-items: center; gap: 7px; margin-bottom: 8px; font-size: 10.5px; line-height: 1.4; color: oklch(0.58 0.03 260); }
.dop-range { margin-left: auto; flex: none; white-space: nowrap; color: oklch(0.60 0.03 260); font-variant-numeric: tabular-nums; }
.dop-data-state { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; }
.dop-data-state::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: oklch(0.60 0.12 165); }
.dop-data-state.dop-data-syncing { color: oklch(0.48 0.11 80); }
.dop-data-state.dop-data-syncing::before { background: oklch(0.70 0.15 80); animation: dopPulse 1.6s ease-in-out infinite; }
.dop-data-state.dop-data-live::before { animation: dopPulse 1.6s ease-in-out infinite; }
.dop-updated { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.dop-bucket { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
.dop-bucket-label { width: 44px; flex: none; color: oklch(0.50 0.03 260); font-size: 12px; }
.dop-bucket-track { flex: 1; height: 5px; border-radius: 999px; background: oklch(0.95 0.01 260); overflow: hidden; }
.dop-bucket-fill { display: block; height: 100%; border-radius: 999px; transition: width 300ms ease-out; }
.dop-bucket-val { width: 58px; flex: none; text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; color: oklch(0.35 0.04 260); }

.dop-divider { border: none; border-top: 1px solid oklch(0.93 0.01 260); margin: 12px 0 8px; }
.dop-section-label { flex: none; font-size: 12px; color: oklch(0.50 0.03 260); margin: 0 0 6px; padding: 0 14px; }

/* 会话排行是面板内唯一的滚动区：细窄滚动条，静止时半透明，悬停加深。 */
.dop-rank-scroll {
	flex: 1; min-height: 48px; overflow-y: auto; overflow-x: hidden;
	padding: 0 14px 2px; overscroll-behavior: contain;
	scrollbar-width: thin;
	scrollbar-color: oklch(0.82 0.03 260 / 0.6) transparent;
}
.dop-rank-scroll::-webkit-scrollbar { width: 6px; }
.dop-rank-scroll::-webkit-scrollbar-track { background: transparent; }
.dop-rank-scroll::-webkit-scrollbar-thumb { background: oklch(0.82 0.03 260 / 0.6); border-radius: 999px; }
.dop-rank-scroll:hover::-webkit-scrollbar-thumb { background: oklch(0.66 0.06 260 / 0.8); }
.dop-rank-scroll::-webkit-scrollbar-thumb:hover { background: oklch(0.60 0.10 260 / 0.9); }

.dop-session {
	display: flex; align-items: center; gap: 8px; width: calc(100% + 12px);
	padding: 5px 6px; border: none; border-radius: 8px; margin: 0 -6px;
	background: transparent; color: inherit; font: inherit; text-align: left;
}
.dop-session-clickable { cursor: pointer; }
.dop-session:hover { background: oklch(0.97 0.01 260); }
.dop-session-current { background: oklch(0.96 0.025 260); }
.dop-session:focus-visible { outline: 2px solid oklch(0.60 0.17 260); outline-offset: -2px; }
.dop-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.dop-dot-running { background: oklch(0.55 0.17 260); animation: dopPulse 1.6s ease-in-out infinite; }
.dop-dot-pending { background: oklch(0.70 0.15 80); }
.dop-dot-idle { background: transparent; box-shadow: inset 0 0 0 1.5px oklch(0.75 0.02 260); }
@keyframes dopPulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
.dop-session-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; }
.dop-session-rate { flex: none; font-size: 11px; color: oklch(0.45 0.10 165); font-variant-numeric: tabular-nums; width: 46px; text-align: right; }
.dop-session-subs {
	flex: none; font-size: 10px; line-height: 16px; padding: 0 5px; border-radius: 999px;
	background: oklch(0.93 0.03 260); color: oklch(0.50 0.06 260);
	font-variant-numeric: tabular-nums; cursor: help;
}
.dop-session-val { flex: none; font-size: 12px; color: oklch(0.35 0.04 260); font-variant-numeric: tabular-nums; width: 62px; text-align: right; }

.dop-group { margin-bottom: 2px; }
.dop-group-header {
	display: flex; align-items: center; gap: 6px; width: 100%;
	border: none; background: transparent; padding: 5px 6px; border-radius: 8px;
	cursor: pointer; font-family: inherit; font-size: 12px; color: oklch(0.45 0.03 260);
	transition: background 120ms ease-out, color 120ms ease-out;
}
.dop-group-header:hover { background: oklch(0.96 0.01 260); color: oklch(0.35 0.05 260); }
.dop-group-header:focus-visible { outline: 2px solid oklch(0.60 0.17 260); outline-offset: -2px; }
.dop-chev { flex: none; display: flex; color: oklch(0.65 0.03 260); transition: transform 150ms ease-out; }
.dop-chev.dop-chev-open { transform: rotate(90deg); }
.dop-group-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; font-weight: 600; }
.dop-group-meta { flex: none; font-size: 11px; color: oklch(0.60 0.03 260); font-variant-numeric: tabular-nums; }
.dop-group-body { padding: 0 0 2px 12px; animation: dopFadeIn 150ms ease-out; }

.dop-footer { flex: none; margin: 0; padding: 8px 14px 12px; font-size: 11.5px; color: oklch(0.55 0.03 260); }

.dop-view-toggle {
	width: 28px; height: 28px; border: none; border-radius: 8px; background: transparent;
	color: oklch(0.52 0.03 260); cursor: pointer; flex: none;
	display: flex; align-items: center; justify-content: center;
	transition: background 120ms ease-out, color 120ms ease-out;
}
.dop-view-toggle:hover { background: oklch(0.95 0.02 260); color: oklch(0.40 0.10 260); }
.dop-view-toggle:focus-visible { outline: 2px solid oklch(0.60 0.17 260); outline-offset: -2px; }

.dop-plugin-topbar { flex: none; display: flex; align-items: center; padding: 12px 14px 6px; }
.dop-plugin-topbar .dop-section-label { padding: 0; margin: 0; flex: 1; }
.dop-refresh {
	width: 24px; height: 24px; border: none; border-radius: 7px; background: transparent;
	color: oklch(0.55 0.03 260); cursor: pointer; flex: none;
	display: flex; align-items: center; justify-content: center;
	transition: background 120ms ease-out, color 120ms ease-out;
}
.dop-refresh:hover { background: oklch(0.95 0.02 260); color: oklch(0.40 0.10 260); }
.dop-refresh:focus-visible { outline: 2px solid oklch(0.60 0.17 260); outline-offset: -2px; }

.dop-plugin-subhead { font-size: 11px; font-weight: 600; color: oklch(0.50 0.03 260); margin: 8px 0 3px; }
.dop-plugin-subhead:first-child { margin-top: 0; }
.dop-plugin-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; }
.dop-plugin-meta { flex: none; font-size: 11px; color: oklch(0.60 0.03 260); font-variant-numeric: tabular-nums; }
.dop-phase { flex: none; font-size: 10px; line-height: 16px; padding: 0 6px; border-radius: 999px; font-weight: 600; }
.dop-phase-active { background: oklch(0.93 0.04 165); color: oklch(0.42 0.10 165); }
.dop-phase-failed { background: oklch(0.94 0.04 25); color: oklch(0.48 0.14 25); }
.dop-phase-busy { background: oklch(0.94 0.05 80); color: oklch(0.48 0.11 80); }
.dop-phase-off { background: oklch(0.94 0.01 260); color: oklch(0.55 0.02 260); }
.dop-empty { margin: 4px 14px 10px; font-size: 12px; color: oklch(0.55 0.03 260); }

@media (prefers-color-scheme: dark) {
	.dop-fab { background: oklch(0.27 0.02 260); color: oklch(0.78 0.12 260); box-shadow: 0 1px 3px rgba(0,0,0,.5), 0 6px 16px rgba(0,0,0,.4); }
	.dop-fab:hover { color: oklch(0.85 0.10 260); box-shadow: 0 2px 6px rgba(0,0,0,.5), 0 10px 24px rgba(0,0,0,.45); }
	.dop-card { background: oklch(0.24 0.015 260); color: oklch(0.93 0.01 260); }
	.dop-header { border-bottom-color: oklch(0.32 0.02 260); }
	.dop-grip { color: oklch(0.55 0.02 260); }
	.dop-desc { color: oklch(0.70 0.02 260); }
	.dop-close { color: oklch(0.70 0.02 260); }
	.dop-close:hover { background: oklch(0.32 0.03 260); color: oklch(0.90 0.02 260); }
	.dop-seg { background: oklch(0.20 0.015 260); }
	.dop-seg button { color: oklch(0.65 0.02 260); }
	.dop-seg button:hover { color: oklch(0.85 0.02 260); }
	.dop-seg button.dop-seg-on { background: oklch(0.32 0.03 260); color: oklch(0.92 0.02 260); box-shadow: none; }
	.dop-total-num { color: oklch(0.92 0.02 260); }
	.dop-total-unit { color: oklch(0.65 0.02 260); }
	.dop-total-sub, .dop-status-line { color: oklch(0.60 0.02 260); }
	.dop-range { color: oklch(0.62 0.02 260); }
	.dop-data-state { color: oklch(0.76 0.08 165); }
	.dop-data-state.dop-data-syncing { color: oklch(0.78 0.10 80); }
	.dop-cache-badge { background: oklch(0.32 0.05 165); color: oklch(0.80 0.10 165); }
	.dop-bucket-label { color: oklch(0.65 0.02 260); }
	.dop-bucket-track { background: oklch(0.30 0.02 260); }
	.dop-bucket-val { color: oklch(0.85 0.02 260); }
	.dop-divider { border-top-color: oklch(0.32 0.02 260); }
	.dop-section-label { color: oklch(0.65 0.02 260); }
	.dop-session:hover { background: oklch(0.29 0.02 260); }
	.dop-session-current { background: oklch(0.31 0.035 260); }
	.dop-dot-idle { box-shadow: inset 0 0 0 1.5px oklch(0.50 0.02 260); }
	.dop-session-rate { color: oklch(0.72 0.10 165); }
	.dop-session-subs { background: oklch(0.32 0.03 260); color: oklch(0.72 0.03 260); }
	.dop-session-val { color: oklch(0.85 0.02 260); }
	.dop-group-header { color: oklch(0.72 0.02 260); }
	.dop-group-header:hover { background: oklch(0.29 0.02 260); color: oklch(0.88 0.02 260); }
	.dop-chev { color: oklch(0.60 0.02 260); }
	.dop-group-meta { color: oklch(0.60 0.02 260); }
	.dop-footer, .dop-empty { color: oklch(0.60 0.02 260); }
	.dop-view-toggle { color: oklch(0.70 0.02 260); }
	.dop-view-toggle:hover { background: oklch(0.32 0.03 260); color: oklch(0.90 0.02 260); }
	.dop-refresh { color: oklch(0.65 0.02 260); }
	.dop-refresh:hover { background: oklch(0.32 0.03 260); color: oklch(0.90 0.02 260); }
	.dop-plugin-subhead { color: oklch(0.65 0.02 260); }
	.dop-plugin-meta { color: oklch(0.60 0.02 260); }
	.dop-phase-active { background: oklch(0.32 0.05 165); color: oklch(0.80 0.10 165); }
	.dop-phase-failed { background: oklch(0.34 0.05 25); color: oklch(0.80 0.10 25); }
	.dop-phase-busy { background: oklch(0.34 0.05 80); color: oklch(0.80 0.10 80); }
	.dop-phase-off { background: oklch(0.32 0.02 260); color: oklch(0.65 0.02 260); }
	.dop-rank-scroll { scrollbar-color: oklch(0.48 0.03 260 / 0.55) transparent; }
	.dop-rank-scroll::-webkit-scrollbar-thumb { background: oklch(0.48 0.03 260 / 0.55); }
	.dop-rank-scroll:hover::-webkit-scrollbar-thumb { background: oklch(0.58 0.04 260 / 0.75); }
	.dop-rank-scroll::-webkit-scrollbar-thumb:hover { background: oklch(0.66 0.06 260 / 0.85); }
}

@media (prefers-reduced-motion: reduce) {
	.dop-card { animation-name: dopFadeIn; animation-duration: 120ms; }
	.dop-card.dop-closing { animation-name: dopFadeOut; animation-duration: 120ms; }
	.dop-fab, .dop-close, .dop-seg button, .dop-bucket-fill, .dop-chev { transition: none; }
	.dop-group-body { animation: none; }
	.dop-dot-running, .dop-data-state.dop-data-syncing::before, .dop-data-state.dop-data-live::before { animation: none; }
}
@keyframes dopFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes dopFadeOut { from { opacity: 1; } to { opacity: 0; } }
`;

		/** 读取 localStorage JSON，失败回退默认值。 */
		function readJSON(key, fallback) {
			try {
				const raw = window.localStorage.getItem(key);
				return raw === null ? fallback : JSON.parse(raw);
			} catch {
				return fallback;
			}
		}
		function writeJSON(key, value) {
			try {
				window.localStorage.setItem(key, JSON.stringify(value));
			} catch {}
		}
		function removeKey(key) {
			try {
				window.localStorage.removeItem(key);
			} catch {}
		}

		function defaultPos() {
			return { x: window.innerWidth - FAB_SIZE - 24, y: Math.round(window.innerHeight * 0.45) };
		}
		/** 读取统一锚点：优先新键，兼容 v0.2 的 fabPos，最后回退默认位。 */
		function readPos() {
			return readJSON(K_POS, null) ?? readJSON(K_FAB_LEGACY, null) ?? defaultPos();
		}
		/** 位置钳制：元素完整保留在视口内（留 8px 边距）。 */
		function clampPos(pos, w, h) {
			return {
				x: Math.min(Math.max(pos.x, 8), Math.max(window.innerWidth - w - 8, 8)),
				y: Math.min(Math.max(pos.y, 8), Math.max(window.innerHeight - h - 8, 8))
			};
		}

		/**
		 * 由 FAB 锚点推算面板位置。
		 * 展开方向默认从右到左、从上到下；仅当该方向放不下整块面板时才换向：
		 * 水平：默认面板右缘对齐 FAB 右缘（向左展），左缘会越界才改为向右展；
		 * 垂直：默认面板顶缘对齐 FAB 顶缘（向下展），底缘会越界才改为向上展。
		 * panelH 用真实高度（未知时传估值，打开后按真实高度再对齐）。
		 */
		function panelPlacement(anchor, panelH) {
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			let x = anchor.x + FAB_SIZE - PANEL_W;
			if (x < 8) x = anchor.x;
			let y = anchor.y;
			if (y + panelH > vh - 8) y = anchor.y + FAB_SIZE - panelH;
			return clampPos({ x, y }, PANEL_W, panelH);
		}
		/** 缩放动画原点：从 FAB 中心指向面板内的对应点（钳在面板范围内）。 */
		function originFor(anchor, panelPos) {
			const ox = Math.min(Math.max(anchor.x + FAB_SIZE / 2 - panelPos.x, 0), PANEL_W);
			const oy = Math.min(Math.max(anchor.y + FAB_SIZE / 2 - panelPos.y, 0), 560);
			return `${ox}px ${oy}px`;
		}
		/**
		 * 面板拖动后的锚点跟随规则：FAB 落在面板靠屏幕边缘一侧的上角
		 * （右半屏取面板右上角，左半屏取左上角）。面板宽 320px、FAB 44px，
		 * 若直接把锚点设为面板左上角，贴右缘关闭时 FAB 会左跳 276px——
		 * 收缩动画终点必须与 FAB 落点一致。
		 */
		function anchorForPanel(p) {
			const rightSide = p.x + PANEL_W / 2 > window.innerWidth / 2;
			return clampPos({ x: rightSide ? p.x + PANEL_W - FAB_SIZE : p.x, y: p.y }, FAB_SIZE, FAB_SIZE);
		}

		/**
		 * 通用拖动：pointer capture + 6px 点击/拖动阈值。
		 * 返回 handlers 绑到拖动把手元素上；shouldSuppressClick 供带点击行为的
		 * 把手（FAB）在一次拖动结束后吞掉紧随的 click。
		 */
		function useDrag(pos, setPos, w, h) {
			const stateRef = useRef(null);
			const suppressRef = useRef(false);
			const [dragging, setDragging] = useState(false);
			const onPointerDown = (e) => {
				if (e.button !== 0 || !e.isPrimary) return;
				stateRef.current = { startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y, moved: false };
				setDragging(true);
				try {
					e.currentTarget.setPointerCapture(e.pointerId);
				} catch {}
			};
			const onPointerMove = (e) => {
				const s = stateRef.current;
				if (!s) return;
				const dx = e.clientX - s.startX;
				const dy = e.clientY - s.startY;
				if (!s.moved && Math.hypot(dx, dy) > 6) s.moved = true;
				if (s.moved) setPos(clampPos({ x: s.baseX + dx, y: s.baseY + dy }, w, h));
			};
			const finish = () => {
				if (stateRef.current) suppressRef.current = stateRef.current.moved;
				stateRef.current = null;
				setDragging(false);
			};
			return {
				handlers: { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish },
				dragging,
				shouldSuppressClick: () => {
					const v = suppressRef.current;
					suppressRef.current = false;
					return v;
				}
			};
		}

		/** lucide 风格 panel-right 图标。 */
		function FabIcon() {
			return h("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
				h("rect", { x: 3, y: 3, width: 18, height: 18, rx: 2 }),
				h("line", { x1: 15, y1: 3, x2: 15, y2: 21 })
			);
		}
		function CloseIcon() {
			return h("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round", "aria-hidden": "true" },
				h("line", { x1: 6, y1: 6, x2: 18, y2: 18 }),
				h("line", { x1: 18, y1: 6, x2: 6, y2: 18 })
			);
		}
		/** 六点抓取纹，提示标题栏可拖动。 */
		function GripIcon() {
			const dots = [];
			for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) dots.push(h("circle", { key: `${r}-${c}`, cx: 4 + c * 6, cy: 4 + r * 6, r: 1.4, fill: "currentColor" }));
			return h("svg", { width: 14, height: 20, viewBox: "0 0 14 20", "aria-hidden": "true" }, dots);
		}

		// ── 全站 token 统计：数据层 ─────────────────────────────────────

		/** 读取一行的 tokenUsage 投影（提供方回报累计），无则 null。 */
		function usageOf(row) {
			return row?.projectionValues?.tokenUsage ?? null;
		}
		function statsOf(row) {
			return row?.projectionValues?.sessionStats ?? null;
		}
		function bucketsOf(u) {
			return {
				input: u.uncachedInputTokens ?? 0,
				output: u.outputTokens ?? 0,
				cacheRead: u.cacheReadTokens ?? 0,
				cacheWrite: u.cacheWriteTokens ?? 0
			};
		}
		function totalOf(b) {
			return b.input + b.output + b.cacheRead + b.cacheWrite;
		}
		/** 缓存率：缓存读占提示侧（未缓存输入 + 缓存读）的比例；无提示返回 null。 */
		function cacheRateOf(b) {
			const denom = b.input + b.cacheRead;
			return denom > 0 ? b.cacheRead / denom : null;
		}
		function zeroEntry() {
			return { b: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, turns: 0, steps: 0 };
		}
		function entryOf(row) {
			return { b: bucketsOf(usageOf(row)), turns: statsOf(row)?.turns ?? 0, steps: statsOf(row)?.steps ?? 0 };
		}
		function addEntry(a, b) {
			return {
				b: {
					input: a.b.input + b.b.input,
					output: a.b.output + b.b.output,
					cacheRead: a.b.cacheRead + b.b.cacheRead,
					cacheWrite: a.b.cacheWrite + b.b.cacheWrite
				},
				turns: a.turns + b.turns,
				steps: a.steps + b.steps
			};
		}
		function diffEntry(cur, base) {
			return {
				b: {
					input: Math.max(0, cur.b.input - base.b.input),
					output: Math.max(0, cur.b.output - base.b.output),
					cacheRead: Math.max(0, cur.b.cacheRead - base.b.cacheRead),
					cacheWrite: Math.max(0, cur.b.cacheWrite - base.b.cacheWrite)
				},
				turns: Math.max(0, cur.turns - base.turns),
				steps: Math.max(0, cur.steps - base.steps)
			};
		}

		/** 本地日期键 YYYY-MM-DD。 */
		function dateKey(d) {
			const p = (n) => String(n).padStart(2, "0");
			return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
		}
		/** 本周周一的日期键（ISO 周，周一起算）。 */
		function mondayKey(d) {
			const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
			const offset = (copy.getDay() + 6) % 7;
			copy.setDate(copy.getDate() - offset);
			return dateKey(copy);
		}
		/** 本月一日的日期键。 */
		function monthStartKey(d) {
			const p = (n) => String(n).padStart(2, "0");
			return `${d.getFullYear()}-${p(d.getMonth() + 1)}-01`;
		}

		/**
		 * 同步按日基线快照：今日每个会话首次观察记录 base，随后持续刷新 peak；
		 * 只保留最近 14 天。今日差值 = 当前 - base，本周差值 = Σ(日内 peak - base)。
		 */
		function syncDaily(listState) {
			const daily = readJSON(K_DAILY, { days: {} });
			const key = dateKey(new Date());
			const day = daily.days[key] ?? (daily.days[key] = { base: {}, peak: {} });
			for (const row of Object.values(listState.byId)) {
				if (row.blank || !usageOf(row)) continue;
				const entry = entryOf(row);
				if (!day.base[row.id]) day.base[row.id] = entry;
				day.peak[row.id] = entry;
			}
			const keys = Object.keys(daily.days).sort();
			while (keys.length > 14) delete daily.days[keys.shift()];
			writeJSON(K_DAILY, daily);
		}

		/**
		 * 按维度聚合：station 全站合计、按工作区分组的会话排行、sessionCount。
		 * 分组规则：同一工作区（workspaces.list 的 sessionIds 账目）的会话进同一组；
		 * 归档集里的会话统一进「已归档」组（工作区账目仍持有它们，必须先排除）；
		 * 未被任何工作区收纳的进「未分组」组。空组（当前维度下全部为零）不显示。
		 * wsState 缺席时全部会话落入未分组，退化为平铺排行。
		 */
		function aggregate(listState, wsState, dimension) {
			const daily = readJSON(K_DAILY, { days: {} });
			const now = new Date();
			const today = dateKey(now);
			// 时间维度起点：今日为当天，本周为周一，本月为一号；起点键按字典序可比。
			const startKey =
				dimension === "today" ? today :
				dimension === "week" ? mondayKey(now) :
				monthStartKey(now);
			const rows = Object.values(listState.byId).filter((r) => !r.blank && usageOf(r));
			/** dailyUsage 投影的一天 → 展示条目；缺席字段按零计。 */
			const dayEntryOf = (d) => ({
				b: {
					input: d?.input ?? 0,
					output: d?.output ?? 0,
					cacheRead: d?.cacheRead ?? 0,
					cacheWrite: d?.cacheWrite ?? 0
				},
				turns: d?.turns ?? 0,
				steps: d?.steps ?? 0
			});
			const valueOf = (row) => {
				const cur = entryOf(row);
				if (dimension === "all") return cur;
				// 精确路径：宿主 dailyUsage 投影（按自然日折叠会话日志，覆盖面板启用前的历史）。
				const du = row.projectionValues?.dailyUsage;
				if (du != null && typeof du === "object") {
					if (dimension === "today") return dayEntryOf(du[today]);
					let acc = zeroEntry();
					for (const [k, d] of Object.entries(du)) {
						if (k < startKey || k > today) continue;
						acc = addEntry(acc, dayEntryOf(d));
					}
					return acc;
				}
				// 回退路径：投影缺席（宿主半边未加载）时沿用本地按日基线差值。
				if (dimension === "today") {
					const base = daily.days[today]?.base?.[row.id];
					return base ? diffEntry(cur, base) : zeroEntry();
				}
				let acc = zeroEntry();
				for (const [k, day] of Object.entries(daily.days)) {
					if (k < startKey || k > today) continue;
					const base = day.base[row.id];
					const peak = day.peak[row.id];
					if (!base || !peak) continue;
					acc = addEntry(acc, diffEntry(k === today ? cur : peak, base));
				}
				return acc;
			};
			const sessions = rows.map((row) => ({ row, v: valueOf(row) }));
			const station = sessions.reduce((acc, s) => addEntry(acc, s.v), zeroEntry());

			// 数据范围展示：今日/本周/本月用维度起点；累计取全部会话里最早有记录的一天。
			let firstDay = null;
			for (const r of rows) {
				const du = r.projectionValues?.dailyUsage;
				if (du != null && typeof du === "object") {
					for (const k of Object.keys(du)) if (firstDay === null || k < firstDay) firstDay = k;
				}
			}
			if (firstDay === null) {
				for (const k of Object.keys(daily.days)) if (firstDay === null || k < firstDay) firstDay = k;
			}

			// 子代理会话不单独上榜（侧边栏同样只把它们嵌在父会话目录下）：
			// 用量沿 parentId 链并入最顶层可见主会话，父行以 +N 徽标提示；
			// 主会话已不在列表的游离子代理不展示，用量仍计入上方全站合计。
			const rootOf = (row) => {
				let cur = row;
				const guard = new Set();
				while (cur.parentId && listState.byId[cur.parentId] && !guard.has(cur.id)) {
					guard.add(cur.id);
					cur = listState.byId[cur.parentId];
				}
				return cur;
			};
			const mains = [];
			for (const s of sessions) if (s.row.origin !== "subagent") mains.push(s);
			const mainIds = new Set(mains.map((s) => s.row.id));
			const subsByRoot = new Map();
			for (const s of sessions) {
				if (s.row.origin !== "subagent") continue;
				const root = rootOf(s.row);
				if (!mainIds.has(root.id)) continue;
				const list = subsByRoot.get(root.id) ?? [];
				list.push(s);
				subsByRoot.set(root.id, list);
			}
			/**
			 * 把挂在某行下的子代理用量并入该行，返回带 subs 明细的展示行；own 保留主会话自身值。
			 * 徽标只统计当前维度确有消耗的子代理：零消耗子代理对总量无贡献，
			 * 且会导致行徽标之和与顶部「含 N 个子代理消耗」口径不一致。
			 */
			const combinedOf = (s) => {
				const subs = (subsByRoot.get(s.row.id) ?? []).filter((sub) => totalOf(sub.v.b) > 0);
				let v = s.v;
				for (const sub of subs) v = addEntry(v, sub.v);
				return { row: s.row, v, own: s.v, subs };
			};
			const displaySessions = mains.map(combinedOf);
			// 数量口径跟随当前时间维度：只统计该维度确有消耗的主会话/子代理。
			// 子代理数量 = 各行 +N 徽标之和（已归并且确有消耗），与排行可见内容严格一致。
			const mainSessionCount = displaySessions.filter((s) => totalOf(s.v.b) > 0).length;
			const subagentCount = displaySessions.reduce((acc, s) => acc + s.subs.length, 0);
			const dailyMissingCount = rows.filter((r) => r.projectionValues?.dailyUsage == null).length;
			const runningCount = rows.filter((r) => r.running).length;

			const archivedIds = new Set(wsState?.archivedSessionIds ?? []);
			const byId = new Map(displaySessions.map((s) => [s.row.id, s]));
			const byTotalDesc = (a, b) => totalOf(b.v.b) - totalOf(a.v.b);
			const groupOf = (key, title, kind, items) => ({
				key, title, kind,
				sessions: items,
				total: items.reduce((acc, s) => acc + totalOf(s.v.b), 0)
			});
			const groups = [];
			const accounted = new Set();
			for (const ws of wsState?.items ?? []) {
				const items = [];
				for (const id of ws.sessionIds) {
					if (archivedIds.has(id)) continue;
					const s = byId.get(id);
					if (!s) continue;
					accounted.add(id);
					if (totalOf(s.v.b) > 0) items.push(s);
				}
				items.sort(byTotalDesc);
				if (items.length > 0) groups.push(groupOf(`ws:${ws.workspaceId}`, ws.title, "workspace", items));
			}
			const ungrouped = displaySessions
				.filter((s) => !accounted.has(s.row.id) && !archivedIds.has(s.row.id) && totalOf(s.v.b) > 0)
				.sort(byTotalDesc);
			if (ungrouped.length > 0) groups.push(groupOf("__ungrouped__", "未分组", "ungrouped", ungrouped));
			const archived = displaySessions
				.filter((s) => archivedIds.has(s.row.id) && totalOf(s.v.b) > 0)
				.sort(byTotalDesc);
			if (archived.length > 0) groups.push(groupOf("__archived__", "已归档", "archived", archived));
			// 组间排序：按组内总量降序；归档组永远垫底。
			groups.sort((a, b) => (a.kind === "archived" ? 1 : 0) - (b.kind === "archived" ? 1 : 0) || b.total - a.total);
			return {
				station,
				groups,
				mainSessionCount,
				subagentCount,
				dailyMissingCount,
				runningCount,
				currentId: listState.current,
				rangeStart: dimension === "all" ? firstDay : startKey,
				rangeEnd: today
			};
		}

		/** token 缩写：1.2M / 51.2k / 原始值。 */
		function fmt(n) {
			if (n >= 1e6) return `${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}M`;
			if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}k`;
			return String(Math.round(n));
		}
		/** 命中率：固定一位小数。高命中区间（93%~95%）整数取整会长期停在同一数字，一位小数既更准确也能反映实时变化。 */
		function fmtPct(rate) {
			return `${(rate * 100).toFixed(1)}%`;
		}
		/** 构成占比：小比例保留一位，极小非零值明确显示为 <0.1%。 */
		function fmtShare(rate) {
			const pct = rate * 100;
			if (pct === 0) return "0%";
			if (pct < 0.1) return "<0.1%";
			if (pct < 10) return `${pct.toFixed(1).replace(/\.0$/, "")}%`;
			return `${Math.round(pct)}%`;
		}
		/** 最近更新时间：面板打开期间每 30 秒刷新一次相对时间文案。 */
		function fmtUpdatedAt(timestamp, now) {
			if (!timestamp) return "等待更新";
			const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
			if (seconds < 10) return "刚刚更新";
			if (seconds < 60) return `${seconds} 秒前更新`;
			const minutes = Math.floor(seconds / 60);
			if (minutes < 60) return `${minutes} 分钟前更新`;
			const hours = Math.floor(minutes / 60);
			if (hours < 24) return `${hours} 小时前更新`;
			return `${Math.floor(hours / 24)} 天前更新`;
		}

		// 缓存写（cache creation）是 Anthropic 的计费概念，DeepSeek 系供应商从不
		// 回报该字段，桶恒为零——不展示；totalOf 仍兼容四桶求和（为零不影响）。
		const BUCKETS = [
			{ key: "input", label: "输入", color: "oklch(0.52 0.17 260)" },
			{ key: "output", label: "输出", color: "oklch(0.68 0.12 260)" },
			{ key: "cacheRead", label: "缓存读", color: "oklch(0.58 0.13 165)" }
		];
		const DIMENSIONS = [
			{ key: "today", label: "今日" },
			{ key: "week", label: "本周" },
			{ key: "month", label: "本月" },
			{ key: "all", label: "累计" }
		];

		/** lucide 风格 chevron-right，展开时旋转 90°。 */
		function ChevronIcon(props) {
			return h("svg", { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
				h("polyline", { points: "9 18 15 12 9 6" })
			);
		}

		/** lucide 风格 layout-grid：切到插件列表视图。 */
		function GridIcon() {
			return h("svg", { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
				h("rect", { x: 3, y: 3, width: 7, height: 7, rx: 1 }),
				h("rect", { x: 14, y: 3, width: 7, height: 7, rx: 1 }),
				h("rect", { x: 14, y: 14, width: 7, height: 7, rx: 1 }),
				h("rect", { x: 3, y: 14, width: 7, height: 7, rx: 1 })
			);
		}
		/** lucide 风格 bar-chart：切回 token 统计视图。 */
		function ChartIcon() {
			return h("svg", { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
				h("line", { x1: 6, y1: 20, x2: 6, y2: 16 }),
				h("line", { x1: 12, y1: 20, x2: 12, y2: 10 }),
				h("line", { x1: 18, y1: 20, x2: 18, y2: 4 })
			);
		}
		/** lucide 风格 rotate-cw：刷新插件清单。 */
		function RefreshIcon() {
			return h("svg", { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
				h("polyline", { points: "23 4 23 10 17 10" }),
				h("path", { d: "M20.49 15a9 9 0 1 1-2.12-9.36L23 10" })
			);
		}

		/** 组合插件 Fiber 阶段 → 徽章文案与样式。 */
		function phaseBadgeOf(phase, enabled) {
			if (!enabled) return { label: "已禁用", cls: "dop-phase-off" };
			switch (phase) {
				case "active": return { label: "运行中", cls: "dop-phase-active" };
				case "failed": return { label: "失败", cls: "dop-phase-failed" };
				case "pending":
				case "loading": return { label: "加载中", cls: "dop-phase-busy" };
				case "unloading": return { label: "卸载中", cls: "dop-phase-off" };
				default: return { label: "未加载", cls: "dop-phase-off" };
			}
		}
		/** 动态插件运行状态 → 徽章文案与样式。 */
		function dynamicBadgeOf(row) {
			if (row.activeRun) return { label: "运行中", cls: "dop-phase-active" };
			if (row.currentPackageId) return { label: "已停止", cls: "dop-phase-off" };
			return { label: "未运行", cls: "dop-phase-off" };
		}

		/**
		 * 插件列表视图：宿主组合插件（pluginInventory Remote）+ 本进程动态插件
		 * （dynamicCordisRunner Remote）。两个 Remote 都只表示调用当下，进入视图
		 * 懒加载，顶栏刷新按钮手动重拉。
		 */
		function PluginListView(props) {
			const [tick, setTick] = useState(0);
			const [state, setState] = useState({ phase: "loading", error: null, staticEntries: [], dynamicRows: [] });
			useEffect(() => {
				let alive = true;
				setState((s) => ({ ...s, phase: "loading" }));
				(async () => {
					const out = { staticEntries: [], dynamicRows: [], errors: [] };
					if (props.pluginInventory) {
						try {
							const result = await props.pluginInventory.list();
							if (result.ok) out.staticEntries = result.value?.entries ?? [];
							else out.errors.push(`组合插件：${result.error?.code ?? "调用失败"}`);
						} catch (e) {
							out.errors.push(`组合插件：${String(e)}`);
						}
					} else out.errors.push("组合插件清单服务不可用");
					if (props.dynamicRunner) {
						try {
							const result = await props.dynamicRunner.inventory();
							if (result.ok) out.dynamicRows = result.value ?? [];
							else out.errors.push(`动态插件：${result.error?.code ?? "调用失败"}`);
						} catch (e) {
							out.errors.push(`动态插件：${String(e)}`);
						}
					}
					if (alive) setState({ phase: "ready", error: out.errors.join("；") || null, staticEntries: out.staticEntries, dynamicRows: out.dynamicRows });
				})();
				return () => { alive = false; };
			}, [tick, props.pluginInventory, props.dynamicRunner]);

			// 失败优先，其次保持 Loader 顺序（sort 稳定）；已禁用沉底。
			const staticEntries = useMemo(() => {
				const weight = (e) => (e.fiberPhase === "failed" ? 0 : e.enabled === false ? 2 : 1);
				return [...state.staticEntries].sort((a, b) => weight(a) - weight(b));
			}, [state.staticEntries]);

			return h(React.Fragment, null,
				h("div", { className: "dop-plugin-topbar" },
					h("p", { className: "dop-section-label" }, "插件列表"),
					h("button", {
						type: "button",
						className: "dop-refresh",
						title: "刷新清单",
						"aria-label": "刷新插件清单",
						onClick: () => setTick((t) => t + 1)
					}, h(RefreshIcon))
				),
				h("div", { className: "dop-rank-scroll" },
					state.phase === "loading" && state.staticEntries.length === 0
						? h("p", { className: "dop-desc", style: { margin: "0" } }, "正在读取插件清单…")
						: h(React.Fragment, null,
							state.error ? h("p", { className: "dop-empty", style: { margin: "0 0 8px" } }, state.error) : null,
							h("p", { className: "dop-plugin-subhead" }, `组合插件 ${staticEntries.length}`),
							staticEntries.map((e) => {
								const badge = phaseBadgeOf(e.fiberPhase, e.enabled);
								return h("div", { className: "dop-session", key: e.entryId, title: e.moduleName },
									h("span", { className: "dop-plugin-name" }, e.entryId),
									h("span", { className: `dop-phase ${badge.cls}` }, badge.label)
								);
							}),
							h("p", { className: "dop-plugin-subhead" }, `动态插件 ${state.dynamicRows.length}`),
							state.dynamicRows.length === 0
								? h("p", { className: "dop-empty", style: { margin: "0" } }, "当前进程没有动态插件。")
								: state.dynamicRows.map((row) => {
									const badge = dynamicBadgeOf(row);
									return h("div", {
										className: "dop-session",
										key: row.pluginId,
										title: `所属会话 ${row.agentId}\n当前版本 ${row.currentPackageId ?? "—"}`
									},
										h("span", { className: "dop-plugin-name" }, row.pluginId),
										h("span", { className: "dop-plugin-meta" }, `${row.packages.length} 个版本`),
										h("span", { className: `dop-phase ${badge.cls}` }, badge.label)
									);
								})
						)
				),
				h("p", { className: "dop-footer" }, `${staticEntries.length} 个组合插件 · ${state.dynamicRows.length} 个动态插件`)
			);
		}

		/** 单条会话排行行：点击打开主会话；状态点 + 标题 + 子代理徽标 + 命中率 + token 总量。 */
		function SessionRankRow(props) {
			const { row, v, own, subs, onOpen, current } = props;
			// 命中率显示主会话自身值，与 GUI 会话统计行口径一致；
			// token 总量仍是含子代理的归并值，合计命中率放悬浮提示。
			const ownRate = own ? cacheRateOf(own.b) : null;
			const foldedRate = cacheRateOf(v.b);
			const rate = ownRate ?? foldedRate;
			const rateTitle = subs && subs.length > 0 && foldedRate !== null
				? `缓存命中率（本会话自身）；含 ${subs.length} 个子代理合计 ${fmtPct(foldedRate)}`
				: "缓存命中率";
			const total = totalOf(v.b);
			const dotClass = row.running ? "dop-dot-running" : row.pendingInteraction ? "dop-dot-pending" : "dop-dot-idle";
			const dotTitle = row.running ? "运行中" : row.pendingInteraction ? "等待交互" : "空闲";
			const interactive = typeof onOpen === "function";
			const Root = interactive ? "button" : "div";
			const rootProps = {
				className: "dop-session" + (interactive ? " dop-session-clickable" : "") + (current ? " dop-session-current" : "")
			};
			if (interactive) {
				rootProps.type = "button";
				rootProps.onClick = onOpen;
				rootProps.title = `打开会话：${row.displayTitle}`;
				rootProps["aria-label"] = `打开会话 ${row.displayTitle}，${fmt(total)} token${rate === null ? "" : `，缓存命中率 ${fmtPct(rate)}`}`;
			}
			return h(Root, rootProps,
				h("span", { className: `dop-dot ${dotClass}`, title: dotTitle }),
				h("span", { className: "dop-session-title", title: row.displayTitle }, row.displayTitle),
				subs && subs.length > 0
					? h("span", {
						className: "dop-session-subs",
						title: `含 ${subs.length} 个子代理会话，token 已计入本会话：\n${subs.map((s) => `· ${s.row.displayTitle}`).join("\n")}`
					}, `+${subs.length}`)
					: null,
				rate !== null ? h("span", { className: "dop-session-rate", title: rateTitle }, fmtPct(rate)) : null,
				h("span", { className: "dop-session-val" }, fmt(total))
			);
		}

		/** 一个展开/收缩的会话分组：组头显示标题、会话数与组内总量。 */
		function SessionGroup(props) {
			const { group, collapsed, onToggle, onOpen, currentId } = props;
			return h("div", { className: "dop-group" },
				h("button", {
					type: "button",
					className: "dop-group-header",
					"aria-expanded": String(!collapsed),
					title: collapsed ? `展开 ${group.title}` : `收起 ${group.title}`,
					onClick: onToggle
				},
					h("span", { className: "dop-chev" + (collapsed ? "" : " dop-chev-open") }, h(ChevronIcon)),
					h("span", { className: "dop-group-title", title: group.title }, group.title),
					h("span", { className: "dop-group-meta" }, `${group.sessions.length} 个 · ${fmt(group.total)}`)
				),
				collapsed
					? null
					: h("div", { className: "dop-group-body" },
						group.sessions.map(({ row, v, own, subs }) => h(SessionRankRow, {
							key: row.id,
							row,
							v,
							own,
							subs,
							current: currentId === row.id,
							onOpen: onOpen ? () => onOpen(row.id) : null
						}))
					)
			);
		}

		/** 全站统计内容区：维度切换 + 合计 + bucket 条 + 分组会话排行 + 汇总行。 */
		function TokenStatsView(props) {
			const listState = props.store
				? useSyncExternalStore(props.store.subscribe.bind(props.store), props.store.getSnapshot.bind(props.store))
				: null;
			const wsState = props.workspaceStore
				? useSyncExternalStore(props.workspaceStore.subscribe.bind(props.workspaceStore), props.workspaceStore.getSnapshot.bind(props.workspaceStore))
				: null;
			const [dimension, setDimension] = useState("today");
			const [now, setNow] = useState(() => Date.now());
			// 各分组展开/收缩状态（持久化）；归档组默认收缩，其余默认展开。
			const [collapsedMap, setCollapsedMap] = useState(() => readJSON(K_COLLAPSED, {}));
			const isCollapsed = (group) => collapsedMap[group.key] ?? group.kind === "archived";
			const toggleGroup = (group) => {
				setCollapsedMap((m) => {
					const current = m[group.key] ?? group.kind === "archived";
					const next = { ...m, [group.key]: !current };
					writeJSON(K_COLLAPSED, next);
					return next;
				});
			};

			// 列表变化时节流同步旧版按日基线（仅 dailyUsage 投影缺席时回退使用）。
			useEffect(() => {
				if (!listState) return;
				setNow(Date.now());
				const timer = setTimeout(() => syncDaily(listState), 1200);
				return () => clearTimeout(timer);
			}, [listState]);

			const data = useMemo(() => (listState ? aggregate(listState, wsState, dimension) : null), [listState, wsState, dimension]);
			const hasRunning = (data?.runningCount ?? 0) > 0;

			// 更新时间 = 面板最近一次观察到统计数字变化的时间。不能用行 updatedAt：
			// 它只在用户消息等活动事件前进，不随用量投影更新，会把实时刷新显示成几分钟前。
			const [dataChangedAt, setDataChangedAt] = useState(() => Date.now());
			const lastSigRef = useRef(null);
			useEffect(() => {
				if (!data) return;
				const sig = `${dimension}|${totalOf(data.station.b)}|${data.station.turns}|${data.station.steps}`;
				const prev = lastSigRef.current;
				lastSigRef.current = sig;
				// 首次拿到数据记为当前时间；切换维度只重置基线，不伪造一次"更新"。
				if (prev === null) {
					setDataChangedAt(Date.now());
					return;
				}
				if (prev !== sig && prev.startsWith(`${dimension}|`)) setDataChangedAt(Date.now());
			}, [data, dimension]);

			useEffect(() => {
				// 有会话运行时加快到 5s：命中率和更新时间在步骤边界刷新后立刻可见。
				const timer = setInterval(() => setNow(Date.now()), hasRunning ? 5000 : 30000);
				return () => clearInterval(timer);
			}, [hasRunning]);

			if (!data) return h("p", { className: "dop-desc" }, "正在接入会话数据…");

			const stationTotal = totalOf(data.station.b);
			const stationRate = cacheRateOf(data.station.b);

			return h(React.Fragment, null,
				h("div", { className: "dop-summary" },
					h("div", { className: "dop-seg", role: "tablist" },
						DIMENSIONS.map((d) =>
							h("button", {
								key: d.key,
								type: "button",
								role: "tab",
								"aria-selected": dimension === d.key,
								className: dimension === d.key ? "dop-seg-on" : "",
								onClick: () => setDimension(d.key)
							}, d.label)
						)
					),
					h("div", { className: "dop-total" },
						h("span", { className: "dop-total-num" }, fmt(stationTotal)),
						h("span", { className: "dop-total-copy" },
							h("span", { className: "dop-total-unit" },
								data.subagentCount > 0
									? `token · ${data.mainSessionCount} 个主会话`
									: `token · ${data.mainSessionCount} 个会话`
							),
							data.subagentCount > 0
								? h("span", { className: "dop-total-sub" }, `含 ${data.subagentCount} 个子代理消耗`)
								: null
						),
						stationRate !== null && stationTotal > 0
							? h("span", { className: "dop-cache-badge", title: "缓存命中率：缓存读 / (输入 + 缓存读)" }, `命中 ${fmtPct(stationRate)}`)
							: null
					),
					h("div", { className: "dop-status-line" },
						h("span", {
							className: "dop-data-state" + (data.dailyMissingCount > 0 ? " dop-data-syncing" : "") + (hasRunning ? " dop-data-live" : ""),
							title: data.dailyMissingCount > 0
								? `${data.dailyMissingCount} 个会话的按日日志投影尚未就绪，今日/本周暂用本地基线估算`
								: "今日/本周由宿主会话日志按自然日精确投影；供应商在每个步骤完成时回报用量，数字随步骤边界刷新"
						}, data.dailyMissingCount > 0 ? `同步中 · ${data.dailyMissingCount} 个待同步` : hasRunning ? "日志精确 · 实时" : "日志精确"),
						h("span", { className: "dop-updated", title: "最近一次统计数字变化的时间" }, fmtUpdatedAt(dataChangedAt, now)),
						h("span", {
							className: "dop-range",
							title: data.rangeStart
								? data.rangeStart === data.rangeEnd
									? `数据范围：${data.rangeStart}`
									: `数据范围：${data.rangeStart} ~ ${data.rangeEnd}`
								: "数据范围：全部已记录会话"
						},
							data.rangeStart
								? data.rangeStart === data.rangeEnd
									? data.rangeStart
									: `${data.rangeStart} ~ ${data.rangeEnd}`
								: "全部已记录会话"
						)
					),
					stationTotal === 0 && dimension !== "all"
						? h("p", { className: "dop-empty" },
							data.dailyMissingCount === 0
								? "该维度暂无数据。"
								: "该维度暂无数据：按日日志仍在同步。"
						)
						: null,
					BUCKETS.map((bucket) => {
						const value = data.station.b[bucket.key];
						const ratio = stationTotal > 0 ? value / stationTotal : 0;
						const percent = ratio * 100;
						return h("div", { className: "dop-bucket", key: bucket.key },
							h("span", { className: "dop-bucket-label" }, bucket.label),
							h("span", {
								className: "dop-bucket-track",
								role: "progressbar",
								"aria-label": `${bucket.label}占总 token`,
								"aria-valuemin": 0,
								"aria-valuemax": 100,
								"aria-valuenow": Number(percent.toFixed(2)),
								title: `${bucket.label} ${fmt(value)}，占总 token ${fmtShare(ratio)}`
							},
								h("span", { className: "dop-bucket-fill", style: { width: `${percent}%`, background: bucket.color } })
							),
							h("span", { className: "dop-bucket-val", title: `占总 token ${fmtShare(ratio)}` }, fmt(value))
						);
					}),
					data.groups.length > 0 ? h("hr", { className: "dop-divider" }) : null
				),
				data.groups.length > 0
					? h(React.Fragment, null,
						h("p", { className: "dop-section-label" }, "会话排行"),
						h("div", { className: "dop-rank-scroll" },
							data.groups.map((group) =>
								h(SessionGroup, {
									key: group.key,
									group,
									collapsed: isCollapsed(group),
									onToggle: () => toggleGroup(group),
									onOpen: typeof props.sessionActions?.open === "function" ? (id) => props.sessionActions.open(id) : null,
									currentId: data.currentId
								})
							)
						)
					)
					: null,
				h("p", { className: "dop-footer" }, `${fmt(data.station.turns)} 轮 · ${fmt(data.station.steps)} 步`)
			);
		}

		function OverlayPanelApp(props) {
			const [open, setOpen] = useState(() => readJSON(K_OPEN, false));
			const [closing, setClosing] = useState(false);
			// 当前视图：stats（token 统计）/ plugins（插件列表），持久化。
			const [view, setView] = useState(() => readJSON(K_VIEW, "stats"));
			useEffect(() => writeJSON(K_VIEW, view), [view]);
			// 锚点永远属于 FAB：FAB 拖动时跟随 FAB，面板拖动时跟随面板；
			// 仅打开/收起不改写它——贴边打开后收起，FAB 回到原处。
			const [anchor, setAnchor] = useState(readPos);
			// 面板位置（仅打开期间）：由锚点按展开方向推算，不反向污染锚点。
			const [panelPos, setPanelPos] = useState(() => (readJSON(K_OPEN, false) ? panelPlacement(readPos(), PANEL_H_EST) : null));
			// 面板真实高度：拖动钳制必须用实测值，估算值会把面板卡死在半屏。
			const [panelH, setPanelH] = useState(PANEL_H_EST);
			const [origin, setOrigin] = useState("22px 22px");
			const cardRef = useRef(null);
			const alignRef = useRef(readJSON(K_OPEN, false));

			useEffect(() => writeJSON(K_OPEN, open), [open]);
			useEffect(() => {
				writeJSON(K_POS, anchor);
				removeKey(K_FAB_LEGACY);
				removeKey(K_PANEL_LEGACY);
			}, [anchor]);

			const openRef = useRef(open);
			openRef.current = open;
			useEffect(() => {
				const onResize = () => {
					setAnchor((p) => clampPos(p, FAB_SIZE, FAB_SIZE));
					if (openRef.current) setPanelPos((p) => (p ? clampPos(p, PANEL_W, panelH) : p));
				};
				window.addEventListener("resize", onResize);
				return () => window.removeEventListener("resize", onResize);
			}, [panelH]);

			const startClose = () => {
				// 收起动画指向 FAB 将出现的位置：面板没动过就是 FAB 原处，动过就是面板现处。
				if (panelPos) setOrigin(originFor(anchor, panelPos));
				setClosing(true);
			};
			useEffect(() => {
				if (!open) return;
				const onKey = (e) => {
					if (e.key === "Escape") startClose();
				};
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [open, panelPos, anchor]);

			const fabDrag = useDrag(anchor, setAnchor, FAB_SIZE, FAB_SIZE);
			// 面板拖动 = 锚点迁移：锚点落到面板靠屏幕边缘一侧的上角，
			// 收起后 FAB 恰好出现在收缩动画的终点位置，不跳变。
			const setPanelAndAnchor = (p) => {
				setPanelPos(p);
				setAnchor(anchorForPanel(p));
			};
			// 钳制用真实高度 panelH——用估算值会把面板卡在半屏拖不下去。
			const panelDrag = useDrag(panelPos ?? anchor, setPanelAndAnchor, PANEL_W, panelH);

			// 打开后按真实面板尺寸再对齐一次（向上展开需要准确高度），绘制前完成无闪烁。
			useLayoutEffect(() => {
				if (!open || !alignRef.current || !cardRef.current) return;
				alignRef.current = false;
				const realH = cardRef.current.offsetHeight;
				setPanelH(realH);
				const real = panelPlacement(anchor, realH);
				setOrigin(originFor(anchor, real));
				setPanelPos((p) => (p && p.x === real.x && p.y === real.y ? p : real));
			}, [open]);

			// 面板内容高度变化时同步实测值，拖动钳制永远用真实高度。
			useEffect(() => {
				if (!open || !cardRef.current || typeof ResizeObserver === "undefined") return;
				const observer = new ResizeObserver((entries) => {
					const next = entries[0].contentRect.height;
					if (next > 0) setPanelH(next);
				});
				observer.observe(cardRef.current);
				return () => observer.disconnect();
			}, [open]);

			const openPanel = () => {
				const est = panelPlacement(anchor, PANEL_H_EST);
				alignRef.current = true;
				setOrigin(originFor(anchor, est));
				setPanelPos(est);
				setOpen(true);
			};

			if (!open) {
				return h("button", {
					className: "dop-fab" + (fabDrag.dragging ? " dop-dragging" : ""),
					style: { left: anchor.x, top: anchor.y },
					type: "button",
					title: "打开工具坞",
					"aria-label": "打开工具坞",
					...fabDrag.handlers,
					onClick: () => {
						if (!fabDrag.shouldSuppressClick()) openPanel();
					}
				}, h(FabIcon));
			}

			return h("aside", {
				ref: cardRef,
				className: "dop-card" + (closing ? " dop-closing" : ""),
				style: { left: panelPos.x, top: panelPos.y, transformOrigin: origin },
				role: "complementary",
				"aria-label": "工具坞",
				onAnimationEnd: (e) => {
					if (closing && /Out$/.test(e.animationName)) {
						setOpen(false);
						setClosing(false);
						setPanelPos(null);
					}
				}
			},
				h("header", {
					className: "dop-header" + (panelDrag.dragging ? " dop-dragging" : ""),
					title: "拖动移动面板",
					...panelDrag.handlers
				},
					h("span", { className: "dop-grip" }, h(GripIcon)),
					h("span", { className: "dop-title" }, "工具坞"),
					h("button", {
						className: "dop-view-toggle",
						type: "button",
						title: view === "stats" ? "切换到插件列表" : "切换到 token 统计",
						"aria-label": view === "stats" ? "切换到插件列表" : "切换到 token 统计",
						onPointerDown: (e) => e.stopPropagation(),
						onClick: () => setView((v) => (v === "stats" ? "plugins" : "stats"))
					}, view === "stats" ? h(GridIcon) : h(ChartIcon)),
					h("button", {
						className: "dop-close",
						type: "button",
						title: "收起面板",
						"aria-label": "收起面板",
						onPointerDown: (e) => e.stopPropagation(),
						onClick: startClose
					}, h(CloseIcon))
				),
				h("div", { className: "dop-body" },
					view === "stats"
						? h(TokenStatsView, {
							store: props.sessionStore,
							workspaceStore: props.workspaceStore,
							sessionActions: props.sessionActions
						})
						: h(PluginListView, {
							pluginInventory: props.pluginInventory,
							dynamicRunner: props.dynamicRunner
						})
				)
			);
		}

		function apply(ctx) {
			ctx.effect(() => {
				const sessions = ctx.get("sessions");
				const workspaces = ctx.get("workspaces");
				const style = document.createElement("style");
				style.textContent = STYLE_TEXT;
				document.head.appendChild(style);
				const container = document.createElement("div");
				document.body.appendChild(container);
				const root = createRoot(container);
				root.render(h(OverlayPanelApp, {
					sessionStore: sessions?.list ?? null,
					workspaceStore: workspaces?.list ?? null,
					sessionActions: sessions ?? null,
					pluginInventory: ctx.get("remote.pluginInventory") ?? null,
					dynamicRunner: ctx.get("remote.dynamicCordisRunner") ?? null
				}));
				return () => {
					root.unmount();
					container.remove();
					style.remove();
				};
			}, "dsh-overlay-panel: mount");
		}

		exports.apply = apply;
		return module.exports;
	}
});
