# Sample Build Kickoff Packages

Three real generated deliverables, kept as reference for what the packager
emits and as a before/after marker for prompt changes. Client names are
**fictional placeholders** — no real engagement is described here.

| Sample | Shape | Sensitivity | Why it's here |
|---|---|---|---|
| [support-ticket-deflection.md](support-ticket-deflection.md) | generate | PII | The baseline case — drafting with a human always in the loop |
| [insurance-fnol-intake.md](insurance-fnol-intake.md) | process | regulated | The heaviest governance case; the test of whether §7 satisfies a compliance owner |
| [grant-proposal-assembly.md](grant-proposal-assembly.md) | generate | internal | Smallest budget, highest fabrication stakes — an invented outcome figure is a fraud exposure, not a typo |

Published for reading (Mermaid renders, private to the account that owns them):

- Support ticket deflection — https://claude.ai/code/artifact/54c29d2e-ca33-4a97-9366-ec6b0acc6fb2
- Insurance FNOL intake — https://claude.ai/code/artifact/b87722ae-592e-4abd-82bf-5727fa115918
- Grant proposal assembly — https://claude.ai/code/artifact/4147c9fa-b740-48d6-aeb3-ec3f344e3be3

## Known caveat

All three carry `promptRosterVersion: bk-1-claude` — they were generated before
the critic rubric was fixed, when the verdict field was measured constant
(SHIP WITH FIXES across eight runs regardless of plan quality). **Their
findings are real; their verdicts are not.** Regenerate under `bk-2-claude`
before using any of these as a reference for what a good audit looks like.

## Regenerating

These were rendered by `renderKickoffPackage` (`src/lib/kickoff/packaging.ts`)
from completed jobs. In the app the same document comes from
`GET /api/kickoff/:jobId/package.md` — approval required — or the
**DOWNLOAD CLIENT PACKAGE** button in the Deliver stage.
