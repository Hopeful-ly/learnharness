import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { LocalAgentBackgroundAccess, LocalAgentConnections, LocalAgentUIProvider, emptyLocalAgentStatus, localAgentNotice } from "../components/settings/local-agent-connections.tsx";
import { LOCAL_AGENTS, type LocalAgentStatus } from "../src/core/contracts/local-agents.ts";

// Local agent connections (docs/architecture.md §8.2): the Providers rows
// and dialog over GET/POST /api/connections/local.
const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined, host: HTMLDivElement | undefined;
const realFetch = globalThis.fetch;
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); root = undefined; host = undefined; globalThis.fetch = realFetch; });

function serve(initial: Partial<Record<"antigravity", Partial<LocalAgentStatus>>>) {
	let statuses: LocalAgentStatus[] = LOCAL_AGENTS.map((a) => ({ ...emptyLocalAgentStatus(a.providerId), ...initial[a.providerId] }));
	const posts: Array<[string, unknown]> = [];
	const controlHeaders: Array<[string, string | null]> = [];
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		controlHeaders.push([init?.method ?? "GET", new Headers(init?.headers).get("x-learnharness-subscriptions")]);
		if (init?.method === "POST") {
			const id = url.split("/").pop()!, body = JSON.parse(String(init.body));
			posts.push([id, body]);
			if (body.action === "enable") statuses = statuses.map((s) => s.providerId === id ? { ...s, enabled: body.enabled } : s);
			if (body.action === "signIn") statuses = statuses.map((s) => s.providerId === id ? { ...s, pending: true } : s);
		}
		return new Response(JSON.stringify({ statuses }), { status: 200, headers: { "Content-Type": "application/json" } });
	}) as typeof fetch;
	return { posts, controlHeaders };
}
async function mount(children: React.ReactNode = <LocalAgentConnections />) {
	host = document.createElement("div"); document.body.append(host); root = createRoot(host);
	await act(async () => root!.render(<LocalAgentUIProvider>{children}</LocalAgentUIProvider>));
	await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
const button = (text: string, scope: ParentNode = document) => { const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text); assert(found, `missing button ${text}`); return found; };
const dialog = () => document.querySelector<HTMLElement>('[data-testid="local-agent-dialog"]')!;
const row = () => document.querySelector<HTMLElement>('[data-testid="antigravity-connection"]')!;
async function click(element: HTMLElement) { await act(async () => { element.click(); await new Promise((resolve) => setTimeout(resolve, 0)); }); }

test("rows name each vendor runtime and start disconnected", async () => {
	serve({});
	await mount();
	const rows = [...document.querySelectorAll('[data-testid$="-connection"]')].map((row) => row.textContent);
	assert.deepEqual(rows, ["Antigravity (Antigravity ACP server)Connect"]);
});

test("Antigravity: the dialog discloses the data flow, shows the runtime's own account, and the toggle enables it", async () => {
	const { posts } = serve({ antigravity: { installed: true, version: "1.2.3", signedIn: true, account: "learner@example.com", plan: "Pro", usesSubscription: true } });
	await mount();
	await click(button("Connect", row()));
	assert.equal(dialog().querySelector('[data-testid="local-agent-notice"]')?.textContent, localAgentNotice(LOCAL_AGENTS[0]!));
	assert.match(localAgentNotice(LOCAL_AGENTS[0]!), /never sees or stores your Google sign-in/);
	assert.equal(dialog().querySelector('[data-testid="local-agent-account"]')?.textContent, "Signed in as learner@example.com · Pro plan.");
	assert(!dialog().textContent?.includes("Sign in with Google"));
	await click(dialog().querySelector<HTMLElement>('[role="switch"][aria-label="Use Antigravity in LearnHarness"]')!);
	assert.deepEqual(posts.at(-1), ["antigravity", { action: "enable", enabled: true }]);
});

test("Antigravity: a non-subscription sign-in is called out", async () => {
	serve({ antigravity: { installed: true, signedIn: true, usesSubscription: false } });
	await mount();
	await click(button("Connect", row()));
	assert(dialog().querySelector('[data-testid="local-agent-billing-warning"]'));
});

test("Antigravity: sign-in is delegated to the ACP server and shows progress", async () => {
	const { posts } = serve({ antigravity: { installed: true, signedIn: false } });
	await mount();
	await click(button("Connect", row()));
	await click(button("Sign in with Google", dialog()));
	assert.deepEqual(posts.at(-1), ["antigravity", { action: "signIn" }]);
	assert.match(dialog().textContent ?? "", /Finish signing in with Google in your browser/);
	assert(button("Cancel sign-in", dialog()));
});

test("a missing runtime links to its official install page", async () => {
	serve({});
	await mount();
	await click(button("Connect", row()));
	assert.equal(dialog().querySelector("a")?.getAttribute("href"), LOCAL_AGENTS[0]!.installUrl);
});

test("a slot pinned to a connection with background use off offers to enable it", async () => {
	serve({ antigravity: { installed: true, signedIn: true, enabled: true, connected: true, allowBackgroundUse: false } });
	await mount(<LocalAgentBackgroundAccess provider="antigravity" />);
	assert(button("Enable background use"));
});

test("status reads and control actions carry the same-origin control header", async () => {
	const { controlHeaders } = serve({ antigravity: { installed: true, signedIn: true } });
	await mount();
	await click(button("Connect", row()));
	await click(dialog().querySelector<HTMLElement>('[role="switch"][aria-label="Use Antigravity in LearnHarness"]')!);
	assert(controlHeaders.some(([method]) => method === "GET") && controlHeaders.some(([method]) => method === "POST"));
	for (const [method, header] of controlHeaders) assert.equal(header, "1", `${method} lacks x-learnharness-subscriptions`);
});
