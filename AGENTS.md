# Contribution instructions

Read docs/RECOVERY.md first, then docs/PRODUCT-3D.md and docs/IMPLEMENTATION.md. The user has authorized implementing the interactive 3D application, installing dependencies, and downloading required official data. The earlier static/synthetic-only scope is superseded. Read docs/SCIENCE.md before calculation work.

- Work through bounded phases until the requested app is implemented. Update docs/RECOVERY.md after every phase and on blockers. Preserve existing user changes. Three.js, Vite, Python, SpiceyPy and necessary scientific dependencies are authorized.
- Label fixtures synthetic. Never replace missing science with fabricated results or silently extrapolate dates.
- Preserve explicit units, UTC timestamps, frame/provenance metadata, and the data contract.
- Use textContent for external text. Keep runtime free of secrets and live scraping.
- Run `node scripts/check.mjs` and `node scripts/build.mjs`; on Windows the equivalent is `scripts/dev.ps1 -Check` / `-Build`.
- Add meaningful tests for scientific invariants and failure cases as science work lands. Do not create tests that merely mirror markup.
- Report files changed, checks, and remaining limitations in a few sentences. Do not reprint whole plans.
- Required NASA data downloads and local setup are authorized. Do not commit, push, or deploy unless requested. Never claim 100% accuracy or NASA certification of an exploratory landing candidate.
