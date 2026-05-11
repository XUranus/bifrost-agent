import { describe, it, expect } from "vitest";

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GiB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MiB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

describe("formatBytes", () => {
  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats KiB", () => {
    expect(formatBytes(1024)).toBe("1.0 KiB");
    expect(formatBytes(1536)).toBe("1.5 KiB");
    expect(formatBytes(1048575)).toBe("1024.0 KiB");
  });

  it("formats MiB", () => {
    expect(formatBytes(1048576)).toBe("1.0 MiB");
    expect(formatBytes(5242880)).toBe("5.0 MiB");
  });

  it("formats GiB", () => {
    expect(formatBytes(1073741824)).toBe("1.0 GiB");
    expect(formatBytes(5368709120)).toBe("5.0 GiB");
  });
});
