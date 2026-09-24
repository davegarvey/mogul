## 1. Reconcile the spec

- [x] 1.1 Check each `exhibition-map-ui` client requirement against `packages/client/src/main.ts` and `packages/server/public/index.html`
- [x] 1.2 Measure the game view at 1440×900 to settle the no-scrolling requirement
- [x] 1.3 Write the `game-client` delta: add the four missing requirements and update Snapshot rendering and Player commands

## 2. Sync and archive

- [x] 2.1 Validate the change with `openspec validate sync-client-spec --strict`
- [x] 2.2 Archive the change, syncing the delta into `openspec/specs/game-client/spec.md`
