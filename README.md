# Match Engine

> Motor de partidas por turnos, dirigido por una **máquina de estados** y **eventos asíncronos**.
> Proyecto de referencia (showcase backend) — diseñado para demostrar orquestación event-driven,
> concurrencia e idempotencia en un dominio que se disfruta construir.

[![CI](https://github.com/<usuario>/match-engine/actions/workflows/ci.yml/badge.svg)](./.github/workflows/ci.yml)

---

## Qué es esto (y qué NO es)

Esto **no es un producto**, es una **prueba de ingeniería**. El objetivo es que un hiring manager,
en ~60 segundos mirando el repo, concluya: _"esta persona construye backend de producción, bien hecho."_

Por dentro es exactamente la especialidad de un sistema de orquestación de órdenes
(máquina de estados + cola + eventos) — solo que el dominio es un motor de duelos por turnos,
que es más divertido de construir y demostrar.

## El dominio en una frase

Dos jugadores se unen a una partida. La partida avanza por turnos. Cada turno es un **comando**
que se valida y se procesa de forma **asíncrona** vía una cola. En cada cambio de estado se
**emite un evento**. La partida termina cuando se cumple la condición de victoria.

### Máquina de estados

```
            join (1)            join (2) / ready            move*            win condition
 CREATED ───────────► WAITING_PLAYERS ───────────► IN_PROGRESS ───────────► FINISHED
    │                       │                            │
    └───────────────────────┴──────── cancel ───────────┴──────────► CANCELLED
```

| Estado            | Significado                              | Transiciones válidas             |
| ----------------- | ---------------------------------------- | -------------------------------- |
| `CREATED`         | Partida creada, sin jugadores            | → `WAITING_PLAYERS`, `CANCELLED` |
| `WAITING_PLAYERS` | Esperando que se una el 2º jugador       | → `IN_PROGRESS`, `CANCELLED`     |
| `IN_PROGRESS`     | Partida en curso, se procesan turnos     | → `FINISHED`, `CANCELLED`        |
| `FINISHED`        | Partida terminada (hay ganador o empate) | (terminal)                       |
| `CANCELLED`       | Partida abortada                         | (terminal)                       |

> Regla de oro: **toda transición de estado vive en el dominio** (`MatchStatus` / `Match`),
> nunca en el controller ni en el repositorio. Si una transición es inválida, el dominio lanza error.

## Los dos retos "senior" (el oro de este repo)

Estos son los dos problemas que separan a un junior de un senior. Resuélvelos y **sé capaz de
explicarlos en una pizarra** — son tu mejor material de entrevista.

1. **Concurrencia** — dos jugadores pueden actuar "a la vez". El sistema debe serializar los
   turnos de forma consistente (un solo turno se aplica a la vez por partida) sin perder jugadas.
   _Pista de diseño:_ la cola procesa los turnos de una partida en orden; el estado se protege
   con bloqueo optimista (versión) o una clave de partición por `matchId`.

2. **Idempotencia** — un cliente puede reenviar la misma jugada (timeout + retry). La misma
   jugada no debe aplicarse dos veces. _Pista de diseño:_ cada `submit-move` lleva un
   `clientMoveId` (UUID del cliente); el sistema rechaza/ignora duplicados.

## Arquitectura

Arquitectura **hexagonal** (puertos y adaptadores). El núcleo de dominio no conoce NestJS,
ni la base de datos, ni la cola: solo expone **puertos** (interfaces) que la infraestructura implementa.

```
            ┌─────────────────────── infrastructure (adaptadores) ───────────────────────┐
            │                                                                              │
  HTTP ───► matches.controller ──► [application: use cases] ──► [domain: Match, eventos]   │
            │                              │            ▲              │                    │
            │                              ▼            │ (puerto)     ▼ (puerto)           │
            │                    MatchRepository◄───────┘      EventPublisher               │
            │                       (TypeORM)                  (cola / bus)                 │
            │                              ▲                          │                     │
            │                              │                          ▼                     │
            │                          PostgreSQL                 turn.processor (worker)   │
            └──────────────────────────────────────────────────────────────────────────────┘
```

Ver decisiones detalladas en [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

### Capas

| Capa               | Carpeta                      | Conoce a...               | NO conoce a...           |
| ------------------ | ---------------------------- | ------------------------- | ------------------------ |
| **Domain**         | `src/matches/domain`         | nada externo (puro TS)    | NestJS, DB, cola         |
| **Application**    | `src/matches/application`    | domain + puertos          | DB, HTTP, cola concretos |
| **Infrastructure** | `src/matches/infrastructure` | todo (implementa puertos) | —                        |

## Stack

- **NestJS** + **TypeScript** — framework modular, hexagonal-friendly, Swagger integrado.
- **PostgreSQL** + **TypeORM** — persistencia (con bloqueo optimista por `version`).
- **Cola** — `BullMQ` (Redis) en local; el puerto permite cambiar a SQS sin tocar el dominio.
- **Swagger / OpenAPI** — documentación automática en `/docs`.
- **Jest** — tests unitarios (dominio) + e2e (API).
- **Docker** — todo levanta con un comando.
- **GitHub Actions** — lint + test + build en cada push.

## Cómo correrlo

```bash
# 1. Variables de entorno
cp .env.example .env

# 2. Levantar todo (API + Postgres + Redis) con Docker
docker compose up --build

# API:     http://localhost:3000
# Swagger: http://localhost:3000/docs
```

Modo desarrollo (sin Docker para la API):

```bash
npm install
docker compose up postgres redis -d   # solo dependencias
npm run start:dev
```

## Endpoints (Fase 1)

| Método | Ruta                 | Descripción                     |
| ------ | -------------------- | ------------------------------- |
| `POST` | `/matches`           | Crear partida                   |
| `POST` | `/matches/:id/join`  | Unirse a una partida            |
| `POST` | `/matches/:id/moves` | Enviar una jugada (idempotente) |
| `GET`  | `/matches/:id`       | Consultar estado de la partida  |
| `GET`  | `/health`            | Healthcheck                     |

## Roadmap por fases

- [ ] **Fase 1 — pineable** _(este scaffold)_: API REST + máquina de estados + DB + Swagger + Docker + README.
- [ ] **Fase 2 — async**: turnos vía cola (BullMQ), eventos de dominio, idempotencia con `clientMoveId`.
- [ ] **Fase 3 — deploy**: CI/CD a una URL en vivo (Railway / Fly.io / AWS), bloqueo optimista, dead-letter.

## Reglas del juego (para mí)

- La IA teclea; **yo** decido la arquitectura y entiendo cada parte.
- Prueba ácida: ¿puedo dibujar este sistema en una pizarra y defender cada decisión? Si sí, es mío.
- Cada `TODO:` en el código es una pieza que yo resuelvo (es el "juego").

## Cómo usar este README con Claude Code

Este archivo es el **brief de arranque**. En tu máquina local:

```bash
mkdir match-engine && cd match-engine
# pega este README.md aquí
claude
```

Luego pídele a Claude Code algo como:
_"Lee el README.md y genera la Fase 1: scaffold NestJS hexagonal con la máquina de estados,
los endpoints, TypeORM + Postgres, Swagger en /docs, Dockerfile, docker-compose y GitHub Actions.
Deja la lógica de turnos y la cola como TODO para la Fase 2."_

Recuerda la regla: la IA teclea, **tú** decides la arquitectura y entiendes cada parte.
Antes de aceptar cada bloque, pregúntate si podrías defenderlo en una pizarra.
