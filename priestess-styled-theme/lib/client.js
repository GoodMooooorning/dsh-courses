/**
 * priestess-styled-theme — browser client bundle for the DSH Web GUI.
 *
 * Format: the dsh 0.1.5 client-module lazy-CJS contract — executing this bundle
 * only registers a factory; the factory body (and every side effect in it) runs
 * at materialization. `exports` carries the plugin face (`name`/`inject`/`apply`).
 *
 * Startup logic (deliberately small and synchronous):
 *   1. paint on the first frame from the cached mode — no network, no timers,
 *      so there is no flash of the wrong theme and no work before first paint;
 *   2. confirm once with the host config route, then keep the cache in sync;
 *   3. register the settings card through `ctx.slots.inject`, which is
 *      event-driven (no polling);
 *   4. own a full teardown so an HMR swap or plugin unload leaves the document
 *      exactly as it was.
 *
 * The theme is pure decoration: it toggles `html[data-arknights]`, which gates
 * every rule in /arknights-assets/arknights.css. Nothing here touches the
 * frontend dist.
 */
window.__ModuleLoader__.load({ id: "priestess-styled-theme", factory: (require) => {
	const module = { exports: {} };
	const exports = module.exports;

	/* React is a platform seed word in the dsh shell; the guard keeps the theme
	   itself working on a build whose module table lacks it (card is skipped). */
	let React = null;
	try { React = require("react"); } catch (error) { React = null; }

	const ASSET = "/arknights-assets/";
	const CONFIG_URL = "/plugins/priestess-styled-theme/config";
	/** Settings namespace this card edits — must match the Host's registration. */
	const NS = "arknights-theme";
	const MODE_ON = "on";
	const MODE_OFF = "off";
	const CHANGE_EVENT = "priestess-styled-theme:changed";
	/** Decoration element ids this bundle owns (removed wholesale on teardown). */
	const RIVER_ID = "ak-river";
	const IMAGE_ID = "ak-watermark";
	const CANVAS_ID = "ak-particles";

	/* ---------------- storage (private mode may throw — never fatal) ---------------- */
	const store = {
		get(key) {
			try { return window.localStorage ? window.localStorage.getItem(key) : null; } catch (error) { return null; }
		},
		set(key, value) {
			try { if (window.localStorage) window.localStorage.setItem(key, value); } catch (error) { /* ignore */ }
		}
	};

	/* ---------------- manual override: ?ak=1 / ?ak=0 or localStorage ak-force ----------------
	   A debug escape hatch that outranks the stored setting. */
	const force = (() => {
		let value = null;
		const stored = store.get("ak-force");
		if (stored === "1" || stored === "0") value = stored === "1";
		try {
			const query = new URLSearchParams(window.location.search).get("ak");
			if (query === "1") value = true;
			else if (query === "0") value = false;
		} catch (error) { /* no URL API */ }
		return value;
	})();

	/* ---------------- state ----------------
	   `mode` starts from the cache so the first frame is already correct; the
	   async config read below only ever confirms or corrects it. */
	let mode = store.get("ak-mode") === MODE_OFF ? MODE_OFF : MODE_ON;
	let enabled = false;
	let decorationsMounted = false;
	let particles = null;

	/** The one decision: manual override, else the stored setting. */
	function decide() {
		if (force !== null) return force;
		return mode !== MODE_OFF;
	}

	/* ---------------- favicon ---------------- */
	function swapFavicon(on) {
		try {
			const link = document.querySelector("link[rel='icon']");
			if (!link) return;
			if (on) {
				if (!link.hasAttribute("data-ak-orig")) {
					link.setAttribute("data-ak-orig", link.getAttribute("href") ?? "");
				}
				link.setAttribute("href", `${ASSET}favicon.svg`);
			} else if (link.hasAttribute("data-ak-orig")) {
				link.setAttribute("href", link.getAttribute("data-ak-orig") ?? "");
				link.removeAttribute("data-ak-orig");
			}
		} catch (error) { /* cosmetic */ }
	}

	/* ---------------- particles (originium dust) ---------------- */
	function createParticles() {
		const canvas = document.createElement("canvas");
		canvas.id = CANVAS_ID;
		document.body.appendChild(canvas);
		const context = canvas.getContext("2d");
		const COLORS = ["167,139,250", "196,132,252", "232,121,249", "211,200,255", "217,179,108"];
		let width = 0;
		let height = 0;
		let motes = [];
		let running = false;
		let raf = null;

		function resize() {
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			width = window.innerWidth;
			height = window.innerHeight;
			canvas.width = Math.floor(width * dpr);
			canvas.height = Math.floor(height * dpr);
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;
			context.setTransform(dpr, 0, 0, dpr, 0, 0);
		}

		function makeMote(isShard) {
			return {
				x: Math.random() * width,
				y: height + 20 + Math.random() * height * 0.4,
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
			const count = Math.min(90, Math.max(40, Math.floor(width / 18)));
			motes = [];
			for (let i = 0; i < count; i++) motes.push(makeMote(false));
			for (let j = 0; j < Math.max(3, Math.floor(count / 12)); j++) motes.push(makeMote(true));
		}

		function tick(now) {
			if (!running) return;
			context.clearRect(0, 0, width, height);
			const t = now / 1000;
			for (let i = 0; i < motes.length; i++) {
				const mote = motes[i];
				mote.y -= mote.vy;
				mote.x += mote.vx + Math.sin(t * mote.sway + mote.phase) * 0.12;
				mote.rot += mote.vr;
				if (mote.y < -24) {
					motes[i] = makeMote(mote.shard);
					continue;
				}
				const twinkle = 0.55 + 0.45 * Math.sin(t * mote.twinkle + mote.phase);
				context.save();
				context.globalAlpha = Math.max(0, Math.min(1, mote.alpha * twinkle));
				context.fillStyle = `rgb(${mote.color})`;
				if (mote.shard) {
					context.translate(mote.x, mote.y);
					context.rotate(mote.rot);
					context.beginPath();
					context.moveTo(0, -mote.r * 2.2);
					context.lineTo(mote.r * 0.8, 0);
					context.lineTo(0, mote.r * 2.2);
					context.lineTo(-mote.r * 0.8, 0);
					context.closePath();
					context.fill();
					context.globalAlpha = mote.alpha * twinkle * 0.35;
					context.shadowColor = "rgba(167,139,250,0.9)";
					context.shadowBlur = 8;
					context.fill();
				} else {
					context.beginPath();
					context.arc(mote.x, mote.y, mote.r, 0, Math.PI * 2);
					context.fill();
				}
				context.restore();
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

		function onResize() { resize(); seed(); }
		function onVisibility() {
			if (document.hidden) stop();
			else if (enabled) { seed(); start(); }
		}
		window.addEventListener("resize", onResize);
		document.addEventListener("visibilitychange", onVisibility);
		resize();
		seed();

		return {
			start,
			stop,
			dispose() {
				stop();
				window.removeEventListener("resize", onResize);
				document.removeEventListener("visibilitychange", onVisibility);
				canvas.remove();
			}
		};
	}

	/* ---------------- decorations (CSS + artwork) ---------------- */
	function mountImg(id, src) {
		if (document.getElementById(id)) return;
		const wrapper = document.createElement("div");
		wrapper.id = id;
		const img = document.createElement("img");
		img.src = src;
		img.alt = "";
		img.draggable = false;
		wrapper.appendChild(img);
		document.body.appendChild(wrapper);
	}

	/** Mount the stylesheet and artwork once; safe to call repeatedly. */
	function ensureDecorations() {
		if (decorationsMounted || !document.body) return;
		decorationsMounted = true;
		if (!document.querySelector('link[data-plugin="priestess-styled-theme"]')) {
			const link = document.createElement("link");
			link.rel = "stylesheet";
			link.href = `${ASSET}arknights.css`;
			link.dataset.plugin = "priestess-styled-theme";
			document.head.appendChild(link);
		}
		mountImg(RIVER_ID, `${ASSET}river.svg`);
		mountImg(IMAGE_ID, `${ASSET}priestess-right.webp`);
		particles = createParticles();
		if (enabled) particles.start();
	}

	function removeDecorations() {
		if (particles) {
			particles.dispose();
			particles = null;
		}
		for (const id of [RIVER_ID, IMAGE_ID, CANVAS_ID]) {
			document.getElementById(id)?.remove();
		}
		document.querySelector('link[data-plugin="priestess-styled-theme"]')?.remove();
		decorationsMounted = false;
	}

	/* ---------------- theme toggle ---------------- */
	function setTheme(on) {
		if (on === enabled) return;
		enabled = on;
		document.documentElement.toggleAttribute("data-arknights", on);
		swapFavicon(on);
		if (on) {
			if (document.body) ensureDecorations();
			/* The shell can materialize before <body> exists; mount on the ready event. */
			else document.addEventListener("DOMContentLoaded", () => { if (enabled) ensureDecorations(); }, { once: true });
			if (particles) particles.start();
		} else if (particles) {
			particles.stop();
		}
	}

	/* NOTE: this must NOT be named `apply` — the plugin face below is also `apply`,
	   and two same-named function declarations share one hoisted binding, which
	   makes the plugin's `apply()` call itself (stack overflow at materialization). */
	function paintTheme() { setTheme(decide()); }

	/* ---------------- host config ---------------- */
	function announce() {
		try { window.dispatchEvent(new CustomEvent(CHANGE_EVENT)); } catch (error) { /* ignore */ }
	}

	/** One read at boot: the cached mode already painted, this only reconciles it. */
	function refreshConfig() {
		fetch(CONFIG_URL, { cache: "no-store", credentials: "same-origin" })
			.then((response) => (response.ok ? response.json() : null))
			.then((value) => {
				if (!value || typeof value.mode !== "string") return;
				mode = value.mode === MODE_OFF ? MODE_OFF : MODE_ON;
				store.set("ak-mode", mode);
				paintTheme();
				announce();
			})
			.catch(() => { /* host not answering — the cached mode keeps the theme stable */ });
	}

	/** Persist a new mode: apply and cache immediately, then confirm with the host. */
	function writeMode(next) {
		mode = next === MODE_OFF ? MODE_OFF : MODE_ON;
		store.set("ak-mode", mode);
		paintTheme();
		announce();
		return fetch(CONFIG_URL, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ mode })
		}).then((response) => {
			if (!response.ok) throw new Error(`write failed: ${response.status}`);
			return response.json();
		});
	}

	/* ---------------- settings card (设置 → 插件 → 普瑞赛斯主题) ---------------- */
	const CARD = {
		card: { border: "1px solid rgba(190,168,255,0.16)", background: "rgba(19,24,41,0.7)", borderRadius: "12px", padding: "0", listStyle: "none", marginBottom: "8px" },
		header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", width: "100%", padding: "12px 14px", background: "transparent", border: "none", cursor: "pointer", color: "var(--dsw-alias-label-primary)", textAlign: "left" },
		title: { fontWeight: 600, fontSize: "14px" },
		badge: { fontSize: "11px", color: "#d9b36c" },
		body: { padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: "6px" },
		row: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", padding: "3px 0", cursor: "pointer" },
		hint: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)", lineHeight: 1.5, margin: 0 },
		actions: { display: "flex", gap: "8px", marginTop: "10px" },
		btn: { padding: "5px 12px", borderRadius: "8px", border: "1px solid rgba(190,168,255,0.2)", background: "rgba(139,92,246,0.18)", color: "var(--dsw-alias-label-primary)", cursor: "pointer", fontSize: "13px" },
		btnPrimary: { padding: "5px 12px", borderRadius: "8px", border: "none", background: "#7c5cff", color: "#fff", cursor: "pointer", fontSize: "13px" },
		fail: { fontSize: "12px", color: "#fb5c7a", margin: 0 }
	};

	function SettingsCard() {
		const [open, setOpen] = React.useState(false);
		const [current, setCurrent] = React.useState(mode);
		const [draft, setDraft] = React.useState(null);
		const [saving, setSaving] = React.useState(false);
		const [failed, setFailed] = React.useState(false);

		/* The theme can change from outside the card (boot reconcile, ?ak override). */
		React.useEffect(() => {
			const sync = () => { setCurrent(mode); setDraft(null); };
			window.addEventListener(CHANGE_EVENT, sync);
			return () => window.removeEventListener(CHANGE_EVENT, sync);
		}, []);

		const dirty = draft !== null && draft !== current;

		const save = () => {
			if (!dirty || saving) return;
			setSaving(true);
			setFailed(false);
			writeMode(draft)
				.then(() => { setCurrent(mode); setDraft(null); setSaving(false); })
				.catch(() => { setSaving(false); setFailed(true); });
		};

		const MODES = [
			{ id: MODE_ON, label: "应用" },
			{ id: MODE_OFF, label: "关闭" }
		];
		const selected = draft ?? current;

		return React.createElement("li", { style: CARD.card },
			React.createElement("button", { type: "button", style: CARD.header, "aria-expanded": open, onClick: () => setOpen(!open) },
				React.createElement("span", { style: CARD.title }, "普瑞赛斯主题"),
				dirty ? React.createElement("span", { style: CARD.badge }, "未保存") : null
			),
			open ? React.createElement("div", { style: CARD.body },
				MODES.map((item) => React.createElement("label", { key: item.id, style: CARD.row },
					React.createElement("input", {
						type: "radio",
						name: "priestess-theme-mode",
						checked: selected === item.id,
						onChange: () => setDraft(item.id)
					}),
					item.label
				)),
				React.createElement("p", { style: CARD.hint }, "卸载：在插件目录运行 .\\manage.ps1 uninstall 后重启 dsh"),
				failed ? React.createElement("p", { style: CARD.fail, role: "status" }, "保存失败") : null,
				React.createElement("div", { style: CARD.actions },
					React.createElement("button", { type: "button", style: CARD.btn, disabled: !dirty || saving, onClick: () => setDraft(null) }, "放弃"),
					React.createElement("button", { type: "button", style: CARD.btnPrimary, disabled: !dirty || saving, onClick: save }, "保存")
				)
			) : null
		);
	}

	/* ---------------- plugin face ----------------
	   Fail-soft by construction: this is a decorative plugin, so a failure in any
	   one step must never take down the shell's plugin loading (which surfaces as
	   "Failed to load plugins" and blocks the whole UI). Each step is isolated and
	   only logs; the teardown is registered first so DOM cleanup always exists. */
	function apply(ctx) {
		/* 0. Own the cleanup: an HMR swap or plugin unload must leave a clean
		      document. Registered first because teardown is idempotent. */
		try {
			ctx.effect(() => () => {
				removeDecorations();
				document.documentElement.removeAttribute("data-arknights");
				swapFavicon(false);
				enabled = false;
			}, "priestess-styled-theme: theme lifecycle");
		} catch (error) {
			console.error("[priestess-styled-theme] teardown registration failed:", error);
		}

		/* 1. First frame: paint from the cached mode. Synchronous, no I/O. */
		try {
			paintTheme();
			window.__priestessTheme = {
				get mode() { return mode; },
				get force() { return force; },
				get enabled() { return enabled; },
				refresh: refreshConfig
			};
		} catch (error) {
			console.error("[priestess-styled-theme] theme bootstrap failed (theme skipped, shell unaffected):", error);
		}

		/* 2. Reconcile with the host once; the cache keeps later loads flash-free. */
		try {
			refreshConfig();
		} catch (error) {
			console.error("[priestess-styled-theme] config read failed:", error);
		}

		/* 3. Settings card — `slots.inject` waits for the declaration and disposes
		      with this fiber, so no polling or timers are needed. */
		try {
			if (React === null) {
				console.info("[priestess-styled-theme] react unavailable — settings card skipped (theme unaffected)");
				return;
			}
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				id: NS,
				key: NS,
				order: 1,
				inject: () => ({})
			}, SettingsCard));
		} catch (error) {
			console.error("[priestess-styled-theme] settings card registration failed:", error);
		}
	}

	module.exports = {
		name: "priestess-styled-theme",
		/* `slots` is the only service the browser half needs; the theme core needs none. */
		inject: ["slots"],
		apply
	};
	return module.exports;
} });
