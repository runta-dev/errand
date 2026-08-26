# Runta Crew development rules

- Keep the Electron main process, typed preload bridge, domain model, transports, state orchestration, and renderer UI as separate layers.
- Renderer code must not import Node.js or Electron. Keep `contextIsolation` and sandbox enabled, and `nodeIntegration` disabled.
- Never expose generic IPC, filesystem access, shell execution, or decrypted credentials through preload.
- Do not invent Runta Cloud Agents routes or event framing. Record assumptions in `API_INTEGRATION.md` and require route/transport injection.
- Mock fixtures belong under `src/clients/mock`, never in React components. Mock computer UI must remain visibly labeled.
- Default to the light theme and preserve both theme token sets.
- Read and follow `DESIGN_SYSTEM.md` for every UI change. Apply its visible-element admission rule and border checklist before adding permanent controls or decoration.
- Use strict TypeScript; do not add `any` escapes.
- Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and packaging/smoke checks for release-facing changes.
- Use Conventional Commits. Runta Crew is currently in rapid iteration: commit and push directly to the active remote branch. A pull request is not required unless the user explicitly asks for one. Keep branch history linear and never introduce merge commits.
- Runta Crew is temporarily not onboarded to Runta Review. Do not trigger, wait for, or treat Runta Review as a merge gate for this repository.
