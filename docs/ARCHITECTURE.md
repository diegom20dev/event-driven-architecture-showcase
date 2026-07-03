# Arquitectura

Decisiones de diseño del Match Engine. El objetivo: que cada pieza sea defendible
"en una pizarra".

## 1. Hexagonal (puertos y adaptadores)

El núcleo (dominio + aplicación) no conoce NestJS, Postgres ni la cola. Depende solo
de **puertos** (interfaces). La infraestructura implementa esos puertos. Beneficio
concreto: cambiar Postgres→otra DB, o `LoggingEventPublisher`→BullMQ, se hace en
`matches.module.ts` (un `useClass`) sin tocar dominio ni casos de uso.

```
HTTP ─► MatchesController ─► UseCase ─► Domain (Match, máquina de estados)
                               │  ▲          │
                      (puerto) ▼  │ (puerto) ▼ (puerto)
                    MatchRepository  EventPublisher
                       (TypeORM)      (log → BullMQ en Fase 2)
                          │                 │
                       Postgres         turn.processor (Fase 2)
```

### Capas y dependencias

| Capa           | Carpeta                      | Depende de        | Prohibido importar         |
| -------------- | ---------------------------- | ----------------- | -------------------------- |
| Domain         | `src/matches/domain`         | nada              | NestJS, TypeORM, cola      |
| Application    | `src/matches/application`    | domain + puertos  | adaptadores concretos      |
| Infrastructure | `src/matches/infrastructure` | todo              | —                          |

La regla se sostiene por la **dirección de los imports**: el dominio nunca importa
hacia afuera. Si un import rompe esa dirección, rompe la arquitectura.

## 2. Máquina de estados en el dominio

`Match` es el agregado raíz. Toda transición pasa por un método de negocio (`join`,
`cancel`, `assertCanSubmitMove`) que valida contra `MATCH_TRANSITIONS` **antes** de
mutar. Una transición inválida lanza un `DomainError`; nunca deja el agregado en un
estado inconsistente.

```
            join(1)            join(2)             win
 CREATED ──────────► WAITING_PLAYERS ──────► IN_PROGRESS ──────► FINISHED
    └───────────────────┴────────── cancel ──────┴───────────► CANCELLED
```

El estado no se muta desde el controller ni el repositorio: el repositorio solo
**rehidrata** (`Match.rehydrate`) y **persiste** (`toSnapshot`).

## 3. Errores de dominio → HTTP

Los errores de dominio son puros (`MatchNotFoundError`, `InvalidTransitionError`, …).
`DomainExceptionFilter` los traduce a códigos HTTP (404 / 409). Así la semántica de
negocio vive en el dominio y la traducción HTTP en la frontera.

## 4. Persistencia

- TypeORM + Postgres. `MatchOrmEntity` es el modelo de tabla; `MatchMapper` traduce
  entre tabla y agregado.
- `players` se guarda como `jsonb`; `version` es un contador (base para el bloqueo
  optimista de la Fase 3).
- Fase 1 usa `synchronize: true` para arrancar sin fricción. Fase 3 lo cambia por
  migraciones.

## 5. Lo que queda para la Fase 2 (los retos "senior")

Marcado como `TODO(Fase 2)` / `TODO(Fase 3)` en el código:

- **Concurrencia** — los turnos de una partida se procesan **en serie** vía cola
  (BullMQ), con clave de partición por `matchId`. Persistencia con **bloqueo
  optimista** (`version`) y reintento ante conflicto.
- **Idempotencia** — `submit-move` lleva `clientMoveId` (UUID del cliente). El worker
  ignora duplicados, de modo que un reintento por timeout no aplica la jugada dos veces.
- **Eventos** — `EventPublisher` pasa de log a publicar en la cola; `turn.processor`
  consume, aplica la jugada, evalúa la condición de victoria (`IN_PROGRESS → FINISHED`)
  y emite `match.finished`.

El puerto ya existe (`EventPublisher`), así que la Fase 2 cambia adaptadores, no el
dominio.
