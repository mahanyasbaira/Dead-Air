// The text twin of every sound the interface can make. Pure, so it runs in Node.
// Only sounds that carry information exist here: the carrier tone (the link is
// live) and the modem chirp (a message went out or came in). There is no key
// click and no static bed; design-language.md bans interface sounds.

export type Sound =
  | { readonly kind: "carrier"; readonly state: "on" | "off" }
  | { readonly kind: "chirp"; readonly direction: "sent" | "received" };

export function statusText(sound: Sound): string {
  switch (sound.kind) {
    case "carrier":
      return sound.state === "on" ? "Carrier tone on." : "Carrier tone off.";
    case "chirp":
      return sound.direction === "sent" ? "Chirp: message sent." : "Chirp: message received.";
  }
}
