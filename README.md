# Match Engine

> A turn-based match orchestration system built as a **system design showcase**.
> Demonstrates event-driven architecture, async processing, concurrency control, and reliability patterns
> in a Rock-Paper-Scissors domain.

[![CI](https://github.com/diegom20dev/event-driven-architecture-showcase/actions/workflows/ci.yml/badge.svg)](https://github.com/diegom20dev/event-driven-architecture-showcase/actions/workflows/ci.yml)

---

## Overview

Match Engine is a backend service that matches two players for a game of Rock-Paper-Scissors, queues their moves, processes them asynchronously, and resolves the outcome. Although the domain is intentionally simple, the engineering patterns underneath are production-grade: the system is designed to handle concurrent move submissions, network retries, and duplicate requests without corrupting match state.

The goal is to demonstrate how a set of well-chosen patterns — async messaging, optimistic locking, idempotency keys, and real-time events — interact to produce a reliable system under concurrency.

---

## Architecture

Hexagonal architecture (ports and adapters). The domain core has no knowledge of NestJS, databases, or queues — it only exposes **ports** (interfaces) that the infrastructure layer implements.

```
            ┌──────────────────────── infrastructure (adapters) ────────────────────────┐
            │                                                                             │
  HTTP ───► matches.controller ──► [application: use cases] ──► [domain: Match]          │
            │                              │            ▲              │                  │
            │                              ▼            │ (port)       ▼ (port)           │
            │                    MatchRepository ◄──────┘      EventPublisher             │
            │                       (TypeORM)                  (BullMQ / SSE hub)         │
            │                              ▲                          │                   │
            │                              │                          ▼                   │
            │                          PostgreSQL               turn.processor (worker)   │
            └─────────────────────────────────────────────────────────────────────────────┘
```

| Layer              | Folder                       | Knows about               | Does NOT know about       |
|--------------------|------------------------------|---------------------------|---------------------------|
| **Domain**         | `src/matches/domain`         | nothing external (pure TS)| NestJS, DB, queue         |
| **Application**    | `src/matches/application`    | domain + ports            | concrete DB, HTTP, queue  |
| **Infrastructure** | `src/matches/infrastructure` | everything (implements ports) | —                    |

---

## Game Flow & State Machine

```
           join (1st)          join (2nd)              win condition
CREATED ────────────► WAITING_PLAYERS ────────────► IN_PROGRESS ────────────► FINISHED
   │                        │                             │
   └────────────────────────┴──────── cancel ─────────────┴──────────────► CANCELLED
```

| State               | Meaning                                        | Valid transitions                |
|---------------------|------------------------------------------------|----------------------------------|
| `CREATED`           | Match created, no players yet                  | → `WAITING_PLAYERS`, `CANCELLED` |
| `WAITING_PLAYERS`   | Waiting for the second player to join          | → `IN_PROGRESS`, `CANCELLED`     |
| `IN_PROGRESS`       | Match active, moves are being processed        | → `FINISHED`, `CANCELLED`        |
| `FINISHED`          | Match resolved (winner determined)             | terminal                         |
| `CANCELLED`         | Match aborted                                  | terminal                         |

**Step-by-step flow:**

1. A match is created (`POST /api/matches`) → state: `CREATED`
2. First player joins with their `playerId` → state: `WAITING_PLAYERS`
3. Second player joins → state: `IN_PROGRESS`
4. Player 1 submits their throw (`ROCK`, `PAPER`, or `SCISSORS`) with a `clientMoveId`
5. Player 2 submits their throw
6. The worker processes both moves, resolves the round using RPS rules, and transitions the match to `FINISHED`

> All state transitions are enforced exclusively inside the domain aggregate (`Match`). No controller or repository decides transitions — if a transition is invalid, the domain throws.

---

## Engineering Patterns

### Event-Driven Architecture — BullMQ + Redis

When a player submits a move, the HTTP handler does not process it inline. Instead, it:

1. Inserts the move record as `PENDING` in Postgres
2. Publishes a `match.move_received` event
3. The BullMQ adapter routes that event to the `turns` queue as a job
4. Returns `202 ACCEPTED` to the client immediately

The `turn.processor` worker dequeues the job and applies the game logic:
- If only one player has moved → store the choice and wait
- If both players have moved → compare with RPS rules, update scores, and transition to `FINISHED` if someone reaches `pointsToWin`

This decouples HTTP response time from game processing and makes the system horizontally scalable.

---

### Resilience — BullMQ Retries

The worker is configured with automatic retries and exponential backoff:

```
attempts: 3, backoff: { type: 'exponential', delay: 1000 }
```

If a job fails (e.g. a transient DB error), BullMQ retries it automatically. The move record stays `PENDING` during retries. Once all attempts are exhausted, the `onFailed` hook transitions the move to `FAILED` — giving the client a terminal, observable state rather than leaving it stuck as `PENDING` forever.

---

### Concurrency Control — Optimistic Locking

Two moves from different players can arrive simultaneously and be dequeued by different worker instances at the same time. Without coordination, one worker could overwrite the other's update, making it look like only one move was registered.

The match aggregate has a `version` column. Every update uses a Compare-And-Swap:

```sql
UPDATE matches
SET scores = ..., choices = ..., version = version + 1
WHERE id = :id AND version = :expected
```

If `affected = 0`, another writer modified the row first → `OptimisticLockError` is thrown → BullMQ retries the job on fresh state. No transactions. No blocking locks. The losing worker simply retries.

The same pattern is applied to the `moves` table via TypeORM's `@VersionColumn`.

---

### Reliability — Idempotency

In real-world conditions (mobile clients, unstable connections), a player may submit the same move more than once due to a timeout and retry. Processing the same move twice would corrupt the match.

Each move submission includes a `clientMoveId` (a UUID generated by the client). The server:

1. **Fast-path check**: looks up `(matchId, clientMoveId)` before doing anything — if it already exists, returns the current status immediately without re-enqueuing
2. **DB-level guard**: `UNIQUE(match_id, client_move_id)` with `INSERT ... ON CONFLICT DO NOTHING` prevents race conditions between concurrent inserts
3. **Worker-level guard**: the job uses a deterministic `jobId = matchId_clientMoveId` — BullMQ silently ignores duplicate `add()` calls with the same jobId

The client can safely retry with the same `clientMoveId` and will always get a consistent response.

---

### Real-Time Communication — Server-Sent Events (SSE)

Clients can subscribe to a match event stream via `GET /api/matches/:id/events` (SSE). The following domain events are pushed in real time:

| Event                | Trigger                                          |
|----------------------|--------------------------------------------------|
| `match.started`      | Both players have joined and the match starts    |
| `match.move_received`| A move submission was accepted and enqueued      |
| `match.move_applied` | The worker processed a move                      |
| `match.finished`     | The match has a winner                           |

The in-process `MatchEventsHub` (RxJS `Subject`) acts as the event bus. The worker and the HTTP server share the same process, so events published by the worker reach SSE clients without any additional infrastructure.

> **Note:** In a multi-instance deployment the Subject would need to be replaced with Redis pub/sub so that worker events reach the HTTP instance holding the SSE connection.

---

## Tech Stack

| Technology         | Role                                                              |
|--------------------|-------------------------------------------------------------------|
| **NestJS**         | Framework — modular, DI-friendly, Swagger built-in               |
| **TypeScript**     | Type safety across all layers                                     |
| **PostgreSQL**     | Persistence — matches and moves with optimistic locking           |
| **TypeORM**        | ORM — migrations, `@VersionColumn`, QueryBuilder for CAS updates  |
| **BullMQ**         | Job queue — async turn processing with retries and backoff        |
| **Redis**          | BullMQ backend — job storage and queue state                      |
| **RxJS**           | In-process SSE event bus (`Subject` + `Observable`)               |
| **Jest**           | Unit tests (domain) + integration + e2e                          |
| **Docker Compose** | One-command local environment (API + Postgres + Redis)            |
| **GitHub Actions** | CI — lint, type-check, test, build on every push                 |

---

## API Endpoints

All routes are prefixed with `/api`.

| Method | Route                              | Description                                       |
|--------|------------------------------------|---------------------------------------------------|
| `POST` | `/api/matches`                     | Create a match                                    |
| `POST` | `/api/matches/:id/join`            | Join a match                                      |
| `POST` | `/api/matches/:id/moves`           | Submit a move (async, idempotent via clientMoveId)|
| `GET`  | `/api/matches/:id/moves/:clientMoveId` | Poll move status / result                    |
| `GET`  | `/api/matches/:id`                 | Get match state                                   |
| `GET`  | `/api/matches/:id/events`          | SSE stream of match events                        |
| `GET`  | `/health`                          | Health check                                      |

Interactive docs: **`http://localhost:3000/docs`** (Swagger UI)

---

## Running Locally

```bash
# 1. Copy environment variables
cp .env.example .env

# 2. Start everything (API + Postgres + Redis) with Docker
docker compose up --build

# API:     http://localhost:3000/api
# Swagger: http://localhost:3000/docs
```

**Development mode** (hot reload, no Docker for the API):

```bash
npm install
docker compose up postgres redis -d   # dependencies only
npm run start:dev
```

**Run tests:**

```bash
npm test          # unit tests
npm run test:e2e  # end-to-end (requires running Postgres + Redis)
```

---

## Project Structure

```
src/
├── matches/
│   ├── domain/                  # Pure domain — no framework dependencies
│   │   ├── match.ts             # Root aggregate + state machine
│   │   ├── match-status.ts      # State enum + transition graph
│   │   ├── rps.ts               # RPS logic (resolveRps, isMove)
│   │   └── errors.ts            # Domain errors (mapped to HTTP by filter)
│   ├── application/
│   │   ├── ports/               # Interfaces (MatchRepository, EventPublisher…)
│   │   └── use-cases/           # CreateMatch, JoinMatch, SubmitMove, ProcessTurn…
│   └── infrastructure/
│       ├── http/                # Controller, DTOs, DomainExceptionFilter
│       ├── messaging/           # BullMQ publisher, TurnProcessor worker, SSE hub
│       └── persistence/         # TypeORM entities, repositories, mapper
├── migrations/                  # TypeORM migration files
└── config/                      # TypeORM data source configuration
```
