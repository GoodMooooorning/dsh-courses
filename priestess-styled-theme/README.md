# 普瑞塞斯 · 源石协议 — Arknights Theme Plugin for DSH Web

为 DeepSeek Harness Web GUI（`dsh web`）打造的明日方舟主题插件：
**普瑞塞斯（黑太阳 / civilight）** 与 **源石 / 巴别塔** 视觉元素，
黑紫星河、流光、粒子动效一应俱全。

> 本插件以 **DSH 官方客户端插件机制** 实现：不改动任何安装文件，
> 因此 **dsh 升级 / 重装后主题依然生效**，无需重新安装。

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

**零 token 消耗**：插件只做浏览器本地操作（DOM / Canvas / 本地 API），
不调用任何大模型，不影响你的 token 用量。

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

## 🎯 在"你的工作区"启用

插件默认对工作区 **`deepseek_workspace`** 生效（自动检测会话 cwd 目录名）。
目标工作区与开关都可以在 **设置 → 插件 →「普瑞塞斯 · 源石协议 主题」** 卡片中修改（即时生效、持久保存）。

也支持按会话临时指定（优先级高于设置页）：
- **方式 A（临时）**：地址栏加 `?aktarget=你的工作区文件夹名`
- **方式 B（兼容）**：控制台 `localStorage.setItem('ak-target', '你的工作区文件夹名')`

---

## 🚫 关闭主题（不卸载插件）

| 方式 | 操作 | 效果 |
|---|---|---|
| 正式开关（推荐） | **设置 → 插件 → 主题卡片 → 关闭「主题开关」** | 持久关闭，任何工作区都不显示 |
| 临时关闭（本页会话） | 地址栏加 `?ak=0` 刷新 | 本次页面关闭主题 |
| 彻底停用 | `.\manage.ps1 disable` + 重启 dsh | 插件不加载，零开销 |

> 优先级：`?ak=` URL 参数（会话级） > 设置页「主题开关」> 工作区匹配。
> 旧版 `localStorage['ak-force']` 机制已移除——之前设置过的话可手动删除
> `localStorage.removeItem('ak-force')`，避免残留值影响判断（新版本已忽略它）。

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
└── lib/
    ├── index.js        # host 端：伺服主题资源
    ├── client.js       # client 端：主题运行时（检测/样式/动效）
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

---

MIT License — 欢迎二改与分享。素材取自玩家自绘/官方公开图，
仅用于个人与社区非商业用途。
