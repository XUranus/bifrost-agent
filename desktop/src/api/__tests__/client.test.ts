import { describe, it, expect } from "vitest";
import { parseAgentError } from "../client";

describe("parseAgentError", () => {
  it("parses auth errors", () => {
    const result = parseAgentError("Unauthorized: 401");
    expect(result.code).toBe("auth");
    expect(result.message).toContain("Authentication");
  });

  it("parses network errors", () => {
    const result = parseAgentError("Connection refused");
    expect(result.code).toBe("network");
    expect(result.message).toContain("Cannot reach");
  });

  it("parses timeout errors", () => {
    const result = parseAgentError("Request timed out");
    expect(result.code).toBe("timeout");
    expect(result.message).toContain("timed out");
  });

  it("parses not_found errors", () => {
    const result = parseAgentError("Resource not found: 404");
    expect(result.code).toBe("not_found");
    expect(result.message).toContain("not found");
  });

  it("falls back to unknown for unrecognized errors", () => {
    const result = parseAgentError("Something unexpected");
    expect(result.code).toBe("unknown");
    expect(result.message).toBe("Something unexpected");
  });

  it("handles Error objects", () => {
    const result = parseAgentError(new Error("Connection refused"));
    expect(result.code).toBe("network");
  });
});
