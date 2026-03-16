# NEXUS AGENTS DOCUMENT

## ExecPlans

When writing complex features or significant refactors, use an ExecPlan (as described in `.docs/PLANS.md`) from design to implementation. Write new plans to `.docs/exec/`. If inside Plan Mode, create the plan in a multiline markdown block, and write it after initiating implementation, so you can use the plan to guide your implementation and refer back to it as needed. If outside Plan Mode, you can write the plan directly and refer to it as needed.

## Rule

Always prefix shell commands with `rtk`.

Examples:

```bash
rtk git status
rtk cargo test
rtk npm run build
rtk pytest -q
rtk proxy <cmd>     # Run raw command without filtering
```

## RTK Verification

```bash
rtk --version
rtk gain
which rtk
```

## Development Details

Whenever new updates are made, this file (`AGENTS.md`) should be updated with any surprising files not apparent from the codebase that could benefit other developers. Focus on the why and when it could be useful.

- `web/packages/providers/src/base/provider-utils.ts` owns the shared HTML challenge detector used by HTTP providers. Check it first when Cloudflare-backed sites suddenly flip from working to `challenge-protected`, because some hosts now inject `/cdn-cgi/challenge-platform/scripts/jsd/main.js` on otherwise normal pages and that script alone should not be treated as a blocking interstitial.
- `web/packages/providers/src/providers/javguru.ts` intentionally filters search results down to numeric `/<post-id>/<slug>/` permalinks. Use that file first when Javguru starts returning static pages like `advanced-search` or `jav-actress-list`, because the site mixes page links into search markup and broad anchor scraping will surface junk results.
- `web/packages/providers/src/providers/aniwave.ts` applies provider-side title relevance filtering on top of `/filter?keyword=...`. Check that file first when Aniwave starts returning a page full of loosely related cards, because the site search can include broad substring matches that look populated but are not actually relevant to the user query.
- `web/apps/client/app/(dashboard)/discover/page.tsx`, `web/apps/client/app/(dashboard)/anime/[providerId]/[externalAnimeId]/page.tsx`, and `web/apps/client/app/(dashboard)/watch/[libraryItemId]/[episodeId]/page.tsx` must encode IDs when building URLs and decode dynamic route params before reusing them in API calls. Check those routes when providers use slash-containing IDs like Javguru, otherwise params get split or double-encoded and users land on 404s / in-page `Not found`.

## Sub Agents

Use sub-agents where appropriate to break down complex changes into manageable pieces, and to allow for more focused implementation and testing. For example, if implementing a new feature that requires both backend and frontend changes, you might create separate sub-agents for each layer of the stack, but before then use an exploring agent (or multiple) to get context on the codebase and research the best approaches for the feature, outline the specific steps needed for implementation into a final exec plan, and spin up task subagents that handle the implementation. This allows for more efficient development and testing, as each sub-agent can focus on a specific aspect of the implementation, and can be tested independently before being integrated into the larger codebase.

## Final Output

When asking the user to verify implemented changes, output a checklist they can fill to make sure everything works as intended. Describe what they should see, how it should work, and what they need to manually test. The user will then fill in the checklist and provide feedback on any issues they encounter, which can be used to further refine the implementation.

If the user asked for multiple changes and only some were implemented, make sure to clearly indicate which ones were completed, which ones were not fully realized, and which ones are still pending. For example:

```txt
- [x] Implement app scaffold (completed with basic layout and navigation)
- [~] Implement feature A (stub implementation completed)
- [ ] Implement feature B (pending due to X reason)
```

Include a commit message after each implementation or fix, following the Conventional Commits specifications. If it's a large change, follow this format:

```txt
feat(update): add startup update prompt choices and sectioned changelog pipeline
- feat(update): gate startup updates behind user choice (Yes/No/Remind Later)
- feat(update): persist per-release prompt decisions (ignore until newer, 24h remind-later)
- refactor(update): split updater flow into eligibility check and install phases
- feat(update): parse GitHub release body into sectioned changelog blocks for in-app prompt
- test(update): add updater decision/state-store/changelog parser coverage
- feat(ci): generate release notes sections from commit metadata and publish via body_path
- feat(ci): support multi-section changelog from Conventional Commit lines in commit body
- fix(navigation): clamp bottom navbar sizing to prevent tiny rendering on some phones
- fix(navigation): make top-level tab swipe detection more reliable in Explore
- fix(search): move Explore apply+navigate to app scope to prevent canceled loads on slower devices
- docs(readme): document updater prompt behavior and changelog contract
```
