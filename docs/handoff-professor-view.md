# Professor view (#/host): handoff

One file for the Professor view team's agents. It merges the original handoff, Dan's points demo, and the Q&A and summary spec. Read it, then `AGENTS.md`, `BLOCKS.md`, `docs/contracts.md`, and `src/teams/host/TEAM.md`. If this file and `TEAM.md` disagree, `TEAM.md` wins.

**Scope now:** the professor's screen only, on seeded data. No student UI. No microphone, recordings, or textbook yet.

## Principle

The professor approves everything students see. The AI sorts, drafts, and summarizes. It never shares anything on its own.

## The screen

A header that never moves (slide title, checked in, lost on this slide) and three tabs.

| Tab | What the professor does |
|---|---|
| **Now** | **Ask the room**: AI drafts a question from the slide, or write your own, then open and close it and watch the answer bars. **Who is missing it**: who got it wrong, plus an AI note on what to re-explain. |
| **Points** | **Teams** (red, yellow, blue): points today and total, **End day**, **Mix the teams**. **Students**: ranked by total, filter by team, **-1 / -5** buttons. |
| **Questions** | Questions students asked. Toggle **Group by topic with AI**. Per question: keep, type an answer, share with students, dismiss. |

Not built yet, shown as a placeholder: voice answers, recordings, textbook import and matches, the student-facing summary.

## Points

- A correct answer is worth 10, plus up to 5 for answering fast (`convex/host/answers.ts`). Placeholders; the professor may change them.
- Deductions and bonuses are `pointEvents` rows with a reason, so every change can be seen and undone. A student's total is their answers plus these events.
- **Today** counts from the room's `dayStart`. **End day**: the team with the most points today gives each student +1 extra credit, the day resets, and everyone is mixed into new teams. A tie awards nothing.
- Teams are red, yellow, blue. A student's team is worked out from their user key and the room's salt (`teamOf`), never stored, so **Mix the teams** regroups everyone. Dan's demo said Red/Green/Blue; the room chose yellow.

## Student questions

- A student asks a question as **public** or **private**. Private ones are seen by the professor only and can never be shared.
- **Group by topic** sends only the question text to Gemini, numbered, with no names. It returns a topic and a group label for questions that ask the same thing. The page ranks topics by how many questions they hold, and groups inside a topic by how often they were asked. Toggle it off to see the plain list.
- Answers are typed for now. An empty answer removes it. Voice answers (record, transcribe, attach) and "click a question to jump to its answer in the recording" come later and need the microphone, which `AGENTS.md` doesn't allow without a lead's approval and a `TEAM.md` note.
- **Share with students** sets `shared` on a public question. The student summary reads `api.host.qa.shared`, which returns only shared, public questions.

## Textbook (later)

The professor imports a book, the AI listens to the lecture and flags a matching topic, and the professor chooses to share pages or a topic summary. Shared items appear in the student summary. Needs the microphone and a store for the book. Ask the lead first.

## Where things are

| What | Where |
|---|---|
| Page and tabs | `src/teams/host/Page.tsx`, `AskRoom.tsx`, `Boards.tsx`, `QA.tsx`, `Team.tsx`, `host.css` |
| Tables | `// team: host` block in `convex/schema.ts`: `questions`, `answers`, `hostRooms`, `pointEvents`, `studentQuestions` |
| Questions and answers | `convex/host/questions.ts`, `answers.ts` |
| Scores and points | `convex/host/board.ts`, `points.ts`, `teams.ts` |
| Student questions | `convex/host/qa.ts` |
| AI | `convex/host/ai.ts`: `draftQuestion`, `feedback`, `organize` |
| Sample data | `convex/host/seed.ts` |

## What the Live team calls

The student side is not ours. When it is built, it calls:

- `api.host.questions.current({ channel })`: the open question, without the right answer
- `api.host.answers.submit({ questionId, choice })` and `api.host.answers.mine({ questionId })`
- `api.host.qa.ask({ channel, index, text, visibility })`
- `api.host.qa.shared({ channel })`
- `api.host.teams.mine({ channel })`: the signed-in student's team

## Sharing the app with the other teams

- **Sign-in:** the page uses Check-in's `ProfGate` and `useProfKey` (`src/teams/checkin/prof.tsx`). Every host-only function takes an optional `key` and calls `requireProf` (`convex/checkin/prof.ts`), so a Google host or the professor key both work. Pass `key` on every call.
- **Table names:** Live owns `questions` (student questions with upvotes). Ours is `quizQuestions`, the professor's quiz.
- **Still overlapping, to settle with the leads:** Live's `groups` (numbered teams of 3 or 4) and our red/yellow/blue teams; Live's `questions` and our `studentQuestions` (public or private, AI grouping, typed answers); Check-in's `polls` quiz and our quiz.

## Rules that matter

- Every host-only function starts with `requireHost(ctx)`. Hiding it in the page is not enough. Never take a user ID, email, or "isHost" as an argument.
- Every Convex function has `args` and `returns` validators. Queries use `withIndex`.
- Student names go to hosts only. Names never go to Gemini. Never commit real names; seed data is generic.
- Reuse blocks (`Screen`, `Card`, `Big`, `Status`, sign-in, `useDeckSlide`). Don't touch `src/blocks/`, `convex/lib.ts`, `src/index.css`, or other teams' folders.
- Copy on screen is short and literal, with numbers ("12 checked in", "3 lost").
- Never touch prod: no `npx convex deploy`, no `scripts/deploy.sh`, no env changes. Sam deploys `main`.

## Run it

```sh
npx convex dev
npm run dev
npx convex env set HOST_EMAILS "you@example.com"          # your Google account, so you count as a host
npx convex run host/seed:fill '{"channel":"gdg"}'          # 1 question, 12 answers, 6 student questions
npx convex run host/seed:clear '{"channel":"gdg"}'         # removes only the sample rows
```

The AI buttons also need `GEMINI_API_KEY` and `GEMINI_MODEL_FAST` on your dev backend. Without them, "Write my own" and everything else still work.

## Open questions

- Prepared question bank tied to slide indexes, or only written live?
- Point values: 10 per question and +1 extra credit are placeholders.
- Do teams reshuffle every day, or only when the professor taps Mix the teams?
