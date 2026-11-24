import { describe, expect, it } from "vitest";
import { carrierState } from "./carrier";

describe("carrierState", () => {
  it("is SENDING while transmitting, whatever the recent outcome", () => {
    expect(carrierState("transmitting")).toBe("SENDING");
    expect(carrierState("transmitting", "collision")).toBe("SENDING");
    expect(carrierState("transmitting", "received")).toBe("SENDING");
  });
  it("is COLLISION after a recent collision when idle", () => {
    expect(carrierState("idle", "collision")).toBe("COLLISION");
  });
  it("is RECEIVING after a recent received or garbled outcome", () => {
    expect(carrierState("idle", "received")).toBe("RECEIVING");
    expect(carrierState("idle", "garbled")).toBe("RECEIVING");
  });
  it("is IDLE with no recent outcome", () => {
    expect(carrierState("idle")).toBe("IDLE");
    expect(carrierState("idle", undefined)).toBe("IDLE");
  });
});
