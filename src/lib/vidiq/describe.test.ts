import { describe, expect, it } from "vitest";
import { describeFailure } from "./describe";

describe("describeFailure", () => {
  it.each([
    ["This video is private", "private"],
    ["Video unavailable. Credits were refunded.", "unavailable"],
    ["Video not found", "unavailable"],
    ["No captions available for this video", "noCaptions"],
    ["Video duration exceeds the maximum length", "tooLong"],
    ["This is a short-form video, use vidiq_watch_shortform_content", "wrongFormat"],
    ["vidIQ did not finish this video in time.", "timeout"],
    ["Could not reach vidIQ: fetch failed", "network"],
    ["vidIQ returned an empty summary.", "empty"],
    ["Insufficient credits", "credits"],
    ["Something odd happened", "unknown"],
  ])("explains %j as %s", (message, reason) => {
    expect(describeFailure(message).reason).toBe(reason);
  });

  it("notices when vidIQ refunded the credits", () => {
    expect(describeFailure("Video unavailable. Credits were refunded.").refunded).toBe(true);
    expect(describeFailure("Video unavailable").refunded).toBe(false);
  });
});
