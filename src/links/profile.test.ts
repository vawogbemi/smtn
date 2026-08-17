import { describe, it, expect } from "vitest";
import { mintProfileToken, verifyProfileToken } from "./profile";
import type { Env } from "../rpc";

// Plain function tests -- no Durable Object involved, so these run against a
// bare env object rather than the workers pool's `env` global.
const env = { PROFILE_LINK_SECRET: "test-secret" } as Env;

describe("profile tokens", () => {
  it("round-trips: a minted token verifies back to the same claims", async () => {
    const token = await mintProfileToken(env, "org_abc", "cust_123");
    const claims = await verifyProfileToken(env, token, "cust_123");
    expect(claims).toEqual({ orgId: "org_abc", customerId: "cust_123" });
  });

  it("rejects a token used against a different customer", async () => {
    const token = await mintProfileToken(env, "org_abc", "cust_123");
    await expect(
      verifyProfileToken(env, token, "cust_999"),
    ).rejects.toThrow(/does not match/);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await mintProfileToken(env, "org_abc", "cust_123");
    const otherEnv = { PROFILE_LINK_SECRET: "different-secret" } as Env;
    await expect(
      verifyProfileToken(otherEnv, token, "cust_123"),
    ).rejects.toThrow(/Invalid/);
  });

  it("rejects a tracking link presented as a profile link", async () => {
    // Same base64url(payload).base64url(sig) shape -- deployed under separate
    // secrets, so this proves the two token families can't be swapped even
    // by accident, not just that their claim shapes happen to differ.
    const { mintTrackingToken } = await import("./tracking");
    const trackingToken = await mintTrackingToken(
      { TRACKING_LINK_SECRET: "a-totally-different-secret" } as Env,
      "org_abc",
      "cust_123",
    );
    await expect(
      verifyProfileToken(env, trackingToken, "cust_123"),
    ).rejects.toThrow(/Invalid/);
  });

  it("rejects a payload swapped from a different, otherwise-valid token", async () => {
    const token = await mintProfileToken(env, "org_abc", "cust_123");
    const otherToken = await mintProfileToken(env, "org_xyz", "cust_123");
    const [forgedPayload] = otherToken.split(".");
    const [, originalSig] = token.split(".");
    await expect(
      verifyProfileToken(env, `${forgedPayload}.${originalSig}`, "cust_123"),
    ).rejects.toThrow(/Invalid/);
  });

  it("rejects an expired token", async () => {
    const token = await mintProfileToken(env, "org_abc", "cust_123", -1);
    await expect(
      verifyProfileToken(env, token, "cust_123"),
    ).rejects.toThrow(/expired/);
  });

  it("rejects a malformed token", async () => {
    await expect(
      verifyProfileToken(env, "not-a-real-token", "cust_123"),
    ).rejects.toThrow(/Malformed/);
  });
});
