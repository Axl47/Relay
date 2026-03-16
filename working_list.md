# Working List

## Pending
- [ ] Validate AnimeOnsen live extraction against a browser context that can clear the current Cloudflare gate

## In Progress
- [~] Document the remaining live-site verification risk caused by the current Cloudflare challenge behavior

## Done
- [x] Inspect AGENTS.md, `.docs`, and the existing browser extractor pipeline
- [x] Confirm AnimeOnsen is already registered as a browser-only provider and identify the missing extractor wiring
- [x] Research AnimeOnsen's page and API behavior enough to determine the player token flow and likely extraction path
- [x] Implement the AnimeOnsen browser extractor and register it
- [x] Update AGENTS.md with the AnimeOnsen maintenance note about `ao-content-id` and `ao.session`
- [x] Verify the browser app typechecks after the AnimeOnsen extractor lands
