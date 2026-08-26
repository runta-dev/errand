# Runta Crew development rules

- Keep the Electron main process, typed preload bridge, domain model, transports, state orchestration, and renderer UI as separate layers.
- Renderer code must not import Node.js or Electron. Keep `contextIsolation` and sandbox enabled, and `nodeIntegration` disabled.
- Never expose generic IPC, filesystem access, shell execution, or decrypted credentials through preload.
- Do not invent Runta Cloud Agents routes or event framing. Record assumptions in `API_INTEGRATION.md` and require route/transport injection.
- Mock fixtures belong under `src/clients/mock`, never in React components. Mock computer UI must remain visibly labeled.
- Default to the light theme and preserve both theme token sets.
- Use strict TypeScript; do not add `any` escapes.
- Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and packaging/smoke checks for release-facing changes.
- Use Conventional Commits. Changes in this `runta-dev` repository must go through a feature branch and pull request.
- Runta Crew is temporarily not onboarded to Runta Review. Do not trigger, wait for, or treat Runta Review as a merge gate for this repository. GitHub pull requests and the repository CI workflow are the required review/delivery path until this rule is explicitly changed.
