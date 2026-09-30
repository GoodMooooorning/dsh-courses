# 普瑞赛斯 · 源石协议 — Arknights Theme Plugin for DSH Web

为 DeepSeek Harness Web GUI（`dsh web`）打造的明日方舟主题插件：
**普瑞赛斯（黑太阳 / civilight）** 与 **源石** 视觉元素，黑紫星河、流光、粒子动效一应俱全。

> 以 **DSH 官方客户端插件机制** 实现：不改动任何安装文件。
> dsh 升级 / 重装后重新 `.\manage.ps1 install` 即可继续使用。

**当前版本：v2.0.1**（适配 dsh `0.1.5+`）

---

## 📋 版本日志

| 版本 | 摘要 |
|---|---|
| **v2.0.1** | 修复浏览器端无限递归崩溃（`Maximum call stack size exceeded`）+ 引入 fail-soft 与回归测试 |
| **v2.0.0** | **适配新版 dsh（0.1.5+）**：修复「启用插件后 dsh 无法启动」、改用 profile bundle 安装、重写启动逻辑 |
| v1.3.2 | 移除左侧巴别塔图像 |
| v1.3.1 | 设置卡片移除「当前工作区」栏及相关检索代码，仅保留「应用 / 关闭」 |
| v1.3.0 | 设置页模式精简为「应用 / 关闭」 |
| v1.2.x | 工作区跟随显示（已于 v2.0.0 移除） |
| v1.1.x | 设置卡片 + `react` 惰性加载兼容 |
| v1.0.0 | 初始版本 |

---

## 🛠 v2.0.1 — 修复浏览器端递归崩溃

### 现象

启用插件后 Web UI 报插件加载失败，**整个插件列表都渲染不出来**：

```
Failed to load plugins
priestess-styled-theme
failed to apply loader entry 747f56fe (priestess-styled-theme): Maximum call stack size exceeded
```

注意这是**浏览器端**的错误：`Failed to load plugins` 是前端 bundle 里的文案，
即 **dsh 服务端能正常启动**，失败发生在页面加载插件时。

### 根因

`lib/client.js` 里存在**两个同名 `function apply`**：

```js
function apply() { setTheme(decide()); }   // 主题上色
...
function apply(ctx) {                       // 插件入口
  apply();                                  // ← 本意是上色，实际调用的是自己
```

JS 函数声明提升后**同名只保留一个绑定**，后面的入口声明覆盖了前面的上色函数。
于是插件入口第一步 `apply()` 就调用自身 → 立即爆栈。

### 修复

- 上色函数改名为 `paintTheme()`，与插件入口 `apply` 彻底分离。

### 加固（重要）

既然是纯装饰性插件，就不该有任何机会拖垮整个界面。现在 `apply()` 是 **fail-soft** 的：

- 主题上色、配置读取、设置卡片注册各自独立 `try/catch`，任一步失败**只打日志**；
- **teardown 最先注册**（清理是幂等的），所以即使中途抛错也不会残留 DOM / 样式；
- 结果：这类 bug 最多让「主题不显示」，不会再让插件加载整体失败。

### 回归测试

新增 `tests/client-boot.test.mjs`：**真实加载 `lib/client.js`**，按 dsh 的 lazy-CJS 约定
执行插件入口，用桩 DOM 断言契约（5 项）：

```powershell
node --test tests/
```

| 用例 | 覆盖 |
|---|---|
| bundle 工厂契约 | 工厂 id = 包名、`inject` 仅 `["slots"]` |
| **入口不递归** | 直接复现 v2.0.1 的崩溃点 |
| 设置卡片渲染 | 展开后出现「应用 / 关闭」与卸载提示 |
| fail-soft | 服务全部抛错时 `apply()` 仍不抛出 |
| 卸载清理 | 主题属性 / 立绘 / 粒子 / 样式表 / favicon 全部还原 |

> 该测试已验证有效：把 bug 人为改回去，用例立即报
> `RangeError: Maximum call stack size exceeded`。

---

## 🛠 v2.0.0 — 适配新版 dsh（0.1.5+）

### 根因：一行导入让 dsh 起不来

旧版本（≤ v1.3.2）在 host 端这样注册设置命名空间：

```js
// 旧代码（错误）
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
```

`settingsNamespace` 在 `@deepseek-ai/dsh-settings` 里**只是一个 TypeScript 类型品牌**，
并不是运行时导出（该模块实际只导出 `SettingsProvider` / `SettingsConflictError` / `redactSecrets`）。
ESM 在**链接阶段**即抛 `does not provide an export named 'settingsNamespace'`，
host 端插件加载失败 → dsh 启动流程中断 → 表现就是「一启用插件 dsh 就起不来」。

**修复**：命名空间直接用普通字符串 `"arknights-theme"`（新版只做 `/^[a-z][a-z0-9-]*$/` 校验）。

### 修复清单

| 项目 | 旧版本 | v2.0.0 |
|---|---|---|
| 命名空间导入 | `settingsNamespace(...)`（不存在的导出 → 启动崩溃） | 普通字符串 `"arknights-theme"` |
| `dsh.client.inject` | 写成 cordis 服务名（`slots`/`locale`/…），语义错误 | 写成**包名** `@deepseek-ai/dsh-client-ui-settings-plugins` |
| 安装方式 | 手改 profile 的 `cordis.patch.yml` insert | 插件自带 `cordis.patch.yml` + `dsh.bundle.patch`，登记为 **profile bundle** |
| 启动逻辑 | 启动即拉 `session.list` + 开 `events.mux` WebSocket + 定时轮询 + 监听整个 DOM | 首帧同步上色；**无网络、无定时器、无 DOM 监听** |
| 设置卡片 | 依赖 `locale` + `settingsScope`，服务缺失即卡片消失 | 走插件自有路由，客户端只需 `slots` |
| 热替换（HMR） | 全局加载锁 + 清理不完整，热替换后状态残破 | 完整 teardown，热替换 / 卸载后文档干净 |

### 启动逻辑重写

旧版本遗留了一整套「工作区检测」设施，而工作区功能早在 v1.3.1 就已移除，
这些代码在每次打开页面时都在空转：

- 删除：启动即 `POST /api/session.list`、`WebSocket /api/events.mux`（含 5 秒重连）、
  20 秒定时轮询、整个 `<body>` 的 MutationObserver、`ak-target` 解析；
- 现在启动顺序：**① 首帧用缓存的模式同步上色（无网络、无定时器）
  → ② 拉一次 host 配置校正 → ③ `ctx.slots.inject` 事件式注册设置卡片 → ④ 注册 teardown**；
- 模式缓存在 `localStorage['ak-mode']`，因此刷新 / 重开页面不会出现「先亮一下再关掉」的闪烁；
- 设置卡片不再用 `setTimeout` 轮询最多 10 秒等待服务，改由 slot 声明驱动。

### 安装方式变更

新版 dsh 的插件装载路径是 **profile bundle**（`dsh.profile.bundles` + 插件自带 patch），
不再是手工往 `cordis.patch.yml` 里塞 insert。`manage.ps1` 已同步重写，
并且同步清理旧版本遗留的 insert 段（同一条目出现两个 Loader 源会被 dsh 拒绝）。

---

## ✨ 功能一览

| 元素 | 说明 |
|---|---|
| 右侧 | 普瑞赛斯立绘水印（若隐若现，贴满右栏） |
| 背景 | 黑色基底 + 暗紫星野 + 黑紫星河（SVG 矢量）+ 紫色流光光晕 |
| 动效 | 悬浮源石尘粒（canvas，尊重系统「减少动态效果」时自动停止） |
| 细节 | 紫色输入光标、紫色选中态、定制滚动条、源石图标 favicon |
| 切换 | **设置 → 插件 → 普瑞赛斯主题**：`应用` / `关闭`，持久保存 |
| 强制覆盖 | 地址栏 `?ak=1` / `?ak=0`，或 `localStorage['ak-force']` |

**零 token 消耗**：插件只做浏览器本地操作（DOM / Canvas / 本地 HTTP），不调用任何大模型。

---

## 📦 安装

前置条件：已经能用 `dsh web` 打开界面。

### 方式 A：一键脚本（推荐；本机无 pnpm 时唯一可行）

```powershell
cd priestess-styled-theme
.\manage.ps1 install
```

脚本会：
1. 复制插件到 `$DSH_HOME\profiles\node_modules\priestess-styled-theme`；
2. 在 `$DSH_HOME\profiles\web\package.json` 里登记 `file:` 依赖 + `dsh.profile.bundles`；
3. 在 profile 的 `cordis.patch.yml` 写入 `disabled: false`，并清理旧版本遗留的 `insert` 段。

然后**重启 dsh**（在 dsh 终端按 `Ctrl+C`，再重新 `npx @deepseek-ai/dsh web`），浏览器 **Ctrl+Shift+R** 强制刷新。

> PowerShell 默认禁止执行脚本时，先运行一次：
> `Set-ExecutionPolicy -Scope Process Bypass`（仅当前窗口生效）
>
> 自定义位置：`.\manage.ps1 install -DshHome D:\my-dsh -Profile web`

### 方式 B：新版 dsh 官方命令（需要 pnpm）

```powershell
dsh plugin --profile web add <本插件目录或包名>
```

该命令会转发给 profile 目录下的 pnpm，自动完成依赖登记与 bundle 组合。

### 老版本 dsh（无 `dsh.profile.bundles`）

```powershell
.\manage.ps1 install -Legacy
```

`-Legacy` 改为直接在 profile 的 `cordis.patch.yml` 插入 Loader 条目。

---

## ⚙️ 设置页控制

**设置 → 插件 → 普瑞赛斯主题**，展开卡片选择状态并保存：

| 状态 | 效果 |
|---|---|
| **应用** | 主题开启（默认） |
| **关闭** | 主题关闭 |

设置写入 `$DSH_HOME\settings.yaml` 的 `arknights-theme` 节，并由 schema 校验：

```yaml
arknights-theme: { mode: on }
```

浏览器端通过插件自有路由 `GET/PATCH /plugins/priestess-styled-theme/config` 读写该值
（仅回环地址可访问，写操作校验同源 Origin）。
这样客户端**不再依赖**可选的 `locale` / `settingsScope` 服务 —— 少一个依赖就少一处会坏的地方。

---

## 🚫 临时关闭（不卸载）

| 方式 | 操作 | 效果 |
|---|---|---|
| 临时 | 地址栏加 `?ak=0` 刷新 | 本次页面关闭主题（`?ak=1` 强制开启） |
| 持久覆盖 | 控制台 `localStorage.setItem('ak-force','0')` | 一直关闭；`'1'` 或删除即恢复 |
| 彻底停用 | `.\manage.ps1 disable` + 重启 dsh | 插件不加载，零开销（`enable` 恢复） |

---

## 🗑 卸载

```powershell
.\manage.ps1 uninstall
```

- 移除 profile 的 bundle 登记与依赖
- 清理 `cordis.patch.yml` 中本插件的条目
- 删除 profile 中的插件目录

重启 dsh 后完全移除；**不影响**你的会话、设置与其他插件。
查看状态：`.\manage.ps1 status`。

---

## 🧩 工作原理

- **host 端**（`lib/index.js`）
  - `ctx.settings.register("arknights-theme", Schema, { base, applies: "live" })` 注册设置命名空间；
  - `exact` 路由 `GET/PATCH /plugins/priestess-styled-theme/config` 作为浏览器的读写通道；
  - `prefix` 路由 `/arknights-assets/*` 伺服主题资源（每次请求读盘，所以改 CSS / 图片只需刷新浏览器）。
  - 只注册 `exact` 路由是有意为之：`/plugins` 前缀归 client-modules 的 bundle 路由所有，
    在这里注册 prefix 会把它遮蔽掉。
- **client 端**（`lib/client.js`，新版 lazy-CJS 工厂包）
  - 所有样式以 `html[data-arknights]` 门控，关闭时界面完全原样；
  - 入口 fail-soft，且 teardown 完整（见 v2.0.1 一节）。
- 调试钩子（浏览器控制台）：`window.__priestessTheme` → `{ mode, force, enabled, refresh() }`

> 为什么不碰前端 dist：主题资源全部由 host 端插件伺服，
> 所以 dsh 前端更新 / 重装不会带走主题，升级后最多重新 `install` 一次。

---

## 🔒 版本兼容性

| dsh 版本 | 安装方式 | 说明 |
|---|---|---|
| **0.1.5+（新版）** | `.\manage.ps1 install` | 插件作为 profile bundle 组合，推荐 |
| 更早版本 | `.\manage.ps1 install -Legacy` | 回退到 `cordis.patch.yml` insert |

客户端侧保留 `react` 惰性加载（`try { require("react") } catch`）：
即使模块表缺少 `react`，也只会降级为「无设置卡片」，主题渲染不受影响。

---

## 🧪 自检（可选）

插件自带回归测试，**真实加载 `lib/client.js`** 并按 dsh 的 lazy-CJS 约定执行插件入口，
用桩 DOM 验证：入口不递归、主题正确上色、设置卡片能渲染、卸载后文档干净、坏服务下 fail-soft。

```powershell
cd priestess-styled-theme
node --test tests/
```

改完代码建议先跑一遍再装。

---

## 📁 目录结构

```
priestess-styled-theme/
├── manage.ps1          # 一键：install / enable / disable / uninstall / status
├── cordis.patch.yml    # 插件自带的 Loader 条目（新版 dsh 的 bundle 机制读取）
├── package.json        # 插件声明（dsh.bundle.patch + dsh.client）
├── README.md
├── .gitignore
├── LICENSE             # MIT
├── tests/
│   └── client-boot.test.mjs  # 客户端入口回归测试（node --test tests/）
└── lib/
    ├── index.js        # host 端：设置命名空间 + 主题资源路由 + 配置读写路由
    ├── client.js       # client 端：主题运行时（上色 / 动效 / 设置卡片 / 清理）
    └── assets/         # 主题资源（CSS / 立绘 / 星河 / 星野 / 图标）
```

---

## 🔧 常见问题

**Q：启用后 dsh 起不来了？**
- v2.0.0 已修复（根因见上文）。若仍失败，把 dsh 终端里带插件名的报错原文发给作者。
- 应急：`.\manage.ps1 disable`，或把 profile 的 `cordis.patch.yml` 中该条目改为 `disabled: true`。

**Q：界面报「Failed to load plugins」？**
- 这是**浏览器端**的插件加载失败，服务端通常没事。先看 F12 控制台里 `[priestess-styled-theme]`
  开头的日志，连同插件名一起反馈。
- 若是 v2.0.1 之前的版本，就是上面那个递归崩溃 —— 升级到 v2.0.1。

**Q：已经禁用了插件，为什么还报同样的错？**
- 因为引导清单是**内联在 `index.html`** 里的，而该响应**没有任何 `cache-control` / `etag`**，
  浏览器会启发式缓存它，于是禁用后仍拿着旧清单去加载那个必崩的插件。
- 处理：**Ctrl+Shift+R 强制刷新**（必要时清理站点数据）。禁用本身是有效的 ——
  禁用后插件条目会从浏览器的插件清单里彻底消失。

**Q：主题没出现？**
- 确认**重启了 dsh**（不是只刷新浏览器），并 `Ctrl+Shift+R` 强制刷新。
- 「设置 → 插件 → 普瑞赛斯主题」确认选择的是 **应用**。
- 控制台执行 `window.__priestessTheme` 查看 `mode` / `enabled` / `force`。
- 若 `force` 不是 `null`，说明被 `?ak=` 或 `localStorage['ak-force']` 覆盖了。

**Q：改了 CSS 或图片，怎么生效？**
- `lib/assets/*` 是每次请求读盘的，刷新浏览器即可；`lib/client.js` 改动需重启 dsh
  （新版 dsh 也会通过热替换自动换新）。

**Q：dsh 升级后主题会失效吗？**
- 一般不会（插件在 profile 里独立存在）。若失效，重新 `.\manage.ps1 install` 并重启 dsh。

**Q：想换右侧立绘？**
- 替换 `lib\assets\priestess-right.webp`（建议竖构图、偏暗底），保持文件名不变，刷新浏览器。

---

## ✅ 发版前的验证记录（v2.0.1）

改动都用**隔离的 `DSH_HOME` 沙箱**启动真实 dsh 验证，没有动到正在使用的实例：

- `--dump-config` 组合 profile：插件条目正常出现，无「多个 Loader 源」冲突；
- 沙箱启动：host 路由 `GET /config` → `200 {"mode":"on"}`、`/arknights-assets/arknights.css` → 200 且 MIME 正确；
- 引导清单里本插件行存在，且 `inject` 为包名 `@deepseek-ai/dsh-client-ui-settings-plugins`；
- 设置写入链路：`PATCH off → on` 持久化进 `settings.yaml`，非法值 400，跨源 Origin 403；
- 取**沙箱实际下发的 bundle 字节**喂给回归测试 → 5 项全过；
- 禁用后确认条目从浏览器插件清单消失（55 → 54 条），确认「禁用」路径本身有效。

---

MIT License — 欢迎二改与分享。素材取自玩家自绘 / 官方公开图，仅用于个人与社区非商业用途。
