# Reports & Analytics — API contract (F16)

The frontend for this feature lives in `apps/customer-web/src/features/reports-analytics/` and talks to four
endpoints under `/api/reports/*`. This document is the contract between the frontend and the backend team.

Everything here assumes the caller already sends `Authorization: Bearer <accessToken>` — the frontend wraps that
for you via `useAppAuth().fetchWithAuth` (`apps/customer-web/src/auth/AuthProvider.tsx`).

---

## 1. Where the frontend calls from

| Frontend file                   | Calls                                                  |
| ------------------------------- | ------------------------------------------------------ |
| `api/reports.ts`                | The four endpoint wrappers below                       |
| `api/fetch.ts`                  | `useFetchJson` — authed `fetch` + JSON + error shape   |
| `hooks/useReportsOverview.ts`   | The overview + session list, with the fixture fallback |
| `hooks/usePagedList.ts`         | The page-at-a-time list both filtered screens use      |
| `hooks/useSessionHistory.ts`    | The Session History screen                             |
| `hooks/useQaLogs.ts`            | The All Q&A Logs screen                                |
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

The "Session Logs" table under the chart **and** the "Session History" screen — the same list, read one page at a
time and filtered.

```
GET /api/reports/sessions?limit=7
GET /api/reports/sessions?period=30days&status=completed&limit=12
GET /api/reports/sessions?search=1331&limit=12
GET /api/reports/sessions?limit=12&cursor=eyJpZCI6MTMyMSwidG9zIjoxMn0
```

### Query parameters

| Name     | Type   | Required | Notes                                                                                                     |
| -------- | ------ | -------- | --------------------------------------------------------------------------------------------------------- |
| `limit`  | number | no       | How many rows to return. The frontend asks for `7` (overview) or `12` (history). Default `50`, max `200`. |
| `cursor` | string | no       | The cursor of the page to read. Omit it for the first page.                                               |
| `search` | string | no       | Free text matched against the session id and the session number (`"1331"`).                               |
| `period` | string | no       | Same five values as the overview. Omit it for every period.                                               |
| `status` | string | no       | `completed` or `in_progress`. Omit it for both.                                                           |

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
  ],
  "next_cursor": "eyJpZCI6MTMyMSwidG9zIjoxMn0"
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
| `next_cursor`              | string \| null | Cursor for the next page, or `null` when this is the last page.     |

**Newest first**, sorted by start time. The overview shows the first seven rows and labels the summary
"Latest 7 of 1,332"; the Session History screen shows twelve and pages through the rest.

**A running session has `ended_at: null`, `duration_seconds: null` and `status: "in_progress"`** — the frontend
renders the em dash and the amber status dot for it.

**`total` counts what the filters match**, not what the page holds — that is what the frontend shows as
"Showing 1–12 of 1,332 sessions".

### Paging

Both filtered screens page with a cursor, never with an offset:

- The frontend sends `limit` and, from the second page on, the `next_cursor` of the page it is looking at.
- The backend answers with `next_cursor: null` on the last page — the frontend then greys out the "Next →" button.
- The cursor is opaque to the frontend: it is stored and sent back untouched. Any encoding works (base64 of
  `{"id": …, "sort": …}` is a good one).
- `total` and `next_cursor` describe the **filtered** list, so a filter change starts the list over.

### Errors

| Status | When                                                   |
| ------ | ------------------------------------------------------ |
| `400`  | `status` or `period` is not one of the allowed values. |
| `401`  | No or expired access token.                            |
| `500`  | Anything unexpected.                                   |

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

## 5. `GET /api/reports/qa-logs`

The "All Q&A Logs" screen: every question passengers asked and what the robot answered.

```
GET /api/reports/qa-logs?limit=9
GET /api/reports/qa-logs?answer=unanswered&limit=9
GET /api/reports/qa-logs?session_no=1331&limit=9
GET /api/reports/qa-logs?search=rail%20link&limit=9
GET /api/reports/qa-logs?limit=9&cursor=eyJvcmRlciI6MTJ9
```

### Query parameters

| Name         | Type   | Required | Notes                                                                        |
| ------------ | ------ | -------- | ---------------------------------------------------------------------------- |
| `limit`      | number | no       | How many rows to return. The frontend asks for `9`. Default `50`, max `200`. |
| `cursor`     | string | no       | The cursor of the page to read. Omit it for the first page.                  |
| `search`     | string | no       | Free text matched against the question and the answer.                       |
| `session_no` | number | no       | Restrict to one session, by its display number.                              |
| `answer`     | string | no       | `all`, `answered` or `unanswered`. Omit it for all of them.                  |

### Response

```json
{
  "total": 4795,
  "unanswered": 144,
  "items": [
    {
      "session_no": 1332,
      "order": "Q1",
      "question": "How do I get to the Airport Rail Link?",
      "answer": "Take the escalator down to level B1 and follow the Rail Link signs. Trains leave every 12 minutes.",
      "answered": true
    },
    {
      "session_no": 1332,
      "order": "Q2",
      "question": "What time does the last train leave tonight?",
      "answer": null,
      "answered": false
    }
  ],
  "next_cursor": "eyJvcmRlciI6MTJ9"
}
```

| Field                | Type           | Notes                                                                                 |
| -------------------- | -------------- | ------------------------------------------------------------------------------------- |
| `total`              | number         | How many questions match the query, not just the returned page.                       |
| `unanswered`         | number         | How many of the matching questions have no recorded answer.                           |
| `items[].session_no` | number         | Display number of the session the question was asked in — the frontend shows `#1332`. |
| `items[].order`      | string         | Position of the question inside its session, e.g. `"Q2"`.                             |
| `items[].question`   | string         | What the passenger asked.                                                             |
| `items[].answer`     | string \| null | The robot's answer. `null` when the question went unanswered.                         |
| `items[].answered`   | boolean        | `true` when the question has an answer.                                               |
| `next_cursor`        | string \| null | Cursor for the next page, or `null` when this is the last page.                       |

**Newest session first, then by order inside the session.** That is the order the design's table lists and the
order the frontend asks for.

**`answer: null` means the question went unanswered** — the frontend writes "No answer recorded" in the answer
cell, draws the amber dot and labels the row "Unanswered".

**Paging works like the sessions list** (see §3): the frontend sends the `next_cursor` it was given and greys
out "Next →" when the backend answers `null`.

### Errors

| Status | When                                                                      |
| ------ | ------------------------------------------------------------------------- |
| `400`  | `answer` is not one of the three values, or `session_no` is not a number. |
| `401`  | No or expired access token.                                               |
| `500`  | Anything unexpected.                                                      |

---

## 6. What the frontend does while the API is not up

`hooks/useReportsOverview.ts`, `hooks/useSessionTranscript.ts`, `hooks/useSessionHistory.ts` and
`hooks/useQaLogs.ts` fall back to `fixtures.ts` — the design's own numbers — when a request fails, and show a
"Demo data" pill with a **Retry** button. The overview shows it in the period toolbar, the two filtered screens
at the end of their filter row. Nothing else about the screen changes: the fixture goes through the same
formatting code as a real response, so the screen looks identical either way.

**When the endpoints are live, delete `fixtures.ts` and the `source: 'fixture'` branch in the four hooks.**
The pill disappears as soon as a request succeeds.

---

## 7. Order to build in

1. `GET /api/reports/overview` — the page is mostly this one call.
2. `GET /api/reports/sessions` — the table under the chart, and the Session History screen with it.
3. `GET /api/reports/sessions/:id` — the transcript modal.
4. `GET /api/reports/qa-logs` — the All Q&A Logs screen.

Each one is independent: the screen renders the rest of it while a later endpoint is still missing.
