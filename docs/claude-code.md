# Claude Code

LearnHarness can use an externally installed **Claude Code CLI** as a model provider. This is separate from the Anthropic API and built-in subscription connections. The CLI owns authentication, routing, model access, and billing; LearnHarness does **not** guarantee subscription-only use.

## Set up

1. [Install and authenticate Claude Code](https://code.claude.com/docs/en/setup) outside LearnHarness, on **the machine running the LearnHarness server**, under its OS user. No always-running CLI process is needed.
2. Make the executable discoverable in that server's `PATH` or a common user/native installation location. On Windows, a directly runnable `claude.exe` is required; `claude.cmd` alone does not qualify. Desktop launch environments may differ from terminals.
3. Enable **Settings → Providers → External CLI → Claude Code**. This app-wide opt-in is **off by default**. Use **Check again** to refresh installation status.
4. Select a Claude Code model: `opus`, `sonnet`, or `haiku`. These are CLI aliases, not pinned underlying versions.

The minimum version is **2.1.259** ([contract](../src/core/contracts/claude-code.ts)). The check runs only `--version`, not authentication or inference. Fresh model processes check again and refuse old/unverifiable versions. Passing proves neither account access, quota, billing method, nor complete protocol compatibility.

Install, update, sign in, and change CLI accounts externally. LearnHarness has no CLI account-status or reauthentication control. Disabling the opt-in blocks future requests without rewriting model selections or signing out the CLI; it does not interrupt an already admitted turn. Use normal cancellation for running work.

## What goes through the CLI

LearnHarness keeps control of its agent loop, tools, questions, saved history, and jobs. It supplies prompts, relevant history, and tool results to the CLI's configured service.

The launcher removes credentials injected **only by LearnHarness's key store**. Original launch-environment credentials, native CLI authentication, and routing remain available and may affect billing. LearnHarness does not copy its saved API keys into this provider.

Each child runs without a shell in an empty temporary working directory. LearnHarness disables built-in tools, hooks, slash commands, and permission prompts (CLI session persistence is disabled only for callers without a session ID; see below), and exposes its own declared tools through a token-protected loopback MCP bridge. Streamed tool intent is insufficient: execution requires an authenticated MCP request whose unique identity, name, and arguments match the stream. There is no stdout-only fallback.

These are integration boundaries, **not an OS sandbox or a provider-policy certification**. User settings/authentication remain available. Managed settings still take precedence where the CLI defines them. Bounded CLI stderr is logged when the process closes, so server logs can contain CLI diagnostics.

### Instruction loading

LearnHarness forces `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` in the child environment **and** inline settings, and pins `outputStyle: default`. User auth/routing settings otherwise remain available. The CLI's documented memory switch excludes user/project/managed-policy `CLAUDE.md` instructions, their imports/rules, and auto memory; it does not remove managed settings.

These controls depend on the CLI honoring them. Instruction isolation at the accepted minimum **2.1.259 has not been runtime verified**. Official documentation does not establish the switch's first supported version or exact startup evaluation order; managed settings can outrank inline settings. This is not a guarantee against every plugin instruction channel or CLI-added account context.

Official references: [memory switch](https://code.claude.com/docs/en/env-vars#variables), [managed instruction files](https://code.claude.com/docs/en/memory#deploy-organization-wide-claude-md), [settings precedence](https://code.claude.com/docs/en/settings#settings-precedence), and [settings environment values](https://code.claude.com/docs/en/settings-reference#env).

## Questions, reuse, and cancellation

LearnHarness's persisted transcript is authoritative; a Claude Code saved session
is only a cache of it. [Conversation agents](../src/agent/teacher-agent.ts) pass the
existing chat ID as Pi's `sessionId`; [background subagent runs](../src/agent/subagents/pi-run.ts)
get a fresh identity per invocation, stable across that run's tool turns.

A child normally exits after its final response. It can stay alive while tools await results, including a learner question, and resume only for the same owner/session and compatible history, tools, model, prompt, effort, and environment.

Held children expire after **10 minutes** idle. The CLI MCP timeout is **30 minutes**, providing headroom rather than a general model deadline. If no eligible child remains after timeout/restart/configuration change, the next call starts fresh.

Callers with a session ID also get a CLI session per chat
([registry](../src/agent/claude-code/cli-sessions.ts)). The first launch passes
`--session-id <uuid>`. When that turn ends with a clean `stop` or `length`, the
registry records the UUID with hashes of the configuration and history. The next
fresh launch for the same session ID passes `--resume <uuid>` and sends only the
new learner messages, so the CLI carries native history, prompt cache and signed
thinking. Resume requires an unchanged configuration, an unchanged history prefix
(ignoring thinking blocks, which the CLI streams without text), and only learner
messages after it. The registry is in memory and each launch claims its record,
so an error, abort, held tool, restart or changed history makes the next call
start a new CLI session. If `--resume` fails before any output reaches Pi (for
example `No conversation found with session ID`), the same turn starts a new
session instead. The CLI writes these session files under
`~/.claude/projects/`; LearnHarness neither reads nor deletes them.

A new CLI session, or any fresh launch without a session ID, replays the active
LearnHarness history. [Replay](../src/agent/claude-code/transcript.ts) is labelled
user/assistant/tool-call/tool-result text in a new user input, preserving
user/tool-result images; it is not exact native-role/thinking history restoration.
The first learner message is sent unlabelled as its own block, and a text block
closes after each later learner message, so consecutive replays share block
boundaries the prompt cache can match. The current system prompt and tool schemas
are supplied separately. A compatibility failure after admission is reported on
continuation, not silently hidden by replay. Apart from a failed resume, recovery
is not a guarantee that arbitrary CLI failures will retry automatically.

Abort terminates the child and active stream. Cancelling a queued tool request prevents later admission but cannot undo already admitted work. Normal exit, failure, abort, and idle expiry close bridge calls/listeners and remove temporary directories, escalating process termination if necessary. Cleanup is not guaranteed after an OS crash or forced server termination.

## Usage and troubleshooting

Tokens come from CLI stream usage, including cache counts. A best-effort local CLI query may report an effective context budget; it can be lower than the nominal model window because of CLI auto-compaction. Missing metadata leaves the maximum unknown, not guessed.

Dollar costs remain **unpriced** and menus say **CLI billing**. LearnHarness does not import successful CLI result-line dollar totals; internal zero rates are placeholders, not free inference. Check actual charges and entitlements independently. See [accounting](compaction-accounting.md).

| Symptom | Check |
| --- | --- |
| Model absent or saved choice unavailable | Enable the opt-in and check discovery under the server's OS user/environment. Saved selections are not silently remapped. |
| Not found / unchecked / update required | Repair or update the external executable, then use **Check again**. The probe has a five-second timeout and accepts a bounded version response; it does not install or authenticate anything. |
| Meets minimum, but request fails | Verify native CLI authentication, routing, model access, and quota externally. Installation readiness does not test them. |
| MCP identity/admission error | The installed CLI did not satisfy the bridge contract. No stdout-only tool fallback is available; investigate compatibility rather than bypassing admission. |
| Answer resumes with a new process | Expected after idle expiry, restart, or reuse-validation failure; a held question's answer is replayed in a new CLI session. |
| Server log shows `claude CLI resume failed` | The CLI could not resume the chat's session (for example its file was removed); that turn continued in a new session with a replay. |
| No context maximum or dollar estimate | Expected when window metadata is unavailable or billing is CLI-controlled; neither is evidence of zero usage. |

## Maintainer entry points

[`src/agent/claude-code/`](../src/agent/claude-code/) contains discovery/launch, stream adaptation, MCP admission, reuse, replay, and context-window probing. The engine is registered in [`models.ts`](../src/agent/models.ts); credential provenance is in [`auth-env.ts`](../src/core/auth-env.ts). Settings status is exposed by [`server/claude-code.ts`](../src/server/claude-code.ts).

The `tests/claude-code-*.test.*` suites use synthetic CLI processes and MCP requests. They cover adapter contracts, not live account eligibility, provider approval, billing, or lesson quality.

| Area | Durable references |
| --- | --- |
| Discovery, version checks, default-off gating | [binary](../src/agent/claude-code/binary.ts), [installation](../src/agent/claude-code/installation.ts), [launcher](../src/agent/claude-code/launch.ts), [opt-in tests](../tests/claude-code-opt-in.test.ts), [version-runner tests](../tests/claude-code-version-runner.test.ts) |
| Actual Settings controls and status HTTP boundary | [UI](../components/settings/claude-code-status.tsx), [HTTP handler](../src/server/claude-code.ts), [UI tests](../tests/claude-code-status-ui.test.tsx), [HTTP tests](../tests/claude-code-status-http.test.ts) |
| MCP transport and identity admission | [bridge](../src/agent/claude-code/tool-bridge.ts), [bridge tests](../tests/claude-code-tool-bridge.test.ts), [stream tests](../tests/claude-code-stream.test.ts) |
| Launch isolation, auth provenance, reuse, CLI sessions, abort, cleanup | [stream](../src/agent/claude-code/stream.ts), [reuse comparison](../src/agent/claude-code/reuse-context.ts), [live-process registry](../src/agent/claude-code/live-processes.ts), [CLI session registry](../src/agent/claude-code/cli-sessions.ts), [stream tests](../tests/claude-code-stream.test.ts), [harness tests](../tests/claude-code-harness.test.ts) |
| Replay and learner-question lifecycle | [transcript](../src/agent/claude-code/transcript.ts), [transcript tests](../tests/claude-code-transcript.test.ts), [harness tests](../tests/claude-code-harness.test.ts) |
| Context and pricing | [window probe](../src/agent/claude-code/context-window.ts), [server pricing](../src/server/pricing.ts), [context tests](../tests/claude-code-context-window.test.ts), [usage/UI tests](../tests/claude-code-usage.test.tsx) |
