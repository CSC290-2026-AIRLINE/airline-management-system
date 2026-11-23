# Reports & Analytics — API contract (F16)

The frontend for this feature lives in `apps/customer-web/src/features/reports-analytics/` and talks to three
endpoints under `/api/reports/*`. This document is the contract between the frontend and the backend team.

Everything here assumes the caller already sends `Authorization: Bearer <accessToken>` — the frontend wraps that
for you via `useAppAuth().fetchWithAuth` (`apps/customer-web/src/auth/AuthProvider.tsx`).

---

## 1. Where the frontend calls from

| Frontend file                   | Calls                                                  |
| ------------------------------- | ------------------------------------------------------ |
| `api/reports.ts`                | The three endpoint wrappers below                      |
| `api/fetch.ts`                  | `useFetchJson` — authed `fetch` + JSON + error shape   |
| `hooks/useReportsOverview.ts`   | The overview + session list, with the fixture fallback |
| `hooks/useSessionTranscript.ts` | One session's chat transcript                          |
| `types.ts`                      | The TypeScript shapes of every response below          |
| `fixtures.ts`                   | The design's own numbers, used until the API is up     |

TypeScript types are the fastest way to agree on the shapes: `types.ts` is written against these examples
field for field.

---

## 2. `GET /api/reports/overview`

The stat cards and the "Sessions per day" chart.

```
GET /api/reports/overview?period=30days
```

### Query parameters

| Name     | Type   | Required | Notes                                                                             |
| -------- | ------ | -------- | --------------------------------------------------------------------------------- |
| `period` | string | yes      | One of `today`, `7days`, `30days`, `3months`, `12months`. Unknown values → `400`. |

### Response

```json
{
  "period": "30days",
  "range": { "from": "2026-10-14", "to": "2026-11-12" },
  "updated_at": "2026-11-12T23:53:00Z",
  "stats": {
    "total_sessions": 1332,
    "total_sessions_delta_pct": 4.2,
    "avg_duration_seconds": 192,
    "questions_asked": 4795,
    "questions_per_session": 3.6,
    "unanswered": 144,
    "unanswered_pct": 3.0
  },
  "daily_sessions": [
    { "date": "2026-10-14", "sessions": 38 },
    { "date": "2026-10-15", "sessions": 41 }
  ]
}
```

| Field                            | Type           | Notes                                                                                                                    |
| -------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `period`                         | string         | Echoes the requested period.                                                                                             |
| `range.from` / `range.to`        | string         | ISO calendar dates (`YYYY-MM-DD`) — the first and last day in the window.                                                |
| `updated_at`                     | string         | ISO-8601 **UTC** (`2026-11-12T23:53:00Z`). When the numbers were last computed.                                          |
| `stats.total_sessions`           | number         | Sessions in the window.                                                                                                  |
| `stats.total_sessions_delta_pct` | number \| null | Change against the previous window of the same length, as a percentage. `null` when there is nothing to compare against. |
| `stats.avg_duration_seconds`     | number \| null | Mean length of a **completed** session, in seconds. `null` when no session completed.                                    |
| `stats.questions_asked`          | number         | Questions asked in the window.                                                                                           |
| `stats.questions_per_session`    | number \| null | `null` when there are no sessions.                                                                                       |
| `stats.unanswered`               | number         | Questions with no recorded robot answer.                                                                                 |
| `stats.unanswered_pct`           | number \| null | `null` when there are no questions.                                                                                      |
| `daily_sessions[].date`          | string         | ISO calendar date.                                                                                                       |
| `daily_sessions[].sessions`      | number         | Sessions started that day.                                                                                               |

**Send numbers, not formatted strings.** The frontend formats them (`Intl.NumberFormat`, `Intl.DateTimeFormat`,
and the `format.ts` helpers) so a copy or locale change is a frontend-only edit.

**Send every day in the window**, including days with zero sessions — the chart draws a bar per point and
reads its own x-axis labels from `date`.

**Timestamps are UTC.** The frontend formats them with `timeZone: 'UTC'` so the numbers match the simulation
clock in the design regardless of the browser's timezone. Send `Z`-suffixed timestamps.

### Errors

| Status | When                                               |
| ------ | -------------------------------------------------- |
| `400`  | `period` is missing or not one of the five values. |
| `401`  | No or expired access token.                        |
| `500`  | Anything unexpected.                               |

---

## 3. `GET /api/reports/sessions`

The "Session Logs" table.

```
GET /api/reports/sessions?limit=7
```

### Query parameters

| Name    | Type   | Required | Notes                                                                        |
| ------- | ------ | -------- | ---------------------------------------------------------------------------- |
| `limit` | number | no       | How many rows to return. The frontend asks for `7`. Default `50`, max `200`. |

### Response

```json
{
  "total": 1332,
  "items": [
    {
      "id": "9f3c…",
      "session_no": 1332,
      "started_at": "2026-11-12T23:41:00Z",
      "ended_at": null,
      "duration_seconds": null,
      "questions": 2,
      "unanswered": 0,
      "status": "in_progress"
    },
    {
      "id": "1a77…",
      "session_no": 1331,
      "started_at": "2026-11-12T23:12:00Z",
      "ended_at": "2026-11-12T23:16:00Z",
      "duration_seconds": 245,
      "questions": 5,
      "unanswered": 1,
      "status": "completed"
    }
  ]
}
```

| Field                      | Type           | Notes                                                               |
| -------------------------- | -------------- | ------------------------------------------------------------------- |
| `total`                    | number         | How many sessions match the query, not just the returned page.      |
| `items[].id`               | string         | Opaque session id — the frontend passes it back for the transcript. |
| `items[].session_no`       | number         | Display number. The frontend shows `#1332`.                         |
| `items[].started_at`       | string         | ISO-8601 UTC.                                                       |
| `items[].ended_at`         | string \| null | `null` while the session is still running.                          |
| `items[].duration_seconds` | number \| null | Wall-clock length. `null` while the session is still running.       |
| `items[].questions`        | number         | How many questions the passenger asked.                             |
| `items[].unanswered`       | number         | How many of those questions have no recorded robot answer.          |
| `items[].status`           | string         | `completed` or `in_progress`.                                       |

**Newest first.** The frontend shows the first seven rows and labels the summary "Latest 7 of 1,332".

**A running session has `ended_at: null`, `duration_seconds: null` and `status: "in_progress"`** — the frontend
renders the em dash and the amber status dot for it.

---

## 4. `GET /api/reports/sessions/:id`

The chat transcript behind the "view chat" button on a row.

```
GET /api/reports/sessions/9f3c…
```

### Response

```json
{
  "id": "9f3c…",
  "session_no": 1331,
  "started_at": "2026-11-12T23:12:00Z",
  "ended_at": "2026-11-12T23:16:00Z",
  "duration_seconds": 245,
  "questions": 5,
  "unanswered": 1,
  "turns": [
    { "order": 1, "role": "passenger", "text": "Where is gate B12?" },
    { "order": 2, "role": "robot", "text": "Gate B12 is in Concourse B…" },
    { "order": 4, "role": "robot", "text": null }
  ]
}
```

| Field           | Type           | Notes                                                                                               |
| --------------- | -------------- | --------------------------------------------------------------------------------------------------- |
| `turns[].order` | number         | Position in the transcript, starting at 1. Gaps are fine — an unanswered question still has a turn. |
| `turns[].role`  | string         | `passenger` or `robot`.                                                                             |
| `turns[].text`  | string \| null | `null` for a robot turn with **no answer recorded** — the frontend draws the dashed bubble.         |

The modal puts passenger turns on the right and robot turns on the left, in `order`.

### Errors

| Status | When                        |
| ------ | --------------------------- |
| `404`  | No session with that id.    |
| `401`  | No or expired access token. |

---

## 5. What the frontend does while the API is not up

`hooks/useReportsOverview.ts` and `hooks/useSessionTranscript.ts` fall back to `fixtures.ts` — the design's own
numbers — when a request fails, and show a "Demo data — the reports API is not reachable" pill with a **Retry**
button in the period toolbar. Nothing else about the screen changes: the fixture goes through the same
formatting code as a real response, so the screen looks identical either way.

**When the endpoints are live, delete `fixtures.ts` and the `source: 'fixture'` branch in the two hooks.**
The pill disappears as soon as a request succeeds.

---

## 6. Order to build in

1. `GET /api/reports/overview` — the page is mostly this one call.
2. `GET /api/reports/sessions` — the table under the chart.
3. `GET /api/reports/sessions/:id` — the transcript modal.

Each one is independent: the screen renders the rest of it while a later endpoint is still missing.
