// Dara's conversation memory now lives in the Agents SDK Session API (see
// tenant.ts's #sessionFor/getSessionHistory/recordMessage), which owns its
// own byte-budgeted history reads -- the hand-rolled size-bounding that used
// to live here (buildHistory, LABELS, MAX_HISTORY_CHARS) is gone.
//
// What's left is purely a body-shaping concern, not a storage one: quoted
// history. Most mail clients prepend the entire prior thread to every
// reply, so message N of an N-email thread can contain messages 1..N-1
// again, nested. Left in, that's the same text paid for and read by the
// model N times over, and it buries what's actually new. SMS bodies don't
// have this problem -- there's no live caller yet -- but this is ready for
// whenever email support lands.

// Cut the body at the first line that looks like the start of a quoted
// prior message. Order doesn't matter -- whichever pattern matches earliest
// in the text wins, since everything after the true start of the quote is
// quoted regardless of which client's header format flagged it.
const QUOTE_START_PATTERNS: RegExp[] = [
  /^-{2,}\s*Original Message\s*-{2,}/im, // Outlook: "-----Original Message-----"
  /^_{5,}\s*$/m, // Outlook web: a long underscore rule above the quoted header
  /^On .{0,150}\bwrote:\s*$/im, // Gmail/Apple Mail: "On <date>, <name> wrote:"
  /^From:\s.+$/im, // a forwarded or top-posted header block
];

/** Strips a trailing quoted-reply chain and inline '>' quoting from a body. */
export function stripQuoted(body: string): string {
  let cutAt = body.length;
  for (const pattern of QUOTE_START_PATTERNS) {
    const match = pattern.exec(body);
    if (match && match.index < cutAt) cutAt = match.index;
  }
  const text = body
    .slice(0, cutAt)
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("\n");
  return text.trim();
}

// A message this long is almost always a quoted chain the patterns above
// didn't recognize (an unfamiliar client's header format, say) -- cap it
// regardless so one message can't dominate the transcript. tenant.ts's own
// SESSION_BODY_CHARS mirrors this value rather than importing it, to keep
// tenant.ts free of a dependency on agent/.
export const MAX_BODY_CHARS = 1000;
