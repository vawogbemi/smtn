import { describe, it, expect } from "vitest";
import { mintTrackingToken, verifyTrackingToken } from "./tracking";
import type { Env } from "../rpc";

// Plain function tests -- no Durable Object involved, so these run against a
// bare env object rather than the workers pool's `env` global.
const env = { TRACKING_LINK_SECRET: "test-secret" } as Env;

describe("tracking tokens", () => {
  it("round-trips: a minted token verifies back to the same claims", async () => {
    const token = await mintTrackingToken(env, "org_abc", "order_123");
    const claims = await verifyTrackingToken(env, token, "order_123");
    expect(claims).toEqual({ orgId: "org_abc", orderId: "order_123" });
  });

  it("rejects a token used against a different order", async () => {
    const token = await mintTrackingToken(env, "org_abc", "order_123");
    await expect(
      verifyTrackingToken(env, token, "order_999"),
    ).rejects.toThrow(/does not match/);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await mintTrackingToken(env, "org_abc", "order_123");
    const otherEnv = { TRACKING_LINK_SECRET: "different-secret" } as Env;
    await expect(
      verifyTrackingToken(otherEnv, token, "order_123"),
    ).rejects.toThrow(/Invalid/);
  });

  it("rejects a payload swapped from a different, otherwise-valid token", async () => {
    const token = await mintTrackingToken(env, "org_abc", "order_123");
    const otherToken = await mintTrackingToken(env, "org_xyz", "order_123");
    // Graft org_xyz's payload onto org_abc's signature -- both halves are
    // individually genuine, but the pairing isn't, so the HMAC must catch it.
    const [forgedPayload] = otherToken.split(".");
    const [, originalSig] = token.split(".");
    await expect(
      verifyTrackingToken(env, `${forgedPayload}.${originalSig}`, "order_123"),
    ).rejects.toThrow(/Invalid/);
  });

  it("rejects an expired token", async () => {
    const token = await mintTrackingToken(env, "org_abc", "order_123", -1);
    await expect(
      verifyTrackingToken(env, token, "order_123"),
    ).rejects.toThrow(/expired/);
  });

  it("rejects a malformed token", async () => {
    await expect(
      verifyTrackingToken(env, "not-a-real-token", "order_123"),
    ).rejects.toThrow(/Malformed/);
  });
});
