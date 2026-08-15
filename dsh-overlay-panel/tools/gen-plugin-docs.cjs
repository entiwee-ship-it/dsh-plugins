/**
 * 工具坞插件说明数据生成器（DSH 升级后重跑）：
 * 读取实时清单提取结果（entryId ↔ moduleName），为每个模块生成
 * 中文简介（README.zh.md 首段）与可关闭性分类，输出可内联进 client.js 的 JS。
 *
 * 用法：
 *   node gen-plugin-docs.cjs <清单JSON路径> [输出JS路径]
 *
 * 清单 JSON 格式：[{ "id": "include:timer", "mod": "@deepseek-ai/cordis-plugin-timer" }, ...]
 * 获取方式（面板 → 插件列表视图，在页面控制台执行）：
 *   copy(JSON.stringify(Array.from(document.querySelectorAll('.dop-rank-scroll .dop-session'))
 *     .map(r => ({ id: r.querySelector('.dop-plugin-name')?.textContent, mod: r.getAttribute('title') }))))
 */
const fs = require("fs");
const path = require("path");

const NMX = "C:/Users/Administrator/AppData/Local/npm-cache/_npx/1e7f6d9597241db0/node_modules";
const PROFILE_NMX = "C:/Users/Administrator/.dsh/profiles/node_modules";
const INPUT = process.argv[2] ?? "E:/xile-workspace/work/plugin-inventory2.txt";
const OUTPUT = process.argv[3] ?? "E:/xile-workspace/work/plugin-docs.generated.js";
const RAW = fs.readFileSync(INPUT, "utf8");
const entries = JSON.parse(RAW.substring(RAW.indexOf("["), RAW.lastIndexOf("]") + 1))
	.filter((e) => e.id && e.mod && !e.mod.startsWith("所属会话"));

// 出厂 bundle 行 id → 来源层
function rowIdsOf(patchPath) {
	const text = fs.readFileSync(patchPath, "utf8");
	const ids = new Set();
	for (const m of text.matchAll(/^\s+-\s+id:\s*([\w-]+)\s*$/gm)) ids.add(m[1]);
	for (const m of text.matchAll(/^-\s+id:\s*([\w-]+)\s*$/gm)) ids.add(m[1]);
	return ids;
}
const baseRows = rowIdsOf(path.join(NMX, "@deepseek-ai/dsh-base/cordis.patch.yml"));
const webRows = rowIdsOf(path.join(NMX, "@deepseek-ai/dsh-web-app/cordis.patch.yml"));

const USER_PATCH_IDS = new Set(["include:overlay-panel", "include:mcp-cocos", "include:mcp-project-memory-manager"]);

function sourceOf(entryId) {
	if (USER_PATCH_IDS.has(entryId)) return "user";
	if (entryId === "include") return "include-root";
	if (entryId.startsWith("include:")) {
		const row = entryId.slice("include:".length);
		if (baseRows.has(row)) return "base";
		if (webRows.has(row)) return "webapp";
		return "bundle";
	}
	return "bundle"; // 无显式 id 的 hash 行
}

// 模块名 → 包目录
function pkgDirOf(mod) {
	if (mod === "dsh-overlay-panel") return path.join(PROFILE_NMX, "dsh-overlay-panel");
	if (mod === "cordis:include") return path.join(NMX, "@deepseek-ai/cordis-plugin-include");
	const scoped = mod.match(/^@[^/]+\/[^/]+/);
	if (scoped && mod.startsWith("@deepseek-ai/")) return path.join(NMX, scoped[0]);
	return null;
}

// 手工打磨的简介覆盖（README 缺失或过于笼统的条目）。
const DESC_OVERRIDES = {
	"cordis:include": "批量挂载器：把出厂插件清单（dsh-base 基础层 + dsh-web-app Web 层）展开成 Loader 行。",
	"@deepseek-ai/cordis-plugin-timer": "Cordis 定时器服务：可随插件生命周期自动回收的 timeout/interval/throttle/debounce。",
	"@deepseek-ai/dsh-web-app": "Web 模式装配包：浏览器外壳、页面启动与 Web 传输层的组合入口。"
};

// README.zh.md 首个实质段落作为中文简介
function descriptionOf(dir) {
	for (const file of ["README.zh.md", "README.md"]) {
		const p = path.join(dir, file);
		if (!fs.existsSync(p)) continue;
		const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
		for (const raw of lines) {
			const line = raw.trim();
			if (!line) continue;
			if (line.startsWith("#")) continue;
			if (line.startsWith("[")) continue;
			if (line.startsWith("|")) continue;
			if (line.startsWith("```")) continue;
			if (/^[-*]\s/.test(line)) continue;
			const clean = line
				.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
				.replace(/[`*]/g, "")
				.trim();
			if (clean.length < 8) continue;
			return clean.length > 72 ? clean.slice(0, 72) + "…" : clean;
		}
	}
	return "";
}

// 可关闭性分类
const CORE = new Set([
	"cordis", "@deepseek-ai/cordis", "@deepseek-ai/cordis-plugin-include", "@deepseek-ai/cordis-plugin-group",
	"@deepseek-ai/cordis-plugin-loader", "@deepseek-ai/cordis-plugin-timer",
	"@deepseek-ai/dsh-llm", "@deepseek-ai/dsh-session", "@deepseek-ai/dsh-session-persistence",
	"@deepseek-ai/dsh-session-persistence-jsonl", "@deepseek-ai/dsh-agent", "@deepseek-ai/dsh-agent-loop",
	"@deepseek-ai/dsh-agent-instructions", "@deepseek-ai/dsh-system-prompt", "@deepseek-ai/dsh-persona",
	"@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-connection", "@deepseek-ai/dsh-client-web",
	"@deepseek-ai/dsh-client-web-react", "@deepseek-ai/dsh-app-boot", "@deepseek-ai/dsh-host-webserver",
	"@deepseek-ai/dsh-host-apiproxy", "@deepseek-ai/dsh-api-gateway", "@deepseek-ai/dsh-api-remotes",
	"@deepseek-ai/dsh-host-frontend-static", "@deepseek-ai/dsh-storage", "@deepseek-ai/dsh-storage-domain",
	"@deepseek-ai/dsh-storage-json", "@deepseek-ai/dsh-subagent", "@deepseek-ai/dsh-tools",
	"@deepseek-ai/dsh-shell", "@deepseek-ai/dsh-web", "@deepseek-ai/dsh-brand", "@deepseek-ai/dsh-invariants",
	"@deepseek-ai/dsh-scope", "@deepseek-ai/dsh-time-context", "@deepseek-ai/dsh-timeout",
	"@deepseek-ai/dsh-atomic-write", "@deepseek-ai/dsh-home-paths", "@deepseek-ai/dsh-launch-environment",
	"@deepseek-ai/dsh-settings", "@deepseek-ai/dsh-settings-file", "@deepseek-ai/dsh-credentials",
	"@deepseek-ai/dsh-credentials-local", "@deepseek-ai/dsh-anonymous-user-id", "@deepseek-ai/dsh-user-approval",
	"@deepseek-ai/dsh-client-modules", "@deepseek-ai/dsh-client-hmr", "@deepseek-ai/dsh-client-locale",
	"@deepseek-ai/dsh-client-ui-layout", "@deepseek-ai/dsh-client-ui-theme", "@deepseek-ai/dsh-client-ui-slots",
	"@deepseek-ai/dsh-client-ui-workspace", "@deepseek-ai/dsh-client-ui-conversation", "@deepseek-ai/dsh-client-ui-sidebar",
	"@deepseek-ai/dsh-typert-loader", "@deepseek-ai/dsh-typert-registry", "@deepseek-ai/dsh-typert-protocol",
	"@deepseek-ai/dsh-session-projection", "@deepseek-ai/dsh-session-telemetry", "@deepseek-ai/dsh-cordis-host-runner",
	"@deepseek-ai/dsh-cordis-client-runner", "@deepseek-ai/dsh-tool-cordis", "@deepseek-ai/dsh-host-directory-picker",
	"@deepseek-ai/dsh-sandbox", "@deepseek-ai/dsh-sandbox-local", "@deepseek-ai/dsh-sandbox-policy",
	"@deepseek-ai/dsh-permission-presets", "@deepseek-ai/dsh-llm-retry", "@deepseek-ai/dsh-output-retention"
]);
function closabilityOf(mod, entryId) {
	if (USER_PATCH_IDS.has(entryId)) return "user";
	if (mod === "cordis:include") return "core";
	if (CORE.has(mod)) return "core";
	if (mod.startsWith("@deepseek-ai/dsh-client-ui-")) return "feature";
	if (mod.startsWith("@deepseek-ai/dsh-tool-")) return "feature";
	if (mod.startsWith("@deepseek-ai/dsh-command-")) return "feature";
	if (mod.startsWith("@deepseek-ai/dsh-skill")) return "feature";
	if (mod.startsWith("@deepseek-ai/dsh-mcp-")) return "feature";
	if (mod.startsWith("@deepseek-ai/dsh-compaction")) return "feature";
	if (mod.startsWith("@deepseek-ai/dsh-goal")) return "feature";
	if (mod.startsWith("@deepseek-ai/dsh-jobs")) return "feature";
	if (mod.startsWith("@deepseek-ai/dsh-web-search")) return "feature";
	if (mod.startsWith("@deepseek-ai/dsh-workflow")) return "feature";
	if (mod.startsWith("@deepseek-ai/dsh-ralph") || mod.startsWith("@deepseek-ai/dsh-tool-")) return "feature";
	return "unknown";
}

const docs = {};
let missing = 0;
for (const e of entries) {
	const dir = pkgDirOf(e.mod);
	let desc = dir && fs.existsSync(dir) ? descriptionOf(dir) : "";
	if (DESC_OVERRIDES[e.mod]) desc = DESC_OVERRIDES[e.mod];
	if (!desc) { missing++; desc = ""; }
	docs[e.mod] = { d: desc, c: closabilityOf(e.mod, e.id) };
}

// 来源判定需要在客户端按 entryId 计算：把两个 bundle 的行 id 集一起导出
const out = `/** 自动生成的插件说明数据（scripts 生成，勿手改；DSH 升级后重跑生成器）。
 * 键为 moduleName；d=中文简介，c=可关闭性（core/feature/user/unknown）。 */
const PLUGIN_DOCS = Object.freeze(${JSON.stringify(docs, null, "\t")});
/** 出厂基础层 dsh-base 的行 id 集（entryId 为 include:<id>）。 */
const PLUGIN_SOURCE_BASE = Object.freeze(${JSON.stringify([...baseRows])});
/** 出厂 Web 层 dsh-web-app 的行 id 集。 */
const PLUGIN_SOURCE_WEB = Object.freeze(${JSON.stringify([...webRows])});
`;
fs.writeFileSync(OUTPUT, out, "utf8");
console.log(`entries=${entries.length} missingDesc=${missing} baseRows=${baseRows.size} webRows=${webRows.size}`);
for (const [k, v] of Object.entries(docs)) if (!v.d) console.log(`MISSING: ${k}`);
