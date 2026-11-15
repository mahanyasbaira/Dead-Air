---
inclusion: fileMatch
fileMatchPattern: ["**/*.test.ts", "**/*.test.tsx", "**/*.prop.test.ts"]
---
# Testing

- Example tests pin behaviour a person would describe ("Tower cannot see the wire report before delivery"). Property tests (`fast-check`) pin rules that must hold for every input.
- Property tests use a fixed `seed` in CI output on failure; paste the counterexample into an example test once fixed.
- UI tests drive real components with Testing Library through user-visible text and roles, never class names.
- No snapshot tests of canvases. Test the data that feeds the canvas (the Séance layout function returns plain geometry).
- A test that needs real audio hardware is a manual check: write the steps and the result in `docs/RESULTS.md`.
