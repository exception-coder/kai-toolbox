import { describe, expect, it } from "vitest";
import { isLocalDevelopmentHost } from "./localDevelopment";

describe("isLocalDevelopmentHost", () => {
  it.each(["localhost", "LOCALHOST", "127.0.0.1", "192.168.1.20"])(
    "recognizes %s as local development",
    (hostname) => {
      expect(isLocalDevelopmentHost(hostname)).toBe(true);
    },
  );

  it.each(["kai-tool.exception-coder.com", "10.0.0.8", "192.169.1.20"])(
    "keeps OAuth enabled for %s",
    (hostname) => {
      expect(isLocalDevelopmentHost(hostname)).toBe(false);
    },
  );
});
