/* ==========================================================================
   普瑞赛斯 · 源石协议 — Arknights theme client plugin (hand-written bundle)
   Loaded by the DSH browser module loader as an enabled Loader entry.
   Injects the theme stylesheet + artwork from the host half (/arknights-assets)
   while the ACTIVE session belongs to the "betterui" workspace.
   ========================================================================== */
window.__ModuleLoader__.load({
	id: "priestess-styled-theme",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var name = "priestess-styled-theme";
		/* 依赖注入：settingsScope（设置绑定）/ slots（设置卡片）/ locale（文案）/
		   connection + remote（host 设置传输）。
		   主题核心逻辑（检测/渲染/粒子）不直接依赖这些服务——即使设置服务缺失，
		   react 惰性降级仍可让核心主题照常（见下方降级逻辑）。 */
		var inject = ["slots", "locale", "connection", "remote", "settingsScope"];
		var ASSET = "/arknights-assets/";
		/* 设置命名空间：settings.yaml 中 arknights-theme: 节 */
		var SETTINGS_NS = "arknights-theme";
		/* React 惰性加载：旧版 dsh 的模块表可能没有 "react"，require 会抛错，
		   这里捕获后降级为"不注册设置卡片"，主题核心不受影响。 */
		var React = null;
		try { React = require("react"); } catch (e) { React = null; }

		var apply = (ctx) => {
			if (window.__arknightsThemeLoaded) return;
			window.__arknightsThemeLoaded = true;

			/* ---------------- configuration ---------------- */
			/* 目标工作区名（调试用，默认 betterui；主题为「应用/关闭」两态，不再按工作区匹配） */
			var TARGET = "betterui";
			try {
				var lsTarget = window.localStorage && window.localStorage.getItem("ak-target");
				if (lsTarget) TARGET = lsTarget;
			} catch (e) { /* localStorage unavailable */ }
			try {
				var qt = new URLSearchParams(window.location.search);
				if (qt.get("aktarget")) TARGET = qt.get("aktarget");
			} catch (e) { /* no URL API */ }
			window.__akTarget = TARGET;

			/* ---------------- force switch (manual override) ----------------
			   URL ?ak=1 -> force ON    ?ak=0 -> force OFF
			   localStorage 'ak-force' = '1' | '0' */
			var force = null;
			try {
				var stored = window.localStorage && window.localStorage.getItem("ak-force");
				if (stored === "1" || stored === "0") force = stored === "1";
			} catch (e) { /* localStorage unavailable */ }
			try {
				var q = new URLSearchParams(window.location.search);
				if (q.get("ak") === "1") force = true;
				else if (q.get("ak") === "0") force = false;
			} catch (e) { /* no URL API */ }
			window.__akForce = force;

			/* ---------------- state ---------------- */
			var enabled = false;
			var dataReady = false;
			/* 设置页配置（settings 命名空间 arknights-theme）：
			   mode: on | off */
			var cfgMode = null;
			var cwdBySession = {};
			var titleBySession = {};
			var basenameToSessions = {};
			var titleToSessions = {};
			var ws = null;
			var decorationsMounted = false;

			/* ---------------- helpers ---------------- */
			function norm(s) {
				return String(s == null ? "" : s).trim().toLowerCase();
			}
			function basename(p) {
				var s = String(p == null ? "" : p).replace(/[\\/]+$/, "");
				var parts = s.split(/[\\/]/);
				return parts[parts.length - 1] || s;
			}
			function debounce(fn, ms) {
				var t = null;
				return function () {
					clearTimeout(t);
					t = setTimeout(fn, ms);
				};
			}

			/* ---------------- data: session.list + mux ---------------- */
			var refreshInFlight = false;
			function refreshSessions() {
				if (refreshInFlight) return;
				refreshInFlight = true;
				var rpcId = "ak-" + (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now());
				fetch("/api/session.list", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ type: "client-request", rpcId: rpcId, method: "session.list", payload: {} })
				})
					.then(function (res) { return res.ok ? res.json() : null; })
					.then(function (full) {
						refreshInFlight = false;
						if (!full || !full.result || !full.result.ok) return;
						var items = (full.result.value && full.result.value.items) || [];
						cwdBySession = {};
						titleBySession = {};
						basenameToSessions = {};
						titleToSessions = {};
						for (var i = 0; i < items.length; i++) {
							var row = items[i];
							if (!row || !row.sessionId) continue;
							if (row.cwd) cwdBySession[row.sessionId] = row.cwd;
							var t = row.projections && row.projections.values && row.projections.values.title;
							if (typeof t === "string" && t) titleBySession[row.sessionId] = t;
						}
						for (var id in cwdBySession) {
							var b = norm(basename(cwdBySession[id]));
							if (!b) continue;
							(basenameToSessions[b] = basenameToSessions[b] || []).push(id);
						}
						for (var id2 in titleBySession) {
							var tn = norm(titleBySession[id2]);
							if (!tn) continue;
							(titleToSessions[tn] = titleToSessions[tn] || []).push(id2);
						}
						dataReady = true;
						evaluate();
					})
					.catch(function () { refreshInFlight = false; });
			}

			function openMux() {
				try {
					var proto = location.protocol === "https:" ? "wss:" : "ws:";
					ws = new WebSocket(proto + "//" + location.host + "/api/events.mux");
					ws.addEventListener("message", function (ev) {
						try {
							var full = JSON.parse(ev.data);
							var p = full && full.payload;
							if (!p) return;
							if (p.type === "session/projection" && p.key === "title" && typeof p.value === "string") {
								titleBySession[p.sessionId] = p.value;
								var tn = norm(p.value);
								titleToSessions[tn] = titleToSessions[tn] || [];
								if (titleToSessions[tn].indexOf(p.sessionId) === -1) titleToSessions[tn].push(p.sessionId);
								evaluate();
							} else if (p.type === "session/subscribed" || p.type === "session/created") {
								refreshSessions();
							}
						} catch (e) { /* malformed frame — ignore */ }
					});
					ws.addEventListener("open", function () { refreshSessions(); });
					ws.addEventListener("close", function () {
						setTimeout(openMux, 5000);
					});
				} catch (e) { /* WebSocket unavailable — DOM-only detection still works */ }
			}

			/* ---------------- decision ---------------- */
			function decide() {
				if (force !== null) return force; // 手动覆盖（?ak / localStorage）优先
				/* 精简模式：应用（on）→ 主题显示；关闭（off）→ 主题隐藏。
				   兼容历史值（all-off 视为关闭）。 */
				if (cfgMode === "off" || cfgMode === "all-off") return false;
				return true;
			}

			/* ---------------- apply ---------------- */
			function setTheme(on) {
				if (on === enabled) return;
				enabled = on;
				document.documentElement.toggleAttribute("data-arknights", on);
				try {
					var link = document.querySelector("link[rel='icon']");
					if (link) {
						var cur = link.getAttribute("href") || "";
						if (on) {
							link.setAttribute("data-ak-orig", cur);
							link.setAttribute("href", ASSET + "favicon.svg");
						} else if (link.getAttribute("data-ak-orig")) {
							link.setAttribute("href", link.getAttribute("data-ak-orig"));
							link.removeAttribute("data-ak-orig");
						}
					}
				} catch (e) { /* cosmetic */ }
				if (on) mountDecorations();
				var canvas = document.getElementById("ak-particles");
				if (canvas && window.__akParticles) {
					if (on) window.__akParticles.start();
					else window.__akParticles.stop();
				}
				if (window.__akDebug) window.__akDebug.enabled = on;
			}

			/* ---------------- decorations ---------------- */
			function mountImg(id, src) {
				var wrapper = document.createElement("div");
				wrapper.id = id;
				var img = document.createElement("img");
				img.src = src;
				img.alt = "";
				img.draggable = false;
				wrapper.appendChild(img);
				document.body.appendChild(wrapper);
			}

			function mountDecorations() {
				if (decorationsMounted) return;
				decorationsMounted = true;
				// 主题样式表（由 host 端伺服，绝不修改前端 dist）
				if (!document.querySelector('link[data-plugin="priestess-styled-theme"]')) {
					var cssLink = document.createElement("link");
					cssLink.rel = "stylesheet";
					cssLink.href = ASSET + "arknights.css";
					cssLink.dataset.plugin = "priestess-styled-theme";
					document.head.appendChild(cssLink);
				}
				// 中间黑幕上的黑紫星河（SVG 矢量）
				mountImg("ak-river", ASSET + "river.svg");
				// 左侧：巴别塔完整图像（宽度适配左边栏）
				mountImg("ak-babel", ASSET + "babel-right.webp");
				fitBabelWidth();
				// 右侧：普瑞赛斯（8号）填满右栏
				mountImg("ak-watermark", ASSET + "priestess-right.webp");
				setupParticles();
			}

			/* 巴别塔宽度 = DSH 左边栏宽度（可拖拽，动态跟随） */
			function fitBabelWidth() {
				var babel = document.getElementById("ak-babel");
				if (!babel) return;
				var frame = document.querySelector('#root [style*="grid-template-columns"]');
				var side = frame && frame.children && frame.children[0] ? frame.children[0] : null;
				var w = side ? side.offsetWidth : 280;
				if (!w || w < 80) w = 280;
				babel.style.width = w + "px";
			}

			/* ---------------- particles ---------------- */
			function setupParticles() {
				var canvas = document.createElement("canvas");
				canvas.id = "ak-particles";
				document.body.appendChild(canvas);
				var cctx = canvas.getContext("2d");
				var W = 0, H = 0, dpr = 1, motes = [], running = false, raf = null;

				function resize() {
					dpr = Math.min(window.devicePixelRatio || 1, 2);
					W = window.innerWidth;
					H = window.innerHeight;
					canvas.width = Math.floor(W * dpr);
					canvas.height = Math.floor(H * dpr);
					canvas.style.width = W + "px";
					canvas.style.height = H + "px";
					cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
				}
				var COLORS = ["167,139,250", "196,132,252", "232,121,249", "211,200,255", "217,179,108"];
				function makeMote(isShard) {
					return {
						x: Math.random() * W,
						y: H + 20 + Math.random() * H * 0.4,
						r: isShard ? 1.6 + Math.random() * 2.2 : 0.5 + Math.random() * 1.4,
						vy: 0.08 + Math.random() * 0.3,
						vx: (Math.random() - 0.5) * 0.12,
						sway: 0.4 + Math.random() * 1.2,
						phase: Math.random() * Math.PI * 2,
						twinkle: 0.5 + Math.random() * 1.5,
						rot: Math.random() * Math.PI,
						vr: (Math.random() - 0.5) * 0.01,
						color: COLORS[(Math.random() * COLORS.length) | 0],
						alpha: 0.15 + Math.random() * 0.4,
						shard: isShard
					};
				}
				function seed() {
					var count = Math.min(90, Math.max(40, Math.floor(W / 18)));
					motes = [];
					for (var i = 0; i < count; i++) motes.push(makeMote(false));
					for (var j = 0; j < Math.max(3, Math.floor(count / 12)); j++) motes.push(makeMote(true));
				}
				function tick(now) {
					if (!running) return;
					cctx.clearRect(0, 0, W, H);
					var t = now / 1000;
					for (var i = 0; i < motes.length; i++) {
						var m = motes[i];
						m.y -= m.vy;
						m.x += m.vx + Math.sin(t * m.sway + m.phase) * 0.12;
						m.rot += m.vr;
						if (m.y < -24) { motes[i] = makeMote(m.shard); continue; }
						var tw = 0.55 + 0.45 * Math.sin(t * m.twinkle + m.phase);
						cctx.save();
						cctx.globalAlpha = Math.max(0, Math.min(1, m.alpha * tw));
						cctx.fillStyle = "rgb(" + m.color + ")";
						if (m.shard) {
							cctx.translate(m.x, m.y);
							cctx.rotate(m.rot);
							cctx.beginPath();
							cctx.moveTo(0, -m.r * 2.2);
							cctx.lineTo(m.r * 0.8, 0);
							cctx.lineTo(0, m.r * 2.2);
							cctx.lineTo(-m.r * 0.8, 0);
							cctx.closePath();
							cctx.fill();
							cctx.globalAlpha = m.alpha * tw * 0.35;
							cctx.shadowColor = "rgba(167,139,250,0.9)";
							cctx.shadowBlur = 8;
							cctx.fill();
						} else {
							cctx.beginPath();
							cctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
							cctx.fill();
						}
						cctx.restore();
					}
					raf = requestAnimationFrame(tick);
				}
				function start() {
					if (running) return;
					running = true;
					raf = requestAnimationFrame(tick);
				}
				function stop() {
					running = false;
					if (raf !== null) cancelAnimationFrame(raf);
					raf = null;
				}
				window.addEventListener("resize", function () { resize(); seed(); });
				document.addEventListener("visibilitychange", function () {
					if (document.hidden) stop();
					else if (enabled) { seed(); start(); }
				});
				resize();
				seed();
				if (enabled) start();
				window.__akParticles = { start: start, stop: stop };
			}

			/* ================ 设置页集成（设置 → 插件 → 普瑞赛斯主题） ================ */
			/* 可选依赖：用 ctx.get() 方法做安全查找（服务缺失返回 undefined，不抛错），
			   任何服务不可用（旧版 dsh）则 scope 保持 null，主题核心不受影响。 */
			var scope = null;
			var scopeUnsub = null;
			try {
				var settingsScopeSvc = ctx.get("settingsScope");
				if (settingsScopeSvc && typeof settingsScopeSvc.bind === "function") {
					scope = settingsScopeSvc.bind({ namespace: SETTINGS_NS });
					scopeUnsub = scope.subscribe(function () {
						var snap = scope.getSnapshot();
						var value = (snap && snap.value) || {};
						cfgMode = typeof value.mode === "string" ? value.mode : null;
						evaluate();
					});
					var initSnap = scope.getSnapshot();
					var initVal = (initSnap && initSnap.value) || {};
					cfgMode = typeof initVal.mode === "string" ? initVal.mode : null;
				}
			} catch (e) {
				console.error("[priestess-styled-theme] settingsScope.bind failed:", e);
				window.__akDebug = window.__akDebug || {};
				window.__akDebug.scopeError = String(e && e.message || e);
			}

			/* 卡片控制器：暂存模式 + 保存到设置文档 */
			function makeCardController(scopeRef) {
				var listeners = [];
				var staged = null;
				/* 不可变快照：getSnapshot 必须返回稳定引用（React useSyncExternalStore 要求），
				   内容变化时整体替换，否则会触发无限重渲染（React #185） */
				var snapshot = { mode: "auto", dirty: false, saving: false, failed: false, writable: true };
				var store = {
					subscribe: function (cb) { listeners.push(cb); return function () { listeners = listeners.filter(function (l) { return l !== cb; }); }; },
					getSnapshot: function () { return snapshot; }
				};
				function publish() { for (var i = 0; i < listeners.length; i++) listeners[i](); }
				function set(patch) { snapshot = Object.assign({}, snapshot, patch); publish(); }
				function refresh() {
					var snap = scopeRef.getSnapshot();
					var value = (snap && snap.value) || {};
					set({
						mode: typeof value.mode === "string" ? value.mode : "auto",
						writable: !snap || snap.writable !== false
					});
				}
				function stageMode(mode) { staged = mode; set({ mode: mode, dirty: true }); }
				function save() {
					if (!snapshot.dirty || snapshot.saving) return;
					set({ saving: true, failed: false });
					var mode = staged !== null ? staged : snapshot.mode;
					var ops = [];
					if (mode === "on") {
						/* 应用：写入 on */
						ops.push(scopeRef.set("mode", "on"));
					} else if (mode === "off") {
						/* 关闭：写入 off */
						ops.push(scopeRef.set("mode", "off"));
					} else {
						/* 其它/历史值：回退为应用 */
						ops.push(scopeRef.set("mode", "on"));
					}
					Promise.all(ops)
						.then(function () { staged = null; set({ saving: false, dirty: false }); })
						.catch(function () { set({ saving: false, failed: true }); });
				}
				function discard() { staged = null; set({ dirty: false }); refresh(); }
				refresh();
				scopeRef.subscribe(refresh);
				return {
					/* 注入给卡片组件的 props：hooks -> useArknightsCard，actions -> stageMode/save/discard */
					inject: function () {
						return {
							hooks: { arknightsCard: store },
							stageMode: stageMode,
							save: save,
							discard: discard
						};
					}
				};
			}

			/* 卡片组件（React 手写，自包含样式） */
			var CARD_STYLE = {
				card: { border: "1px solid rgba(190,168,255,0.16)", background: "rgba(19,24,41,0.7)", borderRadius: "12px", padding: "0", listStyle: "none", marginBottom: "8px" },
				header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", width: "100%", padding: "12px 14px", background: "transparent", border: "none", cursor: "pointer", color: "var(--dsw-alias-label-primary)", textAlign: "left" },
				title: { fontWeight: 600, fontSize: "14px" },
				badge: { fontSize: "11px", color: "#d9b36c" },
				body: { padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: "6px" },
				row: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", padding: "3px 0", cursor: "pointer" },
				hint: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)", lineHeight: 1.5 },
				actions: { display: "flex", gap: "8px", marginTop: "10px" },
				btn: { padding: "5px 12px", borderRadius: "8px", border: "1px solid rgba(190,168,255,0.2)", background: "rgba(139,92,246,0.18)", color: "var(--dsw-alias-label-primary)", cursor: "pointer", fontSize: "13px" },
				btnPrimary: { padding: "5px 12px", borderRadius: "8px", border: "none", background: "#7c5cff", color: "#fff", cursor: "pointer", fontSize: "13px" },
				fail: { fontSize: "12px", color: "#fb5c7a" }
			};
			function ArknightsCard(props) {
				var state = props.useArknightsCard(function (s) { return s; });
				var t = props.t;
				var openState = React.useState(false);
				var open = openState[0];
				var setOpen = openState[1];
				var MODES = [
					{ id: "on", label: t("modeOn") },
					{ id: "off", label: t("modeOff") }
				];
				return React.createElement("li", { style: CARD_STYLE.card },
					React.createElement("button", { type: "button", style: CARD_STYLE.header, onClick: function () { setOpen(!open); } },
						React.createElement("span", { style: CARD_STYLE.title }, t("title")),
						state.dirty ? React.createElement("span", { style: CARD_STYLE.badge }, t("unsaved")) : null
					),
					open ? React.createElement("div", { style: CARD_STYLE.body },
						MODES.map(function (m) {
							return React.createElement("label", { key: m.id, style: CARD_STYLE.row },
								React.createElement("input", { type: "radio", name: "ak-mode", checked: state.mode === m.id, onChange: function () { props.stageMode(m.id); } }),
								m.label
							);
						}),
						React.createElement("p", { style: CARD_STYLE.hint }, t("uninstallHint")),
						state.failed ? React.createElement("p", { style: CARD_STYLE.fail, role: "status" }, t("saveFailed")) : null,
						React.createElement("div", { style: CARD_STYLE.actions },
							React.createElement("button", { type: "button", style: CARD_STYLE.btn, disabled: !state.dirty || state.saving, onClick: props.discard }, t("discard")),
							React.createElement("button", { type: "button", style: CARD_STYLE.btnPrimary, disabled: !state.dirty || state.saving, onClick: props.save }, t("save"))
						)
					) : null
				);
			}

			/* 文案 */
			var LOCALE_ZH = {
				"settings.title": "普瑞赛斯主题",
				"settings.description": "普瑞赛斯 · 源石协议 主题插件",
				"title": "普瑞赛斯主题",
				"modeOn": "应用",
				"modeOff": "关闭",
				"uninstallHint": "卸载：在插件目录运行 .\\manage.ps1 uninstall 后重启 dsh",
				"save": "保存",
				"discard": "放弃",
				"unsaved": "未保存",
				"saveFailed": "保存失败"
			};
			var LOCALE_EN = {
				"settings.title": "Priestess Theme",
				"settings.description": "Priestess · Originium theme plugin",
				"title": "Priestess Theme",
				"modeOn": "Apply",
				"modeOff": "Disable",
				"uninstallHint": "Uninstall: run .\\manage.ps1 uninstall in the plugin folder, then restart dsh",
				"save": "Save",
				"discard": "Discard",
				"unsaved": "Unsaved",
				"saveFailed": "Save failed"
			};

			/* 注册设置卡片（设置 → 插件）——可选增强，依赖 react + slots + locale + settingsScope。
			   这些服务在启动早期可能尚未就绪（尤其第三方插件加载较早时），这里轮询等待它们
			   全部可用后再注册卡片，避免卡片因时机问题缺失；主题核心功能始终不受影响。 */
			var cardController = null;
			var regTries = 0;
			function tryRegisterCard() {
				try {
					regTries++;
					if (React === null) {
						console.info("[priestess-styled-theme] react 模块不可用，跳过设置卡片（主题核心照常）");
						return;
					}
					var slotsSvc = ctx.get("slots");
					var localeSvc = ctx.get("locale");
					var settingsSvc = ctx.get("settingsScope");
					if (!slotsSvc || !localeSvc || !settingsSvc) {
						/* 服务尚未就绪，稍后重试（最多约 10 秒） */
						if (regTries < 50) setTimeout(tryRegisterCard, 200);
						else console.info("[priestess-styled-theme] 设置卡片依赖服务超时未就绪，跳过（主题核心照常）");
						return;
					}
					if (scope === null) {
						try { scope = settingsSvc.bind({ namespace: SETTINGS_NS }); } catch (e) { /* ignore */ }
					}
					try { cardController = makeCardController(scope); }
					catch (err) { console.error("[priestess-styled-theme] card controller failed:", err); }
					if (cardController === null) return;
					ctx.effect(function () { return localeSvc.register(SETTINGS_NS, { zh: LOCALE_ZH, en: LOCALE_EN }); }, "priestess-styled-theme: settings locale");
					slotsSvc.inject("settings.plugin.item", function* () {
						yield slotsSvc.register({
							name: "settings.plugin.item",
							key: SETTINGS_NS,
							locale: SETTINGS_NS,
							inject: function () { return cardController.inject(); }
						}, ArknightsCard);
					});
					window.__akDebug = window.__akDebug || {};
					window.__akDebug.cardRegistered = true;
				} catch (e) {
					console.error("[priestess-styled-theme] settings card registration failed:", e);
				}
			}
			tryRegisterCard();

			/* ---------------- evaluation loop ---------------- */
			function evaluate() {
				setTheme(decide());
			}

			var observer = null;
			function startObserver() {
				if (observer) return;
				var run = debounce(function () { evaluate(); }, 200);
				observer = new MutationObserver(run);
				observer.observe(document.body, { childList: true, subtree: true, characterData: true });
			}

			/* ---------------- boot ---------------- */
			window.__akDebug = { target: TARGET, enabled: false, refresh: refreshSessions, evaluate: evaluate };
			document.documentElement.setAttribute("data-arknights-ready", "1");
			refreshSessions();
			openMux();
			var bootTimer = setInterval(function () {
				if (!dataReady) refreshSessions();
				clearInterval(bootTimer);
			}, 4000);
			var sessionTimer = setInterval(refreshSessions, 20000);
			startObserver();

			// 巴别塔宽度跟随窗口与左边栏拖拽
			window.addEventListener("resize", function () { fitBabelWidth(); });
			var fitTimer = setInterval(function () {
				var frame = document.querySelector('#root [style*="grid-template-columns"]');
				if (frame && !frame.__akFitObserved) {
					frame.__akFitObserved = true;
					new MutationObserver(function () { fitBabelWidth(); })
						.observe(frame, { attributes: true, attributeFilter: ["style"] });
				}
			}, 2000);

			// cordis dispose: stop polling/observers (browser reload covers the rest)
			return function disposer() {
				clearInterval(bootTimer);
				clearInterval(sessionTimer);
				clearInterval(fitTimer);
				if (observer) observer.disconnect();
				if (scopeUnsub) try { scopeUnsub(); } catch (e) { /* ignore */ }
				if (ws) { try { ws.close(); } catch (e) { /* ignore */ } }
			};
		};

		/* 对象形式导出（不要导出 default 函数）：runner 会将函数形式视为"无 inject 声明"，
		   导致 settingsScope/locale/slots 依赖全部不可用。旧 dsh 兼容由 react 惰性加载保证。 */
		exports.apply = apply;
		exports.name = name;
		exports.inject = inject;
		return module.exports;
	}
});
