import { describe, expect, it } from "vitest";
import { minimalDrill } from "./examples/minimal-drill";

describe("minimal drill", () => {
  it("with the default seed the message is lost: p2 never knows it and keeps waiting", () => {
    expect(minimalDrill()).toEqual([
      { t: 0, p2Knew: [], p2Waiting: ["m1"], p3Knew: [] },
      { t: 3, p2Knew: [], p2Waiting: ["m1"], p3Knew: ["rumour"] },
      { t: 10, p2Knew: [], p2Waiting: ["m1"], p3Knew: ["rumour"] },
    ]);
  });

  it("with another seed the message arrives and p2 knows it by time 3", () => {
    expect(minimalDrill(1)).toEqual([
      { t: 0, p2Knew: [], p2Waiting: ["m1"], p3Knew: [] },
      { t: 3, p2Knew: ["m1"], p2Waiting: [], p3Knew: ["rumour"] },
      { t: 10, p2Knew: ["m1"], p2Waiting: [], p3Knew: ["rumour"] },
    ]);
  });

  it("gives the same answer every time for the same seed", () => {
    expect(minimalDrill(7)).toEqual(minimalDrill(7));
  });
});
