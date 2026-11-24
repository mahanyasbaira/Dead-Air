import { describe, expect, it } from "vitest";
import { statusText } from "./status-twin";

describe("statusText", () => {
  it("describes the carrier tone", () => {
    expect(statusText({ kind: "carrier", state: "on" })).toBe("Carrier tone on.");
    expect(statusText({ kind: "carrier", state: "off" })).toBe("Carrier tone off.");
  });

  it("describes the chirp by direction", () => {
    expect(statusText({ kind: "chirp", direction: "sent" })).toBe("Chirp: message sent.");
    expect(statusText({ kind: "chirp", direction: "received" })).toBe("Chirp: message received.");
  });
});
