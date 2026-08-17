import { describe, it, expect } from "vitest";
import { stripQuoted } from "./history";

describe("stripQuoted", () => {
  it("cuts an Outlook-style original-message block", () => {
    const body = "Sure, that works.\n\n-----Original Message-----\nFrom: bob@x.com\nSent: Monday\nHi, checking in.";
    expect(stripQuoted(body)).toBe("Sure, that works.");
  });

  it("cuts a Gmail-style 'On ... wrote:' block", () => {
    const body = "Thanks!\n\nOn Mon, Jan 5, 2026 at 3:45 PM Bob <bob@x.com> wrote:\nWhere is my package?";
    expect(stripQuoted(body)).toBe("Thanks!");
  });

  it("cuts a forwarded header block", () => {
    const body = "See below.\n\nFrom: Bob <bob@x.com>\nSubject: FW: shipment\nWhere is my package?";
    expect(stripQuoted(body)).toBe("See below.");
  });

  it("strips inline '>' quoted lines without a header to anchor on", () => {
    const body = "It's on the way.\n> Where is my package?\n> Sent from my iPhone";
    expect(stripQuoted(body)).toBe("It's on the way.");
  });

  it("leaves an unquoted body untouched", () => {
    expect(stripQuoted("Where is my package?")).toBe("Where is my package?");
  });
});
