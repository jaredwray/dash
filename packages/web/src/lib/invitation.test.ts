import { describe, expect, it } from "vitest";
import { invitationTokenFromHash, invitationUrl } from "./invitation.ts";

const token = "Zm9vYmFyYmF6cXV4LXF1dXhfY29yZ2U";

describe("invitation links", () => {
  it("puts the token in the fragment", () => {
    expect(invitationUrl("https://dev.dash.io", token)).toBe(`https://dev.dash.io/invite#${token}`);
    expect(invitationUrl("http://localhost:3000/", token)).toBe(
      `http://localhost:3000/invite#${token}`,
    );
  });

  it("reads the token back from location.hash", () => {
    const url = new URL(invitationUrl("https://dev.dash.io", token));
    expect(invitationTokenFromHash(url.hash)).toBe(token);
    expect(invitationTokenFromHash(token)).toBe(token);
  });

  it("rejects a missing or malformed fragment", () => {
    expect(invitationTokenFromHash("")).toBeNull();
    expect(invitationTokenFromHash("#")).toBeNull();
    expect(invitationTokenFromHash("#short")).toBeNull();
    expect(invitationTokenFromHash(`#${token}&x=1`)).toBeNull();
    expect(invitationTokenFromHash(`#${"a".repeat(201)}`)).toBeNull();
  });
});
