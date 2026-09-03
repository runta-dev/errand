import { describe, expect, it } from "vitest";
import { cloudRunEventsPath } from "./cloudStreamPath";

describe("cloudRunEventsPath", () => {
  it("accepts only v2 Cloud Agent run event streams", () => {
    expect(cloudRunEventsPath("/v2/agents/agent-1/runs/run-1/events?after=-1")).toBe("/v2/agents/agent-1/runs/run-1/events?after=-1");
    expect(cloudRunEventsPath("/v1/agents/agent-1/runs/run-1/events?after=-1")).toBeUndefined();
    expect(cloudRunEventsPath("/v2/agents/agent-1/runs/run-1/events?after=next")).toBeUndefined();
    expect(cloudRunEventsPath("https://example.com/v2/agents/agent-1/runs/run-1/events")).toBeUndefined();
  });
});
