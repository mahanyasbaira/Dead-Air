// A recording in-memory Storage for tests. It can be told to throw on chosen calls.
import type { StorageLike } from "./model/storage";

export interface FakeStorage extends StorageLike {
  data: Map<string, string>;
  calls: { getItem: string[]; setItem: Array<[string, string]>; removeItem: string[] };
}

export function fakeStorage(
  initial: Record<string, string> = {},
  throwOn: ReadonlyArray<"getItem" | "setItem" | "removeItem"> = [],
): FakeStorage {
  const data = new Map(Object.entries(initial));
  const calls: FakeStorage["calls"] = { getItem: [], setItem: [], removeItem: [] };
  const guard = (name: "getItem" | "setItem" | "removeItem"): void => {
    if (throwOn.includes(name)) throw new Error(`${name} is not allowed here`);
  };
  return {
    data,
    calls,
    getItem(key) {
      calls.getItem.push(key);
      guard("getItem");
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      calls.setItem.push([key, value]);
      guard("setItem");
      data.set(key, value);
    },
    removeItem(key) {
      calls.removeItem.push(key);
      guard("removeItem");
      data.delete(key);
    },
  };
}

/** base64url (no padding) of UTF-8 text: a token body the codec accepts as base64. */
export function tokenOf(text: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
