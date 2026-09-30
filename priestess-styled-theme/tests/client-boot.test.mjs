/**
 * Client-bundle boot contract test.
 *
 * Loads lib/client.js exactly the way the DSH shell does — through
 * `window.__ModuleLoader__.load({ id, factory })` with a lazy-CJS `require` —
 * then applies the plugin face against a stub DOM and asserts the observable
 * contract. This is the test that catches a plugin `apply()` that recurses or
 * a teardown that leaves the document dirty.
 *
 * Run: node --test tests/
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
/** Overridable so a deliberately-broken copy can prove the test bites. */
const BUNDLE = process.env.PRIESTESS_BUNDLE ?? join(here, "..", "lib", "client.js");
const PLUGIN_ID = "priestess-styled-theme";

/* ------------------------------------------------------------------ DOM stub */

/** camelCase -> kebab-case, the mapping `dataset` uses for data-* attributes. */
function kebab(name) {
	return String(name).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function makeElement(tag) {
	const el = {
		tagName: String(tag).toUpperCase(),
		children: [],
		attributes: {},
		style: {},
		id: "",
		parentNode: null,
		setAttribute(name, value) { this.attributes[name] = String(value); },
		getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; },
		hasAttribute(name) { return name in this.attributes; },
		removeAttribute(name) { delete this.attributes[name]; },
		toggleAttribute(name, on) {
			if (on) this.attributes[name] = "";
			else delete this.attributes[name];
		},
		appendChild(child) {
			child.parentNode = this;
			this.children.push(child);
			if (child.id) registry.set(child.id, child);
			return child;
		},
		remove() {
			if (this.parentNode) {
				const i = this.parentNode.children.indexOf(this);
				if (i !== -1) this.parentNode.children.splice(i, 1);
			}
			if (this.id) registry.delete(this.id);
		},
		addEventListener() {},
		removeEventListener() {}
	};
	/* `dataset.x = v` must land on the `data-x` attribute, as in a real DOM. */
	el.dataset = new Proxy({}, {
		get: (_, key) => el.getAttribute(`data-${kebab(key)}`),
		set: (_, key, value) => { el.setAttribute(`data-${kebab(key)}`, value); return true; },
		has: (_, key) => el.hasAttribute(`data-${kebab(key)}`),
		deleteProperty: (_, key) => { el.removeAttribute(`data-${kebab(key)}`); return true; }
	});
	if (el.tagName === "CANVAS") {
		const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
		el.getContext = () => ctx;
	}
	return el;
}

const registry = new Map();

function descendants(root) {
	const out = [];
	const walk = (node) => {
		for (const child of node.children ?? []) {
			out.push(child);
			walk(child);
		}
	};
	walk(root);
	return out;
}

/** Minimal matcher for the two selector shapes the bundle uses. */
function matches(el, selector) {
	const m = selector.match(/^([a-zA-Z]+)\[([a-zA-Z-]+)\s*=\s*['"]([^'"]*)['"]\]$/);
	if (m) {
		const [, tag, attr, value] = m;
		return el.tagName === tag.toUpperCase() && el.getAttribute(attr) === value;
	}
	return false;
}

const documentElement = makeElement("html");
const head = makeElement("head");
const body = makeElement("body");
const favicon = makeElement("link");
favicon.setAttribute("rel", "icon");
favicon.setAttribute("href", "/default-favicon.svg");

const document = {
	documentElement,
	head,
	body,
	hidden: false,
	createElement: makeElement,
	getElementById: (id) => registry.get(id) ?? null,
	querySelector(selector) {
		if (matches(favicon, selector)) return favicon;
		return descendants(head).concat(descendants(body)).find((el) => matches(el, selector)) ?? null;
	},
	addEventListener() {},
	removeEventListener() {}
};
head.appendChild(favicon);

/* --------------------------------------------------------------- window stub */

const storage = new Map();
const windowListeners = new Map();
const fetchCalls = [];

const window = {
	document,
	location: { search: "", href: "http://127.0.0.1:3080/" },
	localStorage: {
		getItem: (k) => (storage.has(k) ? storage.get(k) : null),
		setItem: (k, v) => storage.set(k, String(v))
	},
	addEventListener(type, fn) {
		if (!windowListeners.has(type)) windowListeners.set(type, []);
		windowListeners.get(type).push(fn);
	},
	removeEventListener(type, fn) {
		const list = windowListeners.get(type);
		if (list) windowListeners.set(type, list.filter((f) => f !== fn));
	},
	dispatchEvent() { return true; },
	devicePixelRatio: 1,
	innerWidth: 1440,
	innerHeight: 900
};

/* ------------------------------------------------------------------ React stub */

let hookSlot = 0;
const hookState = [];

const React = {
	Fragment: Symbol("Fragment"),
	createElement(type, props, ...children) {
		return { type, props: { ...(props ?? {}), children: children.length <= 1 ? children[0] : children } };
	},
	useState(initial) {
		const slot = hookSlot++;
		if (!(slot in hookState)) hookState[slot] = initial;
		const set = (next) => {
			hookState[slot] = typeof next === "function" ? next(hookState[slot]) : next;
		};
		return [hookState[slot], set];
	},
	useEffect(fn) {
		hookSlot++;
		const cleanup = fn();
		if (typeof cleanup === "function") hookState.push(cleanup);
	}
};

/* --------------------------------------------------- load the real bundle */

const registrations = [];
const sandbox = {
	window: undefined,
	document,
	React,
	fetch: (url, options = {}) => {
		fetchCalls.push({ url, method: options.method ?? "GET" });
		return Promise.resolve({
			ok: true,
			status: 200,
			json: () => Promise.resolve({ mode: storage.get("ak-mode") === "off" ? "off" : "on" })
		});
	},
	requestAnimationFrame: () => 1,
	cancelAnimationFrame: () => {},
	CustomEvent: class { constructor(type) { this.type = type; } },
	URLSearchParams,
	console
};
sandbox.window = window;
window.__ModuleLoader__ = { load: (registration) => registrations.push(registration) };

const source = readFileSync(BUNDLE, "utf8");
// The bundle is a browser script: evaluate it against the stub globals.
new Function(...Object.keys(sandbox), source)(...Object.values(sandbox));

const requireStub = (id) => {
	if (id === "react") return React;
	throw new Error(`unexpected require("${id}") — declare it in dsh.client.external`);
};

function loadPlugin() {
	assert.equal(registrations.length, 1, "bundle must register exactly one factory");
	assert.equal(registrations[0].id, PLUGIN_ID, "factory id must be the package name");
	return registrations[0].factory(requireStub);
}

/* ------------------------------------------------------------------- tests */

test("bundle registers a lazy-CJS factory under the package id", () => {
	const exports = loadPlugin();
	assert.equal(typeof exports.apply, "function");
	assert.equal(typeof exports.name, "string");
	assert.deepEqual(exports.inject, ["slots"], "browser half must only require the slots service");
});

test("apply() paints the theme without recursing", async () => {
	const exports = loadPlugin();
	const injected = [];
	let registered = null;
	const effects = [];

	const ctx = {
		slots: {
			inject(key, callback) { injected.push(key); registered = callback(); },
			register(options, component) { this.options = options; this.component = component; return () => {}; }
		},
		effect(callback) { const dispose = callback(); effects.push(dispose); return () => dispose?.(); }
	};

	/* The regression: a same-named helper made this throw
	   "Maximum call stack size exceeded" before doing anything at all. */
	assert.doesNotThrow(() => exports.apply(ctx), "apply() must not recurse");

	assert.ok(documentElement.hasAttribute("data-arknights"), "theme attribute must be set on <html>");
	assert.equal(favicon.getAttribute("href"), "/arknights-assets/favicon.svg", "favicon must be swapped");
	assert.ok(registry.has("ak-river"), "river artwork must be mounted");
	assert.ok(registry.has("ak-watermark"), "Priestess artwork must be mounted");
	assert.ok(registry.has("ak-particles"), "particle canvas must be mounted");
	assert.ok(
		descendants(head).some((el) => el.getAttribute("data-plugin") === PLUGIN_ID),
		"stylesheet link must be injected into <head>"
	);
	assert.deepEqual(injected, ["settings.plugin.item"], "card must register into the plugin settings slot");
	assert.equal(typeof registered, "function", "card registration must produce a disposer");

	/* Let the boot config read settle. */
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.ok(fetchCalls.some((c) => c.url.endsWith("/config")), "boot must read the host config once");
});

test("the settings card renders the 应用/关闭 controls", async () => {
	const exports = loadPlugin();
	let component = null;
	const ctx = {
		slots: { inject: (key, cb) => cb(), register: (options, Comp) => { component = Comp; return () => {}; } },
		effect: (cb) => { cb(); }
	};
	exports.apply(ctx);
	assert.equal(typeof component, "function", "a card component must be registered");

	/* Cards start collapsed: expand through the header, then re-render. */
	const render = () => {
		hookSlot = 0;
		return component();
	};
	const collapsed = render();
	const text = (tree) => JSON.stringify(tree, (k, v) => (typeof v === "function" ? "[fn]" : v));

	assert.match(text(collapsed), /普瑞赛斯主题/, "card title must be present on the collapsed header");

	collapsed.props.children[0].props.onClick();
	const expanded = render();
	const body = text(expanded);
	assert.match(body, /应用/, "expanded card must offer 应用");
	assert.match(body, /关闭/, "expanded card must offer 关闭");
	assert.match(body, /manage\.ps1 uninstall/, "card must carry the uninstall hint");
});

test("apply() is fail-soft: a broken step never breaks the shell", async () => {
	const exports = loadPlugin();
	const errors = [];
	const originalError = console.error;
	console.error = (...args) => errors.push(args);

	try {
		const ctx = {
			/* A hostile/broken slots service must not propagate out of apply(). */
			slots: { inject() { throw new Error("slot declaration exploded"); }, register() { throw new Error("nope"); } },
			effect() { throw new Error("effect registry unavailable"); }
		};
		assert.doesNotThrow(() => exports.apply(ctx), "a decorative plugin must never fail plugin loading");
	} finally {
		console.error = originalError;
	}

	assert.ok(errors.length >= 1, "the failure must still be logged, not swallowed silently");
	/* The theme itself must have painted despite the broken services. */
	assert.ok(documentElement.hasAttribute("data-arknights"), "theme must still apply");
});
test("teardown restores the document (HMR / unload safety)", async () => {
	const exports = loadPlugin();
	let teardown = null;
	const ctx = {
		slots: { inject: (key, cb) => cb(), register: () => () => {} },
		effect(callback) { teardown = callback(); return () => teardown?.(); }
	};
	exports.apply(ctx);
	await new Promise((resolve) => setTimeout(resolve, 0));

	assert.equal(typeof teardown, "function", "apply must register a teardown");
	teardown();

	assert.ok(!documentElement.hasAttribute("data-arknights"), "theme attribute must be cleared");
	assert.equal(favicon.getAttribute("href"), "/default-favicon.svg", "original favicon must be restored");
	assert.ok(!registry.has("ak-river"), "river artwork must be removed");
	assert.ok(!registry.has("ak-watermark"), "Priestess artwork must be removed");
	assert.ok(!registry.has("ak-particles"), "particle canvas must be removed");
	assert.ok(
		!descendants(head).some((el) => el.getAttribute("data-plugin") === PLUGIN_ID),
		"stylesheet link must be removed"
	);
});
