import { describe, expect, it } from "vitest";
import { parseVideoRef } from "./video-id";

describe("parseVideoRef", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=42s", "dQw4w9WgXcQ"],
    ["http://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RD", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc123", "dQw4w9WgXcQ"],
    ["youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ?feature=shared", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/v/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["  dQw4w9WgXcQ  ", "dQw4w9WgXcQ"],
    ["a-B_c1D2e3F", "a-B_c1D2e3F"],
  ])("extracts the ID from %s", (input, id) => {
    expect(parseVideoRef(input)).toEqual({ id, isShort: false });
  });

  it("marks /shorts/ links as short-form", () => {
    expect(parseVideoRef("https://www.youtube.com/shorts/aBcDeFgHiJk?feature=share")).toEqual({
      id: "aBcDeFgHiJk",
      isShort: true,
    });
  });

  it.each([
    "",
    "   ",
    "not a video",
    "https://www.youtube.com/@somechannel",
    "https://www.youtube.com/playlist?list=PL123",
    "https://vimeo.com/123456789",
    "https://www.youtube.com/watch?v=tooShort",
    "dQw4w9WgXcQextra",
    "https://evil.com/watch?v=dQw4w9WgXcQ",
  ])("returns null for %j", (input) => {
    expect(parseVideoRef(input)).toBeNull();
  });
});
