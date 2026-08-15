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

		/** 自动生成的插件说明数据（scripts 生成，勿手改；DSH 升级后重跑生成器）。
		 * 键为 moduleName；d=中文简介，c=可关闭性（core/feature/user/unknown）。 */
		const PLUGIN_DOCS = Object.freeze({
			"cordis:include": {
				"d": "批量挂载器：把出厂插件清单（dsh-base 基础层 + dsh-web-app Web 层）展开成 Loader 行。",
				"c": "core"
			},
			"@deepseek-ai/cordis-plugin-timer": {
				"d": "Cordis 定时器服务：可随插件生命周期自动回收的 timeout/interval/throttle/debounce。",
				"c": "core"
			},
			"@deepseek-ai/dsh-llm": {
				"d": "提供方无关的 LLM（大语言模型）词汇与抽象服务。本包定义 agent loop（智能体循环）、会话日志和所有插件共同使用的规范词汇。",
				"c": "core"
			},
			"@deepseek-ai/dsh-session": {
				"d": "事件溯源的会话日志和内存存储。Session 是 agent（智能体）全部交互历史的仅追加真源，LLM（大语言模型）消息历史由它派生。原始日志之…",
				"c": "core"
			},
			"@deepseek-ai/dsh-typert-registry": {
				"d": "生成的 Typert 产物所用的运行时注册表。每个注册项包含某个包在一个 face 上的业务反射信息，以及可选的运行时 Zod schema；c…",
				"c": "core"
			},
			"@deepseek-ai/dsh-typert-loader": {
				"d": "生成的 Typert 产物所用的 Loader 集成，仅支持 Node。该插件需要 ctx.loader 和 ctx.typert；它本身不提供…",
				"c": "core"
			},
			"@deepseek-ai/dsh-api-gateway": {
				"d": "为 Host 与 Client 两侧的 Cordis 环境提供 Typert RPC endpoint。Host 入口提供 ctx.typert…",
				"c": "core"
			},
			"@deepseek-ai/dsh-session-title": {
				"d": "由日志支持的会话标题，提供即时确定性回退与一个可选异步提供方。每次已接受的修订都是仅写入日志的 session/title 事件；foldSes…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-session-title-first-prompt-llm": {
				"d": "可选的 ctx.sessionTitle 提供方，通过 ctx.llm 总结第一条符合条件的用户消息。它注册 first-prompt 节奏，只…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-user-questions": {
				"d": "用户交互 Service Definition。它定义 ctx.userQuestions，供面向模型的工具或权限插件在需要暂停工作并询问人类决…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-agent": {
				"d": "Agent 接口、注册表、进程本地发起方作用域，以及 agent/ 事件词汇。每个插件（UI、钩子、编排器）都面向此处定义的 Agent han…",
				"c": "core"
			},
			"@deepseek-ai/dsh-agent-default-model": {
				"d": "该部署默认值供入口在创建尚无会话级模型选择的 Agent 时使用。AgentDefaultModelConfig 提供 ctx.agentDef…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-jobs-local": {
				"d": "maxConcurrentJobsPerOwner 必须是正的安全整数，默认值为 10。调用生产方之前，start() 会统计确切 owner …",
				"c": "feature"
			},
			"@deepseek-ai/dsh-llm-retry": {
				"d": "一个函数插件，通过 agent loop（智能体循环）在已关闭步骤上触发的 agent/request-error waterfall（瀑布式事…",
				"c": "core"
			},
			"@deepseek-ai/dsh-settings-file": {
				"d": "基于文件的设置提供方。一个 YAML 或 JSON 文档承载全部 namespace 分节；外部编辑经 ctx.settings 热发布，upd…",
				"c": "core"
			},
			"@deepseek-ai/dsh-credentials-local": {
				"d": "文件型凭据提供方：四层来源，一套明确的优先级。",
				"c": "core"
			},
			"@deepseek-ai/dsh-llm-pi-ai": {
				"d": "基于 @earendil-works/pi-ai 的 harness LLM（大语言模型）seam 通用多提供方适配器。一个插件实例拥有一份以路…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-session-persistence-jsonl": {
				"d": "JSONL 持久会话存储后端：SessionPersistence 的一个具体实现（dsh-session-persistence seam）。…",
				"c": "core"
			},
			"@deepseek-ai/dsh-attachment-local": {
				"d": "这是 @deepseek-ai/dsh-attachment 的私有本地实现。对象存放在 <DSH_HOME>/attachments/v1/o…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-session-query-sqlite": {
				"d": "具体 ctx.sessionQuery 提供方。SqliteSessionQueryEngine 从 Service Definition 包继…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-session-projection": {
				"d": "会话投影 Service Definition 与驱动注册表。它拥有 ctx.sessionProjections：该注册表在已提交的会话事件上…",
				"c": "core"
			},
			"@deepseek-ai/dsh-session-telemetry-otel": {
				"d": "name: '@deepseek-ai/dsh-session-sessionTelemetry-otel'",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-subprocess-local": {
				"d": "通过 Consumer 间接影响（目前是 dsh-tool-bash 背后的 bash 执行器家族）；进程输出与生命周期面向模型的全部渲染归 C…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-sandbox-local": {
				"d": "包根目录导出默认及命名的 LocalSandboxProvider 插件和 Config；平台 profile builder 仍为内部实现。",
				"c": "core"
			},
			"@deepseek-ai/dsh-sandbox-policy": {
				"d": "沙箱策略解析的唯一归属位置：部署默认 SandboxMode 与回退根目录，加上每个会话的持久模式覆盖和不可变工作区根目录。每项负责强制执行的能…",
				"c": "core"
			},
			"@deepseek-ai/dsh-pwsh-sandbox": {
				"d": "沙盒消费型的 ctx.shell 执行器 seam 的 PowerShell 实现：每条命令以 pwsh -NoLogo -NoProfile …",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-user-approval": {
				"d": "与通道无关的一次性审批 seam。ctx.approval.request(req) 返回 allowed-once、rejected、canc…",
				"c": "core"
			},
			"@deepseek-ai/dsh-permission-presets": {
				"d": "通过 ctx.permissionPresets（PermissionPresetService）提供面向用户的权限预设。每个配置名称都会将 s…",
				"c": "core"
			},
			"@deepseek-ai/dsh-shell-env": {
				"d": "工具无关的 shell 环境插件：拥有 ctx.shellEnv 注册表，管理受信任的、每次执行收集的 DSH_ 变量，供模型可见的 shell…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-fs-observation-policy": {
				"d": "fs-observation-policy 插件：它记录观测到的存在或缺失状态，并在 ctx.fs 提供方约定（@deepseek-ai/dsh…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-skill": {
				"d": "纯 agent skill（智能体技能）提供方注册表。",
				"c": "feature"
			},
			"@deepseek-ai/dsh-commands": {
				"d": "由插件负责、供交互式 UI 适配器使用的面向用户命令注册表。插件命令注册 Agent Note定义了其边界与分发约定。",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-command-feedback": {
				"d": "与触发方式无关的会话反馈，以及面向用户的 /feedback 采集。本包导出 recordFeedback(session, text)；该函数…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-goal": {
				"d": "事件溯源的同会话目标状态。该服务在 agent（智能体）的现有会话中保留一个当前待完成目标，同时将继续执行的权限作为进程本地续行启用状态。goa…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-goal-round-driver": {
				"d": "name: '@deepseek-ai/dsh-goal'",
				"c": "feature"
			},
			"@deepseek-ai/dsh-command-goal": {
				"d": "面向用户的 /goal 控制，基于 ctx.goals 实现。该插件通过 ctx.commands 注册一个全局命令，因此每个已组合的命令适配器…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-token-meter": {
				"d": "通过单例 ctx.tokenMeter 服务进行具备回放感知能力的 token 测量。它从持久日志为每个会话推进一个隔离 fold，因此压缩（c…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-subagent": {
				"d": "subagent seam 允许一个 agent（智能体）通过具名提供方把工作委派给子 agent。调用方统一使用 ctx.subagents …",
				"c": "core"
			},
			"@deepseek-ai/dsh-subagent-spawn-in-process": {
				"d": "spawn 提供方会在当前进程中创建一个全新的子 Agent。子 agent（智能体）有自己的会话，看不到父 agent 的对话历史，并复用宿主…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-subagent-fork-in-process": {
				"d": "fork 提供方会创建一个进程内子 agent（智能体），并以父 agent 已完成的对话轮次作为初始内容。它与 spawn 共用全部运行机制；…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-tool-subagent-report": {
				"d": "可选的子级作用域 report 工具是 ctx.subagents.reportFrom() 之上的轻量适配器。它为每个可继续的进程内子级提供一…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-tool-call-timeout-policy": {
				"d": "工具调用超时强制执行器：单个 tools/execute 环绕分发监听器，会在 exec.signal 上设置单次调用的协作式截止时间；适用于声…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-spill-local": {
				"d": "文件存放在 <root>/session-<hash>/​<random>-<safeName>：",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-spill-policy": {
				"d": "工具结果 spill 策略：一个 tools/post-execute 转换器，用于防止过大的纯文本工具结果进入模型上下文。当最终结果超过 ma…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-session-checkpoint-policy": {
				"d": "已持久化的 agent（智能体）的语义持久性策略。它会在模型适配器收到请求前、顶层工具正文可产生外部副作用前，以及每个 agent/pre-st…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-repeat-tool-reminder": {
				"d": "这是一个仅提供建议的循环中断器，而非面向模型的工具：它不会出现在工具列表中，不会否决或改写调用，只增加一种行为。它监视每个 agent（智能体）…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-web": {
				"d": "WebRuntime（ctx.web）定义 harness 具备哪些 web 访问能力（搜索 web、抓取 URL），并通过多个提供方实现，不把…",
				"c": "core"
			},
			"@deepseek-ai/dsh-web-search-deepseek": {
				"d": "由 DeepSeek 支持的 WebSearchProvider，用于 harness web 能力 seam（ctx.web）。它调用 Dee…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-tools": {
				"d": "工具注册表与执行流水线。工具插件注册各自的 schema 和执行器；agent loop（智能体循环）依次让每次调用经过 tools/pre-e…",
				"c": "core"
			},
			"@deepseek-ai/dsh-system-prompt": {
				"d": "系统提示词组装注册表。插件可以贡献有序段、工具 schema 和具名变量。循环在每个步骤组装一次，并将结果渲染为完整的模型提示词。此插件拥有静态…",
				"c": "core"
			},
			"@deepseek-ai/dsh-agent-loop": {
				"d": "agent（智能体）的唯一具体实现插件和循环驱动器。其包内部实现满足 Agent 接口，并驱动会话、轮次和步骤的生命周期。",
				"c": "core"
			},
			"@deepseek-ai/dsh-fs-sandbox": {
				"d": "SandboxedFileSystem 扩展 LocalFileSystem 并注册为 ctx.fs。它逐字继承全部文本存储机制（解析、stat…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-llm-deepseek": {
				"d": "harness LLM（大语言模型）seam 的 DeepSeek chat-completions 适配器：直接 fetch + SSE（Se…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-code-runtime-worker-thread": {
				"d": "这是 @deepseek-ai/dsh-code-runtime seam 的 worker 线程实现：WorkerThreadCodeRunt…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-storage": {
				"d": "非会话数据的存储中心（ctx.storage）：具名后端注册表加已挂载的数据形式设施。中心自身不执行 IO：后端拥有介质，数据形式拥有语义。存储…",
				"c": "core"
			},
			"@deepseek-ai/dsh-storage-json": {
				"d": "无。该后端不贡献提示词、工具或 schema；它在 ctx.storage 后面持久化非会话领域数据，只供宿主侧消费方使用。",
				"c": "core"
			},
			"@deepseek-ai/dsh-storage-domain": {
				"d": "DeepSeek Harness 存储中心的领域数据形式：在所有已配置的后端注册后，公开可注入的 ctx.storageDomain 服务及对应…",
				"c": "core"
			},
			"@deepseek-ai/dsh-message-feedback": {
				"d": "本包提供由 Host 拥有、针对单条已完成 assistant 消息的可编辑反馈。它注册 ctx.messageFeedback，在 stora…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-session-log-export": {
				"d": "Web Session 日志下载控制，使用 dsh-host-apiproxy 拥有的 Host 流式 ZIP 端点。Host 半包注册 /ex…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-workspace": {
				"d": "DeepSeek Harness 的 Workspace 实体注册表（ctx.workspaceRegistry）：通过领域数据形式存储持久 w…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-session-projection-cache": {
				"d": "持久投影缓存（ctx.sessionProjectionCache）：把每个已注册投影单元的状态持久化为检查点，基于域数据形态（domain d…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-session-stats": {
				"d": "注册 sessionStats projection 单元的函数插件：从步边界、流式 chunk、工具配对与已组装的 assistant 消息折…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-host-directory-picker-auto": {
				"d": "判定是一次纯函数的启动时采样（resolveDirectoryPickerBackend），已导出供复用。native 要求“操作者看得到宿主屏…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-host-plugin-inventory": {
				"d": "当前 Cordis Loader 树的只读 Host 投影。PluginInventoryGateway 注册 pluginInventory …",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-host-apiproxy": {
				"d": "所有客户端共用的 API 网关由三部分组成：TypeScript API 约定（src/api/，不依赖 Node，可从浏览器导入）、fetch…",
				"c": "core"
			},
			"@deepseek-ai/dsh-cordis-host-runner": {
				"d": "由模型挂载的动态包在 host 侧的那一半：定义注册表、host 半所用的 node:vm 沙箱与 fiber 生命周期、invoke hand…",
				"c": "core"
			},
			"@deepseek-ai/dsh-web-app/startup": {
				"d": "dsh 浏览器表层组合包。cordis.patch.yml 叠加在 dsh-base 之上：设置 coding persona，插入 Web 宿…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-host-webserver": {
				"d": "Web HTTP 与 upgrade route 注册插件（默认导出 WebServer，配置为 {host, port}）：一个在激活时开始监…",
				"c": "core"
			},
			"@deepseek-ai/dsh-web-app": {
				"d": "Web 模式装配包：浏览器外壳、页面启动与 Web 传输层的组合入口。",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-client-hmr": {
				"d": "为通过脚本加载的客户端插件提供热重载。web 组合包无条件挂载该行；没有重建 watcher（pnpm run dev:web）改写客户端 bu…",
				"c": "core"
			},
			"@deepseek-ai/dsh-client-modules": {
				"d": "客户端模块系统：Node 内部 ESM loader 的浏览器端对等实现，以惰性 CJS 表实现。web 外壳挂载 vendored cordi…",
				"c": "core"
			},
			"@deepseek-ai/dsh-client-connection": {
				"d": "协议消费层：客户端插件的 apply 会挂载 ctx.connection（共享 API 客户端 + 当前页面的 loopback 状态 + 可…",
				"c": "core"
			},
			"@deepseek-ai/dsh-api-remotes": {
				"d": "为本应用选定的 Host Remote 能力提供双侧 BFF。Host 入口负责 Agent/Session 身份策略；Client 入口以运行…",
				"c": "core"
			},
			"@deepseek-ai/dsh-client-runtime": {
				"d": "客户端 cordis 启动与不依赖 React 的对象服务：SlotRegistry 包装 SlotCore 并提供 renderer 数据源；…",
				"c": "core"
			},
			"@deepseek-ai/dsh-cordis-client-runner": {
				"d": "动态双半插件包的浏览器半。host 侧 runner 把每个定义的代码留在进程内存里，并经一条 cordis/request-run 事件向打开…",
				"c": "core"
			},
			"@deepseek-ai/dsh-client-ui-theme": {
				"d": "主题插件：基于 --dsw- token 基础样式表（静态尺度 + 别名语义层）的 ThemeRuntime。该服务拥有实时主题偏好（light…",
				"c": "core"
			},
			"@deepseek-ai/dsh-client-locale": {
				"d": "locale 插件：LocaleRuntime——zh／en 偏好以 locale.preference 存储在 $DSH_HOME/setti…",
				"c": "core"
			},
			"@deepseek-ai/dsh-client-ui-layout": {
				"d": "外壳插件：三栏 AppFrame（拖动手柄与让步链）加 ctx.layout 面板几何服务；它注册到运行时拥有的 root slot，并声明 s…",
				"c": "core"
			},
			"@deepseek-ai/dsh-client-ui-sidebar": {
				"d": "侧边栏外壳插件：负责字标、New Session 操作、布局持有的折叠控件、可感知滚动的区域 seat，以及固定在底部的 Settings se…",
				"c": "core"
			},
			"@deepseek-ai/dsh-client-ui-settings": {
				"d": "设置领域的底座，承担两项职责，本身不含任何呈现内容。它提供 ctx.settingsScope——每个偏好设置行绑定自己那份持久化命名空间分区所…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-client-ui-settings-general": {
				"d": "设置外壳、无特定功能归属文案与持久化产品引导 namespace。它以触发控件和模态设置面板占用 sidebar.settings，把 sett…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-client-ui-settings-models": {
				"d": "模型设置与产品引导插件。同一个 client Cordis 插件会注册 Models 页面和两个有序的首次使用弹窗：版本化内测声明，以及按条件显…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-client-ui-settings-plugin-inventory": {
				"d": "Web 设置中的只读插件列表标签页。浏览器插件注册一个 id 为 all 的本地化 settings.plugins.tab 贡献；“插件”分区…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-client-ui-conversation": {
				"d": "会话领域：骨架（标题栏／标签页／编辑器／空状态）、聊天视图（分组步骤摘要流、流式尾部隔离与轮次状态）、编辑器 dock（与输入区一同 stick…",
				"c": "core"
			},
			"@deepseek-ai/dsh-client-ui-tool": {
				"d": "Client 工具展示插件。ui-conversation 通过 conversation.chat.node 的匹配 key 分发每个已排序的…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-client-ui-cordis": {
				"d": "Cordis 动态插件的浏览器半：一个覆盖整个框架的面板，操作 host 持有的全部定义；以及一张只读的 cordis_define 卡片，记录…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-client-ui-workflow-run": {
				"d": "这个浏览器插件把持久化的顶层工作流运行重建为独立 Chat 节点。它消费由 dsh-tool-workflow 拥有的四类 tool-workf…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-client-ui-deliverables": {
				"d": "产出文件与可点击文件引用功能的属主。Node 侧向系统提示词 registry 注册最终回复指引；浏览器侧把已完成轮次末尾的产出文件行注册到 c…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-client-ui-workspace": {
				"d": "共享 Workspace 浏览器与选择器插件。WorkspaceBrowser 填充侧边栏的 sidebar.workspaces slot，W…",
				"c": "core"
			},
			"@deepseek-ai/dsh-client-ui-input-trigger": {
				"d": "输入触发流水线插件：光标处的 / 与 @ 检测（词边界 + guard tier 规则）、分组候选菜单，以及把 pick 路由到已注册 sour…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-client-ui-commands": {
				"d": "客户端命令 API（ctx.commandUi）：以会话为 key 的命令目录缓存、带 matchSpace／matchEnter 决策钩子的 …",
				"c": "feature"
			},
			"@deepseek-ai/dsh-client-ui-skill": {
				"d": "skill（技能）调用 source 的浏览器端：把 / 触发的 skill source 注册进 ctx.inputTriggers。普通会话…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-client-ui-subagent": {
				"d": "Web subagent 功能 owner：向 conversation.session.header.actions 贡献可懒加载展开的目录树…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-client-ui-jobs": {
				"d": "Web 后台任务特性的归属方：向 conversation.session.header.actions 贡献一个条目，列出当前会话可见的 ct…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-client-ui-goal": {
				"d": "Goal 界面插件（浏览器端部分）：GoalBar 条带是 conversation.input.dock composer 上下文堆栈中的第二…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-client-ui-message-feedback": {
				"d": "单条消息反馈插件的浏览器侧：一对 Like/Dislike 按钮加一个可选备注，作为 conversation.chat.assistant-a…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-client-ui-model-selection": {
				"d": "模型选择插件（浏览器侧）：两个入口共用一份会话级目录，由 ModelDirectoryResolver（ctx.modelDirectories…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-client-ui-permission-presets": {
				"d": "面向两种不同生命周期的浏览器权限界面。「通用」设置行读取显式暴露的 permission Settings 描述符，从 host 的动态 def…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-client-ui-agent-preset": {
				"d": "agent preset 的各个表层：General 设置中的一行，用于选择新建会话据以组装的 preset；新建会话界面上的一枚 chip，用…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-client-ui-settings-plugins": {
				"d": "插件设置分区及其插件配置标签页。该分区拥有标题与紧凑的标签栏；功能插件通过 settings.plugins.tab 贡献页面。本包自己的标签页…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-client-ui-plan": {
				"d": "Plan mode 状态徽章，纯浏览器 surface 插件。浏览器侧占用会话声明的 conversation.input.plan 单实例 s…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-client-ui-user-questions": {
				"d": "Web 提问功能插件：其浏览器侧把 question 条目注册到会话拥有的 conversation.composer 键控 slot 中。其主…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-client-ui-trajectory": {
				"d": "Trajectory 渲染按轮次组织的事件记录表，其中可选择用户、助手、工具和嵌套子工具记录。较粗的分割线标示轮次边界，紧凑的行内标记标识步骤，…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-agent-presets": {
				"d": "按 preset 组装 agent（智能体）。preset 是一个目录，其中放置一份 agent.cordis.yml；roster 在整个进程…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-persona": {
				"d": "把 agent（智能体）人设做成一个可组装的行：它既可以遮蔽部署级人设，也可以拥有完整系统提示词。",
				"c": "core"
			},
			"@deepseek-ai/dsh-agent-instructions": {
				"d": "为每个会话加载与 AGENTS.md 兼容的工作区指令文件。该插件会将初始的用户全局指令与项目指令链注入持久历史，随后发现嵌套文件，并在成功的文…",
				"c": "core"
			},
			"@deepseek-ai/dsh-tool-pwsh": {
				"d": "注册在 ctx.shell 执行器 seam 之上的面向模型的 pwsh 工具。面向由 PowerShell 执行器（如 @deepseek-a…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-tool-fs": {
				"d": "面向模型的文件系统工具（read、read_image、write、edit）及其执行器。这是文件系统栈的消费方层：拥有工具名称、JSON Sc…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-tool-fs-search": {
				"d": "面向模型的文件系统发现工具（glob、grep）由 打包的 ripgrep 二进制（@vscode/ripgrep）支持，而不是由 ctx.fs…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-tool-jobs": {
				"d": "ctx.jobs 的面向模型控制器：三个与 kind 无关的工具、完成通知和一个后台工作提示词区段。加载该插件会附加 ctx.jobs.star…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-tool-goal": {
				"d": "所有调用都互斥，因此模型排序的批次能观察到更早变更及其新 revision。UI 客户端会收到纯通用卡片：get_goal 使用 read，变更…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-tool-ask-user": {
				"d": "模型侧 ask_user_question 工具，基于 ctx.userQuestions 实现。当模型需要确认、选择结果或缺失的信息才能继续时…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-tool-todo": {
				"d": "面向模型的 todo_write 工具：agent（智能体）的完整任务列表，每次调用都会整体替换。",
				"c": "feature"
			},
			"@deepseek-ai/dsh-tool-web": {
				"d": "面向模型的 web 工具套件 web_search 与 web_fetch，构建于 web 能力 seam（ctx.web）之上。它只负责面向模…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-tool-cordis": {
				"d": "自引用 Cordis 工具集：五个面向模型的工具，操作当前 DSH 进程中的实时运行时。注册表、vm 沙箱与浏览器广播属于 @deepseek-…",
				"c": "core"
			},
			"@deepseek-ai/dsh-skill-filesystem": {
				"d": "ctx.skills 注册表的本地文件系统提供方。",
				"c": "feature"
			},
			"@deepseek-ai/dsh-tool-skill": {
				"d": "面向模型的 skill（技能）目录和 skill 工具。",
				"c": "feature"
			},
			"@deepseek-ai/dsh-plan-mode": {
				"d": "按 agent（智能体）分别记录到日志的 plan 协作状态，提供由部署方配置的引导内容、用于直接进入的 /plan [message] 命令、…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-compaction-basic": {
				"d": "基础压缩（compaction）后端：BasicCompactionEngine 实现 @deepseek-ai/dsh-compaction …",
				"c": "feature"
			},
			"@deepseek-ai/dsh-command-compact": {
				"d": "通过 ctx.compaction 提供面向用户的 /compact 压缩（compaction）控制。该插件通过 ctx.commands 注…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-compaction-tool-result-pruner": {
				"d": "可安全回放、不依赖模型的剪枝服务（ctx.toolResultPruner）。它会将超出预算的 tool/result 表层节点改写为长度受限的…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-tool-subagent-control": {
				"d": "可选的全局具名 send_message、interrupt_agent 与 list_agents 工具是 ctx.subagents 之上的…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-tool-subagent-control/list-agents": {
				"d": "可选的全局具名 send_message、interrupt_agent 与 list_agents 工具是 ctx.subagents 之上的…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-tool-subagent": {
				"d": "基于一个已配置 ctx.subagents 提供方、面向模型的委派工具。更换提供方只会改变传输，不会改变执行约定。",
				"c": "feature"
			},
			"@deepseek-ai/dsh-workflow-worker-thread": {
				"d": "本包为 WorkflowEngine 提供实现，每次运行使用一个 Node worker thread。worker 执行编排脚本；子 agen…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-tool-workflow": {
				"d": "面向模型的 workflow 工具：运行一段扇出 subagent 的 JavaScript 编排脚本，并返回脚本的最终值。本包负责基于 ctx…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-tool-ralph": {
				"d": "面向模型的 ralph 工具运行固定的前台工作流，把一个不可变目标依次交给多个全新子 agent（智能体）。它展示如何把专用编排策略实现为基于 …",
				"c": "feature"
			},
			"@deepseek-ai/dsh-mcp-client": {
				"d": "MCP 客户端桥接插件：连接外部 Model Context Protocol 服务器，把它们的工具注册到 ctx.tools，使模型能够通过服…",
				"c": "user"
			},
			"dsh-overlay-panel": {
				"d": "DSH Web 的自有界面插件：悬浮工具面板「工具坞」——多视图（token 统计 / 插件列表）。",
				"c": "user"
			},
			"@deepseek-ai/dsh-host-directory-picker-native": {
				"d": "双面包：浏览器端（./client）向 ui-workspace 的两个目录流 slot 注册一个无渲染的流程占用者——每次 open 请求驱动…",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-client-ui-directory-picker-native": {
				"d": "原生目录选择界面：原生选取交互的浏览器半边。它通过 ui-workspace 的两个 directory-flow 洞（conversation…",
				"c": "feature"
			},
			"@deepseek-ai/cordis-plugin-hmr": {
				"d": "Hot module replacement for loader-managed Cordis plugins.",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-bash-sandbox": {
				"d": "这是使用沙箱能力的 @deepseek-ai/dsh-shell 执行器 seam 的 Service Provider。加载它时，应用它替代 …",
				"c": "unknown"
			},
			"@deepseek-ai/dsh-tool-bash": {
				"d": "模型侧 bash 工具，注册在 ctx.shell 执行器 seam 上。前台执行始终位于该 seam 之后；后台进程句柄会注册到通用 ctx.…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-skill-badge": {
				"d": "可选的内置 skill（技能）提供方，向 ctx.skills 贡献 dsh-badge。该 skill 提供官方「powered by dsh…",
				"c": "feature"
			},
			"@deepseek-ai/dsh-tool-str-replace-editor": {
				"d": "基于 ctx.fs、面向模型的独立 str_replace_editor。它可与持久 Bash、一次性 Bash、沙箱 Bash 或其他终端接口…",
				"c": "feature"
			}
		});
		/** 出厂基础层 dsh-base 的行 id 集（entryId 为 include:<id>）。 */
		const PLUGIN_SOURCE_BASE = Object.freeze(["timer","hmr","llm","session","typert","typert-loader","typert-gateway","session-title","session-title-llm","user-questions","agent","agent-default-model","jobs","llm-retry","settings","credentials","llm-pi-ai","session-persistence-jsonl","attachment-local","session-query-sqlite","session-projection","session-telemetry-otel","subprocess","sandbox","sandbox-policy","bash-sandbox","pwsh-sandbox","approval","permission","shell-env","tool-bash","tool-pwsh","tool-jobs","fs-observation-policy","tool-fs","tool-fs-search","agent-instructions","skill","skill-filesystem","skill-badge","tool-skill","commands","command-feedback","goal","goal-round-driver","command-goal","plan-mode","token-meter","compaction-basic","command-compact","subagent","subagent-spawn-in-process","subagent-fork-in-process","tool-subagent-control","tool-subagent-list-agents","tool-subagent","tool-subagent-fork","tool-subagent-report","workflow-worker-thread","tool-workflow","timeout-policy","spill-local","spill-policy","session-checkpoint-policy","tool-result-pruner","tool-todo","tool-goal","tool-ralph","tool-str-replace-editor","repeat-tool-reminder","web","web-search-deepseek","tool-web","tools","system-prompt","agent-loop","fs-sandbox","llm-deepseek"]);
		/** 出厂 Web 层 dsh-web-app 的行 id 集。 */
		const PLUGIN_SOURCE_WEB = Object.freeze(["system-prompt","tools","code-runtime","storage","storage-json","storage-domain","message-feedback","session-log-download","workspace","session-projection-cache","session-stats","directory-picker","plugin-inventory","api-gateway","cordis-host-runner","web-startup","webserver","web-runtime","client-hmr","modules","connection","api-remotes","client-runtime","cordis-client-runner","ui-theme","locale","ui-layout","ui-sidebar","ui-settings","ui-settings-general","ui-settings-models","ui-settings-plugin-inventory","ui-conversation","ui-tool","ui-cordis","ui-workflow-run","ui-deliverables","ui-workspace","ui-input-trigger","ui-commands","ui-skill","ui-subagent","ui-jobs","ui-goal","ui-message-feedback","ui-model-selection","ui-permission","ui-agent-preset","ui-settings-plugins","ui-plan","ui-user-questions","ui-trajectory","tool-bash","tool-pwsh","tool-jobs","tool-fs","tool-fs-search","tool-str-replace-editor","skill-filesystem","tool-skill","tool-goal","plan-mode","compaction-basic","command-compact","tool-result-pruner","tool-subagent-control","tool-subagent-list-agents","tool-subagent","tool-subagent-fork","workflow-worker-thread","tool-workflow","tool-ralph","agent-instructions","tool-todo","tool-web","agent-presets","hmr","session-query-sqlite"]);

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

.dop-filter { flex: none; padding: 0 14px 6px; }
.dop-filter input {
	width: 100%; box-sizing: border-box; border: 1px solid oklch(0.90 0.02 260);
	border-radius: 8px; padding: 4px 9px; font: inherit; font-size: 12px;
	background: oklch(0.98 0.01 260); color: inherit;
}
.dop-filter input::placeholder { color: oklch(0.68 0.02 260); }
.dop-filter input:focus { outline: 2px solid oklch(0.60 0.17 260); outline-offset: -1px; border-color: transparent; }

.dop-plugin-detail { padding: 2px 6px 8px 24px; font-size: 11.5px; line-height: 1.55; }
.dop-plugin-desc { margin: 0 0 4px; color: oklch(0.42 0.03 260); }
.dop-plugin-kv { margin: 0; color: oklch(0.55 0.03 260); }
.dop-plugin-module { font-size: 10.5px; word-break: break-all; color: oklch(0.60 0.03 260); }
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
	.dop-filter input { background: oklch(0.20 0.015 260); border-color: oklch(0.35 0.02 260); color: oklch(0.92 0.02 260); }
	.dop-filter input::placeholder { color: oklch(0.55 0.02 260); }
	.dop-plugin-desc { color: oklch(0.78 0.02 260); }
	.dop-plugin-kv { color: oklch(0.62 0.02 260); }
	.dop-plugin-module { color: oklch(0.58 0.02 260); }
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

		/** 条目来源判定：本机 patch 自加 vs 出厂组合（按 bundle 行归属细分到层）。 */
		const USER_PATCH_ENTRY_IDS = new Set(["include:overlay-panel", "include:mcp-cocos", "include:mcp-project-memory-manager"]);
		const BASE_ROW_SET = new Set(PLUGIN_SOURCE_BASE);
		const WEB_ROW_SET = new Set(PLUGIN_SOURCE_WEB);
		function sourceOf(entryId) {
			if (USER_PATCH_ENTRY_IDS.has(entryId)) return { kind: "user", label: "本机自加 · cordis.patch.yml" };
			if (entryId === "include") return { kind: "base", label: "出厂组合 · 批量挂载器" };
			if (entryId.startsWith("include:")) {
				const row = entryId.slice("include:".length);
				if (BASE_ROW_SET.has(row)) return { kind: "base", label: "出厂组合 · 基础层 dsh-base" };
				if (WEB_ROW_SET.has(row)) return { kind: "base", label: "出厂组合 · Web 层 dsh-web-app" };
				return { kind: "base", label: "出厂组合" };
			}
			return { kind: "base", label: "出厂组合" };
		}
		/** 可关闭性说明（生成数据的 c 字段 → 面向用户的建议文案）。 */
		const CLOSABILITY_TEXT = {
			user: "可自由关闭：在 cordis.patch.yml 删除或禁用对应行后生效",
			core: "不建议关闭：核心运行时，关闭会导致宿主或会话不可用",
			feature: "可关闭：对应功能随之消失，不影响其它插件",
			unknown: "不确定：建议先确认依赖关系再决定"
		};

		/** 单个组合插件行：可展开详情（用途 / 来源 / 能否关闭 / 模块）。 */
		function PluginRow(props) {
			const { entry, expanded, onToggle } = props;
			const badge = phaseBadgeOf(entry.fiberPhase, entry.enabled);
			const doc = PLUGIN_DOCS[entry.moduleName];
			const source = sourceOf(entry.entryId);
			return h("div", null,
				h("button", {
					type: "button",
					className: "dop-session dop-session-clickable",
					onClick: onToggle,
					"aria-expanded": String(expanded),
					title: entry.moduleName
				},
					h("span", { className: "dop-chev" + (expanded ? " dop-chev-open" : "") }, h(ChevronIcon)),
					h("span", { className: "dop-plugin-name" }, entry.entryId),
					h("span", { className: `dop-phase ${badge.cls}` }, badge.label)
				),
				expanded
					? h("div", { className: "dop-plugin-detail" },
						h("p", { className: "dop-plugin-desc" }, doc?.d || "暂无说明（未收录该模块的简介）。"),
						h("p", { className: "dop-plugin-kv" }, `来源：${source.label}`),
						h("p", { className: "dop-plugin-kv" }, `能否关闭：${CLOSABILITY_TEXT[doc?.c ?? "unknown"]}`),
						h("p", { className: "dop-plugin-kv dop-plugin-module" }, `模块：${entry.moduleName}`)
					)
					: null
			);
		}

		/**
		 * 插件列表视图：宿主组合插件（pluginInventory Remote）+ 本进程动态插件
		 * （dynamicCordisRunner Remote）。两个 Remote 都只表示调用当下，进入视图
		 * 懒加载，顶栏刷新按钮手动重拉。组合插件按 需要关注 / 本机自加 / 出厂组合
		 * 分区，行可展开查看用途、来源与能否关闭。
		 */
		function PluginListView(props) {
			const [tick, setTick] = useState(0);
			const [state, setState] = useState({ phase: "loading", error: null, staticEntries: [], dynamicRows: [] });
			const [query, setQuery] = useState("");
			const [expanded, setExpanded] = useState(() => new Set());
			const toggleExpanded = (id) => {
				setExpanded((prev) => {
					const next = new Set(prev);
					if (next.has(id)) next.delete(id);
					else next.add(id);
					return next;
				});
			};
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

			// 过滤：命中 entryId / 模块名 / 用途简介任意一处。
			const q = query.trim().toLowerCase();
			const matchStatic = (e) => {
				if (!q) return true;
				const doc = PLUGIN_DOCS[e.moduleName];
				return e.entryId.toLowerCase().includes(q)
					|| e.moduleName.toLowerCase().includes(q)
					|| (doc?.d ?? "").toLowerCase().includes(q);
			};
			const visible = state.staticEntries.filter(matchStatic);
			// 失败（fiberPhase=failed）才是真正异常；已禁用多为出厂 patch 的有意关闭，中性呈现。
			const failedRows = visible.filter((e) => e.fiberPhase === "failed");
			const disabledRows = visible.filter((e) => e.fiberPhase !== "failed" && e.enabled === false);
			const isSpecial = (e) => e.fiberPhase === "failed" || e.enabled === false;
			const userRows = visible.filter((e) => !isSpecial(e) && sourceOf(e.entryId).kind === "user");
			const baseRows = visible.filter((e) => !isSpecial(e) && sourceOf(e.entryId).kind !== "user");
			const dynamicRows = state.dynamicRows.filter((r) => !q || r.pluginId.toLowerCase().includes(q));

			const renderSection = (title, rows) =>
				rows.length === 0
					? null
					: h(React.Fragment, null,
						h("p", { className: "dop-plugin-subhead" }, `${title} ${rows.length}`),
						rows.map((e) => h(PluginRow, {
							key: e.entryId,
							entry: e,
							expanded: expanded.has(e.entryId),
							onToggle: () => toggleExpanded(e.entryId)
						}))
					);

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
				h("div", { className: "dop-filter" },
					h("input", {
						type: "search",
						value: query,
						placeholder: "按名称、模块或用途过滤…",
						"aria-label": "过滤插件",
						onChange: (e) => setQuery(e.target.value)
					})
				),
				h("div", { className: "dop-rank-scroll" },
					state.phase === "loading" && state.staticEntries.length === 0
						? h("p", { className: "dop-desc", style: { margin: "0" } }, "正在读取插件清单…")
						: h(React.Fragment, null,
							state.error ? h("p", { className: "dop-empty", style: { margin: "0 0 8px" } }, state.error) : null,
							visible.length === 0
								? h("p", { className: "dop-empty", style: { margin: "0" } }, "没有匹配的插件。")
								: h(React.Fragment, null,
									renderSection("失败", failedRows),
									renderSection("已禁用", disabledRows),
									renderSection("本机自加", userRows),
									renderSection("出厂组合", baseRows)
								),
							dynamicRows.length > 0
								? h(React.Fragment, null,
									h("p", { className: "dop-plugin-subhead" }, `动态插件 ${dynamicRows.length}`),
									dynamicRows.map((row) => {
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
								: null
						)
				),
				h("p", { className: "dop-footer" }, `${state.staticEntries.length} 个组合插件 · ${state.dynamicRows.length} 个动态插件`)
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
