/**
 * dsh-overlay-panel 的 Node 半边：注册 `dailyUsage` 会话投影单元。
 *
 * 背景：浏览器半边的「今日/本周」维度最早靠面板本地基线差值估算，只能统计
 * 面板首次观察到会话之后的增量——面板启用前已跑完的会话（例如已归档的
 * 旧会话）在时间维度下会失真。本投影直接折叠会话日志事件，给出该会话
 * 按自然日（宿主机本地时区）划分的精确 token 四桶与轮/步数：
 *
 *   { "2026-08-14": { input, output, cacheRead, cacheWrite, turns, steps } }
 *
 * 事件口径与官方单元一致：
 * - token：assistant/chunk 的 usage chunk 提供早期采样，assistant/message
 *   提供同一 turn/step 的最终采样；重复采样替换而非累加（单槽 lastUsage，
 *   依赖"同一 turn/step 的用量报告在日志中相邻"的日志不变量）。
 * - 轮/步：step/end 是步生命周期权威（每进入一步恰好一条），turn 变化时
 *   轮数 +1。
 *
 * 值经宿主 api-proxy 的 session/projection 帧推给客户端，出现在
 * row.projectionValues.dailyUsage；注册挂在注入回调上，随插件卸载消失。
 */
const zeroDay = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0, steps: 0 });
const bucketsFrom = (usage) => ({
	input: usage.inputTokens ?? 0,
	output: usage.outputTokens ?? 0,
	cacheRead: usage.cacheReadTokens ?? 0,
	cacheWrite: usage.cacheWriteTokens ?? 0
});
const bucketsEqual = (a, b) =>
	a.input === b.input && a.output === b.output && a.cacheRead === b.cacheRead && a.cacheWrite === b.cacheWrite;
const TOKENS = ["input", "output", "cacheRead", "cacheWrite"];
const isZeroTokens = (b) => TOKENS.every((k) => b[k] === 0);
/** 累加/扣减一天的 token 桶；turns/steps 原样保留。 */
const addTokens = (day, buckets, sign) => {
	const next = { ...day };
	for (const k of TOKENS) next[k] += sign * buckets[k];
	return next;
};
/** 本地日期键 YYYY-MM-DD（与客户端同一台机器、同一时区）。 */
function dayKey(ms) {
	const d = new Date(ms);
	const p = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/**
 * 注册表边界只调用 schema.parse（见 dsh-session-projection 驱动实现）；
 * 值由本插件自控且为纯 JSON，直通校验即可，避免反向依赖 schemastery。
 */
const passThroughSchema = { parse: (v) => v };

const dailyUsageProjectionDefinition = {
	key: "dailyUsage",
	schema: passThroughSchema,
	init: () => ({ days: {}, lastUsage: null, lastTurn: null }),
	apply: (state, event) => {
		let turn;
		let step;
		let usage;
		if (event.type === "assistant/chunk" && event.data.chunk.type === "usage") {
			({ turn, step } = event.data);
			usage = event.data.chunk.usage;
		} else if (event.type === "assistant/message" && event.data.usage !== void 0) {
			({ turn, step, usage } = event.data);
		} else if (event.type === "step/end") {
			// 步/轮计数：与 sessionStats 同口径（step/end 是步生命周期权威）。
			const day = dayKey(event.time);
			const isNewTurn = state.lastTurn !== event.data.turn;
			const cur = state.days[day] ?? zeroDay();
			return {
				...state,
				lastTurn: event.data.turn,
				days: {
					...state.days,
					[day]: { ...cur, turns: cur.turns + (isNewTurn ? 1 : 0), steps: cur.steps + 1 }
				}
			};
		} else return state;
		const day = dayKey(event.time);
		const buckets = bucketsFrom(usage);
		const previous =
			state.lastUsage !== null && state.lastUsage.turn === turn && state.lastUsage.step === step
				? state.lastUsage
				: null;
		if (previous !== null && previous.day === day && bucketsEqual(previous.buckets, buckets)) return state;
		const days = { ...state.days };
		if (previous !== null) {
			// 同一 turn/step 的重复采样：先从其原属日扣减旧值（同日替换则先归零）。
			const reduced = addTokens(days[previous.day] ?? zeroDay(), previous.buckets, -1);
			if (isZeroTokens(reduced) && reduced.turns === 0 && reduced.steps === 0) delete days[previous.day];
			else days[previous.day] = reduced;
		}
		const added = addTokens(days[day] ?? zeroDay(), buckets, 1);
		if (isZeroTokens(added) && added.turns === 0 && added.steps === 0) delete days[day];
		else days[day] = added;
		return { ...state, days, lastUsage: { turn, step, day, buckets } };
	},
	view: (state) => state.days,
	stateVersion: 1
};

export function apply(ctx) {
	ctx.inject(["sessionProjections"], (projectionCtx) => {
		projectionCtx.sessionProjections.register(dailyUsageProjectionDefinition);
		// 冷会话预热：投影 cell 是惰性的，未被触达的冷会话（归档/子代理）没有
		// dailyUsage 缓存行，客户端列表块也就没有这个 key。这里沿冷读阶梯
		// （缓存行 → 尾部回放 → fail-soft 写回）为每个已存储会话构建一次；
		// 行已存在且版本匹配时只回放尾部，幂等且廉价。
		const persistence = ctx.get("sessionPersistence");
		const cache = ctx.get("sessionProjectionCache");
		if (persistence === undefined || cache === undefined) return;
		let stopped = false;
		ctx.effect(() => () => {
			stopped = true;
		});
		(async () => {
			let headers;
			try {
				headers = await persistence.list();
			} catch {
				return;
			}
			for (const header of headers) {
				if (stopped) return;
				try {
					await cache.coldSnapshot(header.id);
				} catch {
					// 单个会话预热失败（日志缺失/损坏）不影响其余会话。
				}
			}
		})();
	});
}
