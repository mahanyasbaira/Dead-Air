# Night Desk 6.3 screenshots

An agent in Chromium made these captures in a run that was cancelled. They were not re-measured, and scroll and focus figures were not recorded. No person has looked at them against the task's criteria. Size is 1280×720 unless noted. "no-preference" and "reduce" are the `prefers-reduced-motion` setting.

Only a few were opened when this file was written (`night-mid.png`, `night-log-panel.png`, `document-full-light.png`, `remeasure-night-dark-reduce.png`). The descriptions of the others come from their names.

## Start screen
- `start-light.png`: start screen, light.
- `start-light-no-preference.png`, `start-light-reduce.png`: start, light, with each motion setting.
- `start-dark-no-preference.png`, `start-dark-reduce.png`: start, dark, with each motion setting.
- `remeasure-start-light-no-preference.png`, `remeasure-start-light-reduce.png`, `remeasure-start-dark-no-preference.png`, `remeasure-start-dark-reduce.png`: a second pass of the same four start screens.

## Night, first moment (11:10 pm)
- `night-light.png`: night screen, light.
- `night-light-no-preference.png`, `night-light-reduce.png`, `night-dark-no-preference.png`, `night-dark-reduce.png`: the same screen, light and dark, each motion setting.
- `remeasure-night-light-no-preference.png`, `remeasure-night-light-reduce.png`, `remeasure-night-dark-no-preference.png`, `remeasure-night-dark-reduce.png`: second pass. The dark/reduce one shows the 11:10 pm night with the duty phone text and four actions (1, C, L, W), no overflow.

## Night, mid-night
- `night-mid.png`: 11:20 pm, light. Two items reached you, three actions, and "Your log" with one entry. No overflow or clipping.
- `night-mid-light-no-preference.png`, `night-mid-light-reduce.png`, `night-mid-dark-no-preference.png`, `night-mid-dark-reduce.png`: mid-night, light and dark, each motion setting.

## Log panel
- `night-log-panel.png`: log panel open at 11:18 pm, light. The first fact is ticked and focused, with an ink outline. The key numbers sit against the labels and the cost against "Record entry" (see below).

## Document (night over)
- `document-light.png`: the document, light, first screen.
- `document-full-light.png`: the whole document, light, 1280×2158. Heading, replay, slider, text timeline, each choice, three habits, and "Play it again" and "Choose another night".
- `document-light-no-preference.png`, `document-light-reduce.png`, `document-dark-no-preference.png`, `document-dark-reduce.png`: the document, light and dark, each motion setting.
- `remeasure-document-light-no-preference.png`, `remeasure-document-light-reduce.png`, `remeasure-document-dark-no-preference.png`, `remeasure-document-dark-reduce.png`: second pass.

## Observations
- No screenshot opened shows horizontal overflow or clipped text at 1280×720. The document is longer than the screen by design.
- Key letters ran into their labels: "MSound off" in the header, "1Text on the duty phone" and "Record entry2 min" in the log panel. The cause was missing spacing in `apps/night-desk/src/styles.css`. A rule that adds an 8 px gap was added after these captures, so the screenshots show the old spacing. The fix was not captured.
- In the replay (`document-full-light.png`), the label of the first decision is crossed by the first message line. This comes from the replay's layout in the kit and was left alone.
- The log panel's checkbox is the browser's default blue, not the palette. Left alone.
