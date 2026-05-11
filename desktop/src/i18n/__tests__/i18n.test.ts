import { describe, it, expect } from "vitest";
import { en } from "../en";
import { zh } from "../zh";

describe("i18n translations", () => {
  it("has matching keys between en and zh", () => {
    const enKeys = Object.keys(en).sort();
    const zhKeys = Object.keys(zh).sort();
    expect(zhKeys).toEqual(enKeys);
  });

  it("has no empty values in en", () => {
    for (const [, value] of Object.entries(en)) {
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it("has no empty values in zh", () => {
    for (const [, value] of Object.entries(zh)) {
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it("covers core nav keys", () => {
    expect(en["nav.dashboard"]).toBeDefined();
    expect(en["nav.assets"]).toBeDefined();
    expect(en["nav.jobs"]).toBeDefined();
    expect(en["nav.settings"]).toBeDefined();
  });

  it("covers settings keys", () => {
    expect(en["settings.agentProfiles"]).toBeDefined();
    expect(en["settings.language"]).toBeDefined();
    expect(zh["settings.agentProfiles"]).toBeDefined();
    expect(zh["settings.language"]).toBeDefined();
  });
});
