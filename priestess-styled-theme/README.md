# 普瑞塞斯 · 源石协议 — Arknights Theme Plugin for DSH Web

为 DeepSeek Harness Web GUI（`dsh web`）打造的明日方舟主题插件：
**普瑞塞斯（黑太阳 / civilight）** 与 **源石 / 巴别塔** 视觉元素，
黑紫星河、流光、粒子动效一应俱全。

> 本插件以 **DSH 官方客户端插件机制** 实现：不改动任何安装文件，
> 因此 **dsh 升级 / 重装后主题依然生效**，无需重新安装。

**版本：v1.1.0** · 更新日志：
- **v1.1.0**：新增「设置 → 插件 → 普瑞塞斯主题」配置卡片（运行模式一键切换）
- **v1.0.0**：初始版本（主题渲染 + 工作区自动切换 + 一键管理脚本）

---

## ✨ 功能一览

| 元素 | 说明 |
|---|---|
| 右侧 | 普瑞塞斯立绘水印（若隐若现，填满右栏） |
| 左侧 | 巴别塔完整图像（上部透明透出星河，宽度自动适配左边栏） |
| 背景 | 黑色基底 + 暗紫星野 + 黑紫星河（SVG 矢量）+ 紫色流光光晕 |
| 动效 | 悬浮源石尘粒（canvas，尊重系统"减少动态效果"设置） |
| 细节 | 紫色输入光标、紫色选中态、定制滚动条、源石棱晶标签页图标 |
| 切换 | 自动按工作区启用/停用；切到其他工作区自动恢复默认界面 |
| **设置页控制** | 「设置 → 插件 → 普瑞塞斯主题」卡片：一键切换运行模式并持久保存 |

**零 token 消耗**：插件只做浏览器本地操作（DOM / Canvas / 本地 API），
不调用任何大模型，不影响你的 token 用量。

---

## ⚙️ 设置页控制（推荐）

打开 **设置 → 插件**，展开「**普瑞塞斯主题**」卡片，选择运行模式并保存：

| 模式 | 效果 |
|---|---|
| 自动（仅目标工作区） | 只在目标工作区显示主题（默认） |
| 关闭当前工作区 | 当前工作区不再显示（保存时自动记录），其他工作区照常 |
| 全部应用 | 所有工作区都显示主题 |
| 全部关闭 | 所有工作区都不显示主题 |

设置即时生效并持久保存在 `settings.yaml`（命名空间 `arknights-theme`）；
卡片内还会显示**当前工作区名**与**卸载指引**。
（命令行等效：`?ak=1/0` 临时强制、`localStorage('ak-force')` 持久覆盖。）

---

## 📦 快速安装（朋友版）

前置条件：已安装并运行 `dsh web`（本机）。

```powershell
# 1. 解压本插件文件夹，进入目录
cd priestess-styled-theme

# 2. 执行安装（复制插件 + 写入启用配置）
.\manage.ps1 install

# 3. 重启 dsh：在 dsh 终端按 Ctrl+C，重新运行 npx @deepseek-ai/dsh web

# 4. 刷新浏览器
```

> PowerShell 默认可能禁止执行脚本，先运行一次：
> `Set-ExecutionPolicy -Scope Process Bypass`（仅当前窗口）

---

## 🎯 在"你的工作区"启用（重要）

插件默认只对名为 **`betterui`** 的工作区生效（自动检测）。
其他工作区名称请用下面任一方式指定：

**方式 A（推荐，持久）**：在浏览器控制台（F12）执行一次，以后一直生效：
```js
localStorage.setItem('ak-target', '你的工作区文件夹名')
```

**方式 B（临时）**：直接访问（每次打开可用）：
```
http://127.0.0.1:3080/?aktarget=你的工作区文件夹名
```

设置后回到你的工作区会话，主题即自动出现。

---

## 🚫 关闭背景（不卸载插件）

| 方式 | 操作 | 效果 |
|---|---|---|
| 临时关闭 | 地址栏加 `?ak=0` 刷新 | 本次页面关闭主题 |
| 持久关闭 | 控制台 `localStorage.setItem('ak-force','0')` | 一直关闭；改回 `'1'` 或删除恢复 |
| 彻底停用 | `.\manage.ps1 disable` + 重启 dsh | 插件不加载，零开销 |

恢复：`.\manage.ps1 enable` + 重启 dsh。

---

## 🗑 卸载

```powershell
.\manage.ps1 uninstall
```
- 自动从 `cordis.patch.yml` 移除插件条目（并恢复原配置）
- 自动删除 profile 中的插件目录
- 重启 dsh 后完全移除；**不影响**你的会话、设置与任何功能

其他命令：`.\manage.ps1 status` 查看安装/启用状态。

---

## 🧩 工作原理（简述）

- **host 端**（`lib/index.js`）：注册本地路由 `/arknights-assets/*` 伺服主题资源，
  全程从插件目录读文件，不碰前端 dist。
- **client 端**（`lib/client.js`）：通过浏览器 API（`session.list` + `events.mux`）
  识别"当前活动会话所属工作区"，匹配目标工作区名后注入主题样式与水印元素；
  所有样式规则以 `html[data-arknights]` 门控，未启用时界面完全原样。
- 调试钩子（浏览器控制台）：
  - `window.__akTarget` — 当前目标工作区名
  - `window.__akDebug.enabled` — 主题是否启用
  - `window.__akDebug.refresh()` — 立即刷新会话索引

---

## 📁 目录结构

```
priestess-styled-theme/
├── manage.ps1          # 一键：install / enable / disable / uninstall / status
├── README.md           # 本说明书
├── package.json        # 插件声明（dsh.client 导出）
├── .gitignore
├── LICENSE             # MIT
└── lib/
    ├── index.js        # host 端：伺服主题资源 + 注册设置命名空间
    ├── client.js       # client 端：主题运行时（检测/样式/动效/设置卡片）
    └── assets/         # 主题资源（CSS / 立绘 / 星河 / 星野 / 图标）
```

---

## 🔧 常见问题

**Q：主题没出现？**
- 确认已重启 dsh 且刷新了浏览器（Ctrl+Shift+R 强制刷新）。
- 确认当前工作区名与 `ak-target` 设置一致（控制台 `window.__akTarget`）。
- 其他工作区默认不显示主题（这是设计：切回目标工作区即恢复）。

**Q：我想换一张右侧立绘/背景图？**
- 替换 `lib\assets\priestess-right.webp`（右侧立绘，建议竖构图、偏暗）
  与 `babel-right.webp`（左侧塔），保持文件名不变；
- 改完在 dsh 终端重启，或告诉我帮你处理。

**Q：dsh 升级后主题会失效吗？**
- 不会。插件在 profile 中独立存在，与前端安装包无关；
  若 dsh 更新后仍未生效，重新运行 `.\manage.ps1 install` 即可。

**Q：「设置 → 插件」里看不到普瑞塞斯主题卡片？**
- 确认已重启 dsh 且刷新浏览器（Ctrl+Shift+R）。
- 打开 F12 控制台，若看到 `[priestess-styled-theme]` 开头的红色错误，把内容反馈给作者；
  正常安装时应无该前缀报错。

---

MIT License — 欢迎二改与分享。素材取自玩家自绘/官方公开图，
仅用于个人与社区非商业用途。
