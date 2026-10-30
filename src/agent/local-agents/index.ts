/**
 * Local agent connections (docs/architecture.md §8.2): Antigravity through
 * Google's official ACP server — installed and signed in by the learner,
 * driven by the app over its documented local protocol with the app's tools
 * bridged over a loopback MCP server. (Claude Code is the separate native
 * `claude-code` provider in src/agent/claude-code/.)
 */
export {
	cancelLocalAgentSignIn,
	configureLocalAgentPreferences,
	isLocalAgentProvider,
	localAgentAdmissionCurrent,
	localAgentBackgroundAllowed,
	localAgentConnected,
	localAgentModel,
	localAgentModels,
	localAgentStatus,
	localAgentStatuses,
	onLocalAgentChange,
	refreshLocalAgents,
	setLocalAgentPreferences,
	signInLocalAgent,
} from "./state.ts";
export { localAgentError, localAgentStream } from "./stream.ts";
export { configureAppHeldEnvVars } from "./binaries.ts";
