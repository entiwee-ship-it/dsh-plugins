# dsh-plugins

DSH（DeepSeek Harness）自有插件集。每个插件一个顶层文件夹，独立源码、独立挂载。

## 插件清单

| 插件 | 文件夹 | 说明 |
| --- | --- | --- |
| dsh-overlay-panel | [`dsh-overlay-panel/`](dsh-overlay-panel/) | 悬浮工具面板「工具坞」：全站 token 统计（今日/本周/本月/累计、工作区分组排行、归档归组、子代理归并、缓存命中率、按日精确投影） |

## 目录约定

- 每个插件一个顶层文件夹，文件夹名即包名（如 `dsh-overlay-panel/`）。
- 插件至少包含 `package.json`（含 `dsh.client` 声明与 `./package.json` 导出）、
  `index.js`（宿主半边，可为空 apply）、`client.js`（浏览器半边）。
- 新增插件时在上方清单表格登记一行。

## 安装 / 挂载

1. 把插件文件夹复制（或链接）到对应 DSH profile 的 `node_modules` 下：

   ```
   ~/.dsh/profiles/node_modules/<插件文件夹名>
   ```

2. 在 `~/.dsh/profiles/web/cordis.patch.yml` 插入插件行：

   ```yaml
   - insert:
       - id: <插件 id>
         name: <包名>
   ```

3. 首次挂载后重启一次 DSH（宿主扫描的否定判定是进程内缓存）。

## 开发提示

- 改 `client.js` 保存即热重载（client-hmr stat-poll），已打开页面免刷新。
- 改 `index.js`（宿主半边）**需要重启 DSH** 才生效。
- 宿主能力（会话投影、持久化、工作区注册表等）通过 `ctx.get(...)` /
  `ctx.inject([...], cb)` 获取，先查 Inspect Provider 再编码。
