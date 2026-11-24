import { describe, it, expect } from "vitest";
import { parseBrief, printBrief } from "./brief";

const GOOD = `# Quiet hours
## Participants
- ra: Sam - the assistant on duty
- res: Kit - a neighbour
## Beats
- 0 | all | info | Evening | The hall is calm
- 5 | ra | message_created | Text | Kit writes: a \\| b
- 9 | all | debrief | End | Done
## Decisions
### ra: What now?
- knock: Knock on the door
- wait: Wait
`;

function errs(md: string) {
  const r = parseBrief(md);
  if (r.ok) throw new Error("expected errors");
  return r.errors;
}

describe("parseBrief", () => {
  it("parses a well-formed brief and unescapes pipes", () => {
    const r = parseBrief(GOOD);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.brief.title).toBe("Quiet hours");
    expect(r.brief.participants).toHaveLength(2);
    expect(r.brief.beats[1].body).toBe("Kit writes: a | b");
    expect(r.brief.decisions[0].options.map((o) => o.id)).toEqual(["knock", "wait"]);
    expect(parseBrief(printBrief(r.brief))).toEqual(r);
  });

  it("reports a missing title on line 1", () => {
    expect(errs("## Beats\n")[0].line).toBe(1);
  });

  it("reports a second title on its line", () => {
    expect(errs("# A\n\n# B\n")).toEqual([{ line: 3, message: expect.any(String) }]);
  });

  it("reports an unknown section on its line", () => {
    expect(errs("# A\n## Extras\n")[0].line).toBe(2);
  });

  it("reports a bad participant line", () => {
    expect(errs("# A\n## Participants\n- ra Sam\n")[0].line).toBe(3);
    expect(errs("# A\n## Participants\n- ra: Sam\n")[0].line).toBe(3);
  });

  it("reports a beat with the wrong field count, time or type", () => {
    const head = "# A\n## Participants\n- ra: S - b\n## Beats\n";
    expect(errs(head + "- 1 | all | info | t\n")[0].line).toBe(5);
    expect(errs(head + "- x | all | info | t | b\n")[0].line).toBe(5);
    expect(errs(head + "- 1 | all | shout | t | b\n")[0].line).toBe(5);
    expect(errs(head + "- -1 | all | info | t | b\n")[0].line).toBe(5);
  });

  it("reports an undeclared audience and participant", () => {
    const head = "# A\n## Participants\n- ra: S - b\n## Beats\n";
    expect(errs(head + "- 1 | zed | info | t | b\n")[0].line).toBe(5);
    expect(errs(head + "## Decisions\n### zed: Q\n- a: A\n")[0].line).toBe(6);
  });

  it("reports an option with no decision above it and a stray list item", () => {
    expect(errs("# A\n## Decisions\n- a: A\n")[0].line).toBe(3);
    expect(errs("# A\n- a: A\n")[0].line).toBe(2);
  });

  it("reports unrecognized lines and non-string input without throwing", () => {
    expect(errs("# A\nhello\n")[0].line).toBe(2);
    expect(parseBrief(undefined as unknown as string).ok).toBe(false);
  });

  it("handles CRLF line endings and hostile ids", () => {
    const md = "# A\r\n## Participants\r\n- __proto__: P - b\r\n## Beats\r\n- 0 | __proto__ | info | t | b\r\n";
    const r = parseBrief(md);
    expect(r.ok).toBe(true);
  });
});
