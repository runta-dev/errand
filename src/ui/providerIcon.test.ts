import { expect, it } from "vitest";
import { providerIconId } from "./providerIcon";

it("identifies the endpoint rather than the editable display name or wire protocol", () => {
  const provider = { id: "custom-id", name: "OpenAI API", protocol: "openai_responses" };
  expect(providerIconId({ ...provider, baseUrl: "https://api.openai.com/v1" })).toBe("openai");
  expect(providerIconId({ ...provider, name: "Team model", baseUrl: "https://api.openai.com/v1/" })).toBe("openai");
  expect(providerIconId({ ...provider, baseUrl: "https://proxy.example/v1" })).toBe("compatible");
  expect(providerIconId(provider)).toBe("compatible");
});
