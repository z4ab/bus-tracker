# Issue Dependency DAG

> Directed acyclic graph showing which issues block others.
> Spawn agents for all root-level issues in parallel, then proceed downstream.

## Visual DAG

```mermaid
graph TD
  %% ── Root level (no dependencies – can start immediately) ──
  subgraph TIER0["Tier 0 — Start in parallel"]
    I4["#4 Split MapView.tsx"]
    I5["#5 Enrich vehicles API"]
    I11["#11 Bus vs LRT markers"]
    I12["#12 Persist GTFS to disk"]
    I15["#15 Rework vehicle arrivals endpoint"]
    I16["#16 CI linting & formatting"]
    I17["#17 Create AGENTS.md"]
    I18["#18 Remove hardcoded CORS origins"]
    I21["#21 Create .env.example"]
    I23["#23 TS path aliases"]
    I24["#24 Architecture doc"]
    I25["#25 Clean up useVehicleArrivals"]
    I26["#26 Evict icon caches"]
    I27["#27 Support gzip GTFS feeds"]
    I28["#28 Add version info"]
    I29["#29 Docker healthchecks"]
    I30["#30 Vehicle heading arrows"]
    I32["#32 Refactor cache layer"]
    I33["#33 OpenAPI tags & models"]
  end

  %% ── Tier 1 – depend on Tier 0 items ──
  subgraph TIER1["Tier 1 — after Tier 0"]
    I3["#3 Show all vehicles on map"]
    I6["#6 Loading skeletons"]
    I7["#7 Debounce stop refresh on pan"]
    I8["#8 Handle stale GTFS feeds"]
    I9["#9 Route browser tab"]
    I10["#10 Keyboard shortcuts"]
    I13["#13 Predicted + scheduled departures"]
    I19["#19 Animate map transitions"]
    I20["#20 Add refresh-now button"]
    I22["#22 Add frontend tests"]
    I31["#31 Trip progress indicator"]
  end

  %% ── Edges (A ──> B  means "A must be done before B") ──
  I5  ──> I3
  I4  ──> I6
  I4  ──> I7
  I4  ──> I9
  I4  ──> I10
  I4  ──> I19
  I4  ──> I22
  I4  ──> I31
  I5  ──> I8
  I12 ──> I13
  I5  ──> I20
  I4  ──> I3
```

## Text breakdown for agent dispatch

### Tier 0 — No dependencies (19 issues)

Spawn one agent per issue, all in parallel. Each agent gets the full ISSUES.md context.

| # | Title | Area | Agent |
|---|-------|------|-------|
| 4 | Split MapView.tsx into smaller components | frontend | `agent-frontend-structural` |
| 5 | Enrich vehicles API with route metadata | backend | `agent-backend-api` |
| 11 | Visually distinguish bus vs LRT markers | frontend | `agent-frontend-ui` |
| 12 | Persist GTFS static data to disk / SQLite | backend | `agent-backend-data` |
| 15 | Rework per-vehicle arrivals endpoint | backend | `agent-backend-cleanup` |
| 16 | Set up CI linting & formatting | devops | `agent-devops-ci` |
| 17 | Create AGENTS.md with project conventions | docs | `agent-docs-agents` |
| 18 | Remove hardcoded CORS origins | backend | `agent-backend-cleanup` |
| 21 | Create .env.example file | docs | `agent-docs-env` |
| 23 | Add TypeScript path aliases (@/) | frontend | `agent-frontend-config` |
| 24 | Document data flow in architecture doc | docs | `agent-docs-arch` |
| 25 | Clean up unused useVehicleArrivals hook | frontend | `agent-frontend-cleanup` |
| 26 | Evict stale entries from marker icon caches | frontend | `agent-frontend-perf` |
| 27 | Support gzip-encoded GTFS feeds | backend | `agent-backend-robustness` |
| 28 | Add version / release information | both | `agent-cross-version` |
| 29 | Add Docker healthchecks | devops | `agent-devops-docker` |
| 30 | Plot vehicle heading arrows | frontend | `agent-frontend-map` |
| 32 | Refactor cache layer to separate concerns | backend | `agent-backend-refactor` |
| 33 | Add OpenAPI tags & response models | backend | `agent-backend-docs` |

### Tier 1 — After Tier 0 completes

These can start once their upstream dependencies are done.

| # | Title | Blocks on | Area | Agent |
|---|-------|-----------|------|-------|
| 3 | Show all vehicles on map | #4, #5 | frontend | `agent-frontend-map` |
| 6 | Loading skeletons | #4 | frontend | `agent-frontend-ui` |
| 7 | Debounce stop refresh on pan | #4 | frontend | `agent-frontend-perf` |
| 8 | Handle stale GTFS feeds | #5 | both | `agent-cross-staleness` |
| 9 | Route browser tab | #4 | frontend | `agent-frontend-ui` |
| 10 | Keyboard shortcuts | #4 | frontend | `agent-frontend-ux` |
| 13 | Predicted + scheduled departures | #12 | backend | `agent-backend-data` |
| 19 | Animate map transitions | #4 | frontend | `agent-frontend-map` |
| 20 | Refresh-now button | #5 | both | `agent-cross-refresh` |
| 22 | Frontend tests | #4 | testing | `agent-testing-frontend` |
| 31 | Trip progress indicator | #4 | frontend | `agent-frontend-map` |

## Workflow

```
             Tier 0 (parallel, 19 agents)
    ┌──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐
    │4 │5 │11│12│15│16│17│18│21│23│24│25│26│27│28│29│30│32│33│
    └──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘
       │  │              │                       │
       │  │              │                       └──────────────┐
       │  │              └───┐                                   │
       │  │                  │                                   │
       ▼  ▼                  ▼                                   ▼
    ┌──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐               ┌──────────┐
    │3 │6 │7 │8 │9 │10│13│19│20│22│31│               │ (done)   │
    └──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘               └──────────┘
             Tier 1 (parallel, 11 agents)
```

## Notes

- **#3 (show all vehicles)**: Blocks on both #4 (MapView split — without it the component
  would grow even more unwieldy) and #5 (enriched API — needs route colors in the
  vehicle response).
- **#8 (stale feeds)**: The backend part (adding staleness metadata to API responses)
  depends on #5's data-enrichment pattern. The frontend part (showing the banner)
  depends on both.
- **#13 (predicted+scheduled)**: Depends on #12 because querying static schedule
  data is impractical in-memory at scale. With SQLite persistence, joining real-time
  updates against the full stop_times.txt becomes trivial.
- **#22 (frontend tests)**: Much easier after #4 since isolated components are
  straightforward to test in isolation.
- Issues within the same tier have no dependencies on each other — they can be
  worked on in any order or simultaneously.
