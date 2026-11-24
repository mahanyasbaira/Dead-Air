import { describe, expect, it } from "vitest";
import * as core from "../index";
import * as replay from "./index";

describe("kit shell", () => {
  it("resolves both entries", () => {
    expect(typeof core.runChannel).toBe("function");
    expect(typeof core.reduce).toBe("function");
    expect(Object.keys(replay).sort()).toEqual(["HabitsTable", "ReplayView", "decodeReplayRecord", "encodeReplayRecord", "formatLimit", "layoutReplay", "layoutWorldlines", "missingAt", "momentSentences", "summarise", "timeToY", "timelineText"]);
  });
});
