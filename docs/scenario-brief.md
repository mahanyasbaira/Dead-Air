# Scenario brief

A brief is a short Markdown outline of a scenario: who is in it, what happens and when, and what each person decides. `parseBrief` reads it and `printBrief` writes it. Both are in the kit (`packages/hindsight/src/engine/brief.ts`).

## Format

```
# <title>
## Participants
- <id>: <name> - <blurb>
## Beats
- <time> | <audience> | <type> | <title> | <body>
## Decisions
### <participant id>: <prompt>
- <option id>: <label>
```

- `<time>` is a non-negative integer of simulated minutes.
- `<audience>` is a declared participant id, or `all`.
- `<type>` is one of `info`, `message_created`, `message_delivered`, `decision`, `debrief`.
- Each `###` line starts one decision for a declared participant. The `-` lines under it are its options.
- Blank lines are ignored. The three sections may be left out; the title may not.
- Every field is one line of text. Surrounding spaces are trimmed.
- A `|` inside a field is written `\|`, and a backslash is written `\\`.
- An id must not contain `: `, and a participant name must not contain ` - ` or end with ` -`.

## Errors

`parseBrief` never throws. It returns `{ ok: true, brief }` or `{ ok: false, errors }`, where each error is `{ line, message }` and `line` counts from 1. It reports every problem it finds, in line order.

## Worked example

```
# Quiet hours
## Participants
- ra: Sam - the assistant on duty
- neighbour: Kit - a student next door
## Beats
- 0 | all | info | Evening | The hall is calm
- 5 | ra | message_created | Text | Kit writes: too loud \| please come
- 9 | all | debrief | End | The night ends
## Decisions
### ra: Kit has texted. What do you do?
- knock: Knock on the door
- wait: Finish what you are doing first
```

This parses to a brief with a title, two participants, three beats (the second body reads `Kit writes: too loud | please come`) and one decision with two options. A real brief to compare against is `apps/night-desk/scenarios/briefs/example-noise-complaint.md`.
