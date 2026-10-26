import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../app/api/connections/local/route.ts";
import { POST } from "../app/api/connections/local/[provider]/route.ts";

// Local agent connection routes (docs/architecture.md §8.2) share the
// sibling /api/subscriptions same-origin gate: a cross-site page must not
// toggle a connection, flip background consent, or start a sign-in.
const origin = "http://localhost:3000";
const params = (provider: string) => ({ params: Promise.resolve({ provider }) });
function request(method: "GET" | "POST", path: string, body?: unknown) {
	return new Request(`${origin}${path}`, {
		method,
		headers: { host: new URL(origin).host, origin, "sec-fetch-site": "same-origin", "x-learnharness-subscriptions": "1", "content-type": "application/json" },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
}

test("POST rejects cross-origin, header-less, origin-less and cross-site requests before acting", async () => {
	const forged = request("POST", "/api/connections/local/claude-code", { action: "enable", enabled: true }); forged.headers.set("origin", "https://unrelated.invalid");
	assert.equal((await POST(forged, params("claude-code"))).status, 403);
	const noHeader = request("POST", "/api/connections/local/claude-code", { action: "enable", enabled: true }); noHeader.headers.delete("x-learnharness-subscriptions");
	assert.equal((await POST(noHeader, params("claude-code"))).status, 403);
	const noOrigin = request("POST", "/api/connections/local/antigravity", { action: "signIn" }); noOrigin.headers.delete("origin");
	assert.equal((await POST(noOrigin, params("antigravity"))).status, 403);
	const crossSite = request("POST", "/api/connections/local/claude-code", { action: "consent", allowBackgroundUse: false }); crossSite.headers.set("sec-fetch-site", "cross-site");
	assert.equal((await POST(crossSite, params("claude-code"))).status, 403);
});

test("POST from the app itself passes the gate and reaches validation", async () => {
	assert.equal((await POST(request("POST", "/api/connections/local/claude-code", { action: "nope" }), params("claude-code"))).status, 400);
	assert.equal((await POST(request("POST", "/api/connections/local/unknown", { action: "refresh" }), params("unknown"))).status, 404);
});

test("GET rejects cross-origin and header-less requests (a refresh spawns the runtimes)", async () => {
	const forged = request("GET", "/api/connections/local?refresh=1"); forged.headers.set("origin", "https://unrelated.invalid");
	assert.equal((await GET(forged)).status, 403);
	const noHeader = request("GET", "/api/connections/local?refresh=1"); noHeader.headers.delete("x-learnharness-subscriptions");
	assert.equal((await GET(noHeader)).status, 403);
});
