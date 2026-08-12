# Blast-radius tiers

**AIL — task A1.** The contract A2, A4 and A5 implement against.

Ceremony in this product is currently allocated by how recently someone thought about a
component, not by consequence: deleting a *process configuration row* opens a modal, while
deleting a live custom domain — which takes a site off the internet — does not. This document
fixes the allocation so implementers stop making the call case by case.

---

## The three tiers

| Tier | Test | Treatment |
|---|---|---|
| **Reversible** | Repeating or inverting the action restores the previous state. Nothing is lost. | No ceremony. Optimistic update, toast on failure. |
| **Disruptive** | Service stops, breaks, or changes for real users — but the thing can be recreated from configuration the user still has. | `ConfirmModal` naming **the specific object** and stating **the consequence**, not the action. |
| **Destructive** | Data does not come back, or the write is visible outside this product. | `ConfirmModal` as above, plus the confirm label names the loss. Typed acknowledgement where the object is unique and unrecoverable. Undo in the success toast wherever the API supports restore. |

Two rules that decide the edge cases:

1. **Recreatable ≠ reversible.** A domain can be re-added, so it is disruptive rather than
   destructive — but traffic stops in the meantime, so it is not reversible either.
2. **Outward-facing writes are always destructive**, regardless of how easy they are to undo
   inside Dockier. A pull request opened on a team's repository, or review comments posted on a
   colleague's PR, cannot be un-sent from here.

Copy rule for every tier above reversible: **state the consequence, not the action.**
"Delete `api.acme.com`? Traffic to this domain stops immediately." — not "Are you sure?"

---

## Assignment

Every mutating action on the Project Detail surface.

### Destructive

| Action | Location | Consequence | Today |
|---|---|---|---|
| Clear production log | `ProjectObserveTab.tsx:319` | Destroys the only forensic record of a failed deploy | **none** |
| Delete project | `settings/GeneralSection.tsx` | Project and all history removed | typed name ✓ |
| Fix with AI | `ProjectDetail.tsx:64-78` | Opens a real pull request on the user's repository | **none** (epic E) |
| Review with AI | `ProjectDetail.tsx:83-94` | Posts comments publicly on a teammate's PR | **none** (epic E) |
| Run shell command *(matching a destructive pattern)* | `ProjectCommandsTab.tsx:232-249` | Arbitrary irreversible change on the production server | **none** |

### Disruptive

| Action | Location | Consequence | Today |
|---|---|---|---|
| Delete custom domain | `ProjectDomainsTab.tsx:48` | Traffic to the domain stops immediately | **none** |
| Delete SSL certificate | `ProjectDomainsTab.tsx:349` | HTTPS fails for the covered domains | **none** |
| Delete security rule | `ProjectNetworkTab.tsx:44` | Firewall posture changes; may expose or block traffic | **none** |
| Delete credential | `ProjectNetworkTab.tsx:217` | Integrations using it start failing | **none** |
| Delete redirect rule | `ProjectNetworkTab.tsx:561` | Existing links start 404ing | **none** |
| Delete heartbeat | `ProjectObserveTab.tsx:105` | Monitoring stops silently — failures go unnoticed | **none** |
| Delete command record | `ProjectCommandsTab.tsx:186` | Audit history for that run is lost | **none** |
| Delete background process | `ProjectProcessesTab.tsx:212` | Process stops running | modal ✓ |
| Delete scheduled job | `ProjectProcessesTab.tsx:339` | Job stops firing | modal ✓ |
| Tear down infrastructure | `settings/GeneralSection.tsx` | App goes offline until redeployed | modal ✓ |
| Run shell command *(ordinary)* | `ProjectCommandsTab.tsx:232-249` | Runs on production as `dockier` | **none** |

### Reversible — no ceremony

Start / stop / restart a process · toggle any setting · edit the project name · switch branch ·
copy an ID · re-run a command · refresh a panel.

---

## Destructive command patterns

`ProjectCommandsTab` promotes an ordinary command to the destructive tier when the string
matches any of:

```
rm            drop            truncate        mkfs
> /           dd              chmod 777       :(){ :|:& };:
migrate:fresh  db:wipe        flush           prune -f
```

Match on word boundaries, case-insensitively. A false positive costs one extra click; a false
negative costs a production database.

---

## Why this ordering

The current allocation is exactly inverted at the top and bottom of the range. The single most
protected action on the surface — deleting a process configuration row — is recoverable in
under a minute from the form the user just filled in. The least protected include wiping the
log that would explain last night's failed deploy, and opening a pull request on a repository
the user shares with their team.

Reassurance is a budget. It is currently being spent on the wrong risks.
