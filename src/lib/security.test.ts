import { describe, expect, it } from "vitest";
import { rejectReason } from "./security";

const req = (over: Partial<Parameters<typeof rejectReason>[0]> = {}) => ({
  method: "POST",
  host: "localhost:4817",
  origin: "http://localhost:4817",
  secFetchSite: "same-origin",
  ...over,
});

describe("rejectReason", () => {
  it("allows the app's own requests", () => {
    expect(rejectReason(req())).toBeNull();
    expect(rejectReason(req({ host: "127.0.0.1:4817", origin: "http://127.0.0.1:4817" }))).toBeNull();
  });

  it("allows reads from anywhere on this computer, including the vidIQ sign-in redirect", () => {
    expect(rejectReason(req({ method: "GET", origin: null, secFetchSite: "cross-site" }))).toBeNull();
  });

  it("allows local tools that send no browser headers", () => {
    expect(rejectReason(req({ origin: null, secFetchSite: null }))).toBeNull();
  });

  it("blocks changes requested by other websites", () => {
    expect(rejectReason(req({ origin: "https://evil.example", secFetchSite: "cross-site" }))).toMatch(/other website/);
    expect(rejectReason(req({ origin: "http://localhost:3000", secFetchSite: "same-site" }))).toMatch(/other website/);
    expect(rejectReason(req({ origin: "https://evil.example", secFetchSite: null }))).toMatch(/other website/);
  });

  it("blocks requests that reach the app under another host name", () => {
    expect(rejectReason(req({ method: "GET", host: "evil.example:4817" }))).toMatch(/host/);
    expect(rejectReason(req({ method: "GET", host: null }))).toMatch(/host/);
  });
});
