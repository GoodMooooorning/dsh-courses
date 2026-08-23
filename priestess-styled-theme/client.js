/* ==========================================================================
   普瑞塞斯 · 源石协议 — Arknights theme client plugin (hand-written bundle)
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
		var inject = [];
		var ASSET = "/arknights-assets/";

		var apply = (ctx) => {
			if (window.__arknightsThemeLoaded) return;
			window.__arknightsThemeLoaded = true;

			/* ---------------- configuration ---------------- */
			/* 目标工作区名：可被 URL 参数 ?aktarget=xxx 或
			   localStorage['ak-target'] 覆盖（分享给他人时无需改代码） */
			var TARGET = "deepseek_workspace";
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

			/* ---------------- DOM signals ---------------- */
			function centerColumn() {
				var frame = document.querySelector('#root [style*="grid-template-columns"]');
				if (frame && frame.children && frame.children.length > 1) return frame.children[1];
				var scroll = document.querySelector("[data-conversation-scroll]");
				if (scroll) {
					var el = scroll;
					for (var i = 0; i < 6 && el; i++) el = el.parentElement;
					return el || document.body;
				}
				return document.body;
			}

			function readActiveTitle(center) {
				var navs = center.querySelectorAll("nav");
				for (var i = navs.length - 1; i >= 0; i--) {
					var disabled = navs[i].querySelector("button[disabled]");
					if (disabled) {
						var t = (disabled.textContent || "").trim();
						if (t) return t;
					}
				}
				for (var j = navs.length - 1; j >= 0; j--) {
					var btns = navs[j].querySelectorAll("button");
					if (btns.length) {
						var t2 = (btns[btns.length - 1].textContent || "").trim();
						if (t2) return t2;
					}
				}
				return "";
			}

			function readHeroLabel(center) {
				var btns = center.querySelectorAll("button");
				for (var i = 0; i < btns.length; i++) {
					var t = (btns[i].textContent || "").trim();
					if (!t || t.length > 80) continue;
					if (norm(t) === TARGET || titleToSessions[norm(t)] || basenameToSessions[norm(t)]) return t;
				}
				return "";
			}

			/* ---------------- decision ---------------- */
			function decide() {
				if (force !== null) return force;
				if (!dataReady) return false;
				var center = centerColumn();
				var activeTitle = readActiveTitle(center);
				var heroLabel = readHeroLabel(center);
				var candidates = [];
				if (activeTitle) candidates.push(activeTitle);
				if (heroLabel) candidates.push(heroLabel);
				for (var i = 0; i < candidates.length; i++) {
					var n = norm(candidates[i]);
					if (!n) continue;
					var ids = titleToSessions[n] || basenameToSessions[n];
					if (ids && ids.length) {
						var cwd = cwdBySession[ids[0]];
						return cwd != null && norm(basename(cwd)) === TARGET;
					}
					if (n === TARGET) return true;
				}
				return false;
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
				// 右侧：普瑞塞斯（8号）填满右栏
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
				if (ws) { try { ws.close(); } catch (e) { /* ignore */ } }
			};
		};

		exports.default = apply;
		exports.apply = apply;
		exports.name = name;
		exports.inject = inject;
		return module.exports;
	}
});
