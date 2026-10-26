/**
 * GET /api/connections/local — local agent connection statuses
 * (docs/architecture.md §8.2): installed? signed in? which account and
 * plan? plus the learner's enabled/background-use choices. Credential-free
 * by construction (the runtimes own their sign-in). `?refresh=1` re-probes.
 * Same-origin gated like the sibling /api/subscriptions controls.
 */
import { localAgentConnections, subscriptionRequestAuthorized } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
	if (!subscriptionRequestAuthorized(req)) return Response.json({ error: "Local agent controls require a same-origin LearnHarness request." }, { status: 403 });
	const force = new URL(req.url).searchParams.get("refresh") === "1";
	return Response.json({ statuses: await localAgentConnections(force) });
}
