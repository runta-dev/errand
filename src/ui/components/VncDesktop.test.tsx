import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

const instances = vi.hoisted(() => [] as Array<EventTarget & { disconnect: ReturnType<typeof vi.fn>; viewOnly: boolean; scaleViewport: boolean; resizeSession: boolean; canvas: HTMLCanvasElement }>);
const constructor = vi.hoisted(() => vi.fn());

vi.mock("@novnc/novnc/lib/rfb.js", () => ({
  default: class MockRfb extends EventTarget {
    disconnect = vi.fn(); viewOnly = false; scaleViewport = false; resizeSession = false; canvas = document.createElement("canvas");
    constructor(target: HTMLElement, url: string, options: unknown) { super(); this.canvas.width = 2; this.canvas.height = 2; target.appendChild(this.canvas); constructor(target, url, options); instances.push(this); }
  },
}));

import { VncDesktop } from "./VncDesktop";
import { DetailPanel } from "./DetailPanel";
import { canvasHasVisualFrame } from "./vncFrame";

beforeEach(() => { instances.splice(0); constructor.mockClear(); });

it("does not treat noVNC's uniform placeholder canvas as a video frame", () => {
  const canvas = (pixels: number[][]) => ({ width: 100, height: 100, getContext: () => ({ getImageData: () => ({ data: pixels.shift() ?? [255, 255, 255, 255] }) }) }) as unknown as HTMLCanvasElement;
  expect(canvasHasVisualFrame(canvas(Array(9).fill([255, 255, 255, 255])))).toBe(false);
  expect(canvasHasVisualFrame(canvas([[255, 80, 20, 255], ...Array(8).fill([20, 20, 20, 255])]))).toBe(true);
});

it("connects noVNC with the API websocket URL and subprotocols", async () => {
  const reconnect = vi.fn();
  const rendered = render(<VncDesktop session={{ url: "wss://vnc.example.test/", protocols: ["binary", "vnc-ticket.ticket"], mode: "remote" }} onClose={vi.fn()} onReconnect={reconnect} />);
  await waitFor(() => expect(instances).toHaveLength(1));
  expect(constructor).toHaveBeenCalledWith(expect.any(HTMLElement), "wss://vnc.example.test/", { shared: true, wsProtocols: ["binary", "vnc-ticket.ticket"] });
  expect(instances[0]).toMatchObject({ viewOnly: false, scaleViewport: true, resizeSession: false });
  act(() => instances[0].dispatchEvent(new CustomEvent("disconnect", { detail: { clean: false } })));
  expect(screen.getByText("Cloud computer connection was lost.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Reconnect" }));
  expect(reconnect).toHaveBeenCalledOnce();
  rendered.unmount();
  expect(instances[0].disconnect).toHaveBeenCalledOnce();
});

it("shows immediate connection feedback before a ticket is available", async () => {
  const reconnect = vi.fn();
  const rendered = render(<VncDesktop onClose={vi.fn()} onReconnect={reconnect} />);
  expect(screen.getByText("Connecting…")).toBeInTheDocument();
  rendered.rerender(<VncDesktop failure="Ticket failed" onClose={vi.fn()} onReconnect={reconnect} />);
  expect(screen.getByText("Ticket failed")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Reconnect" }));
  expect(reconnect).toHaveBeenCalledOnce();
});

it("waits for a framebuffer before treating VNC as ready", async () => {
  vi.useFakeTimers();
  const getImageData = vi.fn(() => ({ data: Uint8ClampedArray.from([0, 0, 0, 0]) }));
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ getImageData } as unknown as CanvasRenderingContext2D);
  try {
    render(<VncDesktop session={{ url: "wss://vnc.example.test/", protocols: [], mode: "remote" }} onClose={vi.fn()} onReconnect={vi.fn()} />);
    await vi.waitFor(() => expect(instances).toHaveLength(1));
    act(() => instances[0].dispatchEvent(new CustomEvent("connect")));
    expect(screen.getByRole("status")).toHaveTextContent("Connecting…");
    let sample = 0;
    getImageData.mockImplementation(() => ({ data: Uint8ClampedArray.from(sample++ % 2 === 0 ? [240, 90, 20, 255] : [20, 20, 20, 255]) }));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  } finally { getContext.mockRestore(); vi.useRealTimers(); }
});

it("times out a stalled handshake and ignores a late connect event", async () => {
  vi.useFakeTimers();
  const rendered = render(<VncDesktop session={{ url: "wss://vnc.example.test/", protocols: [], mode: "remote" }} onClose={vi.fn()} onReconnect={vi.fn()} />);
  try {
    await vi.waitFor(() => expect(instances).toHaveLength(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByText("Cloud computer connection timed out.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
    expect(instances[0].disconnect).toHaveBeenCalledOnce();
    act(() => instances[0].dispatchEvent(new CustomEvent("connect")));
    expect(screen.queryByText("Connecting…")).not.toBeInTheDocument();
  } finally { rendered.unmount(); vi.useRealTimers(); }
});

it("keeps the first-frame deadline separate from the handshake deadline", async () => {
  vi.useFakeTimers();
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ getImageData: () => ({ data: Uint8ClampedArray.from([0, 0, 0, 0]) }) } as unknown as CanvasRenderingContext2D);
  const rendered = render(<VncDesktop session={{ url: "wss://vnc.example.test/", protocols: [], mode: "remote" }} onClose={vi.fn()} onReconnect={vi.fn()} />);
  try {
    await vi.waitFor(() => expect(instances).toHaveLength(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(14_000); });
    act(() => instances[0].dispatchEvent(new CustomEvent("connect")));
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(screen.getByText("Connecting…")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(6_000); });
    expect(screen.getByText("Cloud computer did not produce a video frame.")).toBeInTheDocument();
    expect(instances[0].disconnect).toHaveBeenCalledOnce();
  } finally { rendered.unmount(); getContext.mockRestore(); vi.useRealTimers(); }
});

it("explains unsupported VNC credential requests instead of waiting indefinitely", async () => {
  render(<VncDesktop session={{ url: "wss://vnc.example.test/", protocols: [], mode: "remote" }} onClose={vi.fn()} onReconnect={vi.fn()} />);
  await waitFor(() => expect(instances).toHaveLength(1));
  act(() => instances[0].dispatchEvent(new CustomEvent("credentialsrequired", { detail: { types: ["password"] } })));
  expect(screen.getByText("Cloud computer requires VNC credentials that Runta Crew cannot provide.")).toBeInTheDocument();
  expect(instances[0].disconnect).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
});

it.each(["ticket", "connection"])("stops automatic preview retries after a %s failure and retries from the existing screen button", async (failure) => {
  const computerAction = vi.fn(async () => ({ url: "wss://vnc.example.test/", protocols: [], mode: "remote" as const }));
  if (failure === "ticket") computerAction.mockRejectedValueOnce(new Error("Ticket failed"));
  const rendered = render(<DetailPanel open width={340} onResize={vi.fn()} agentName="Atlas" computer={{ id: "computer-1", agentId: "agent-1", runtimeName: "computer-1", status: "online", capabilities: ["open"] }} approvals={[]} onApproval={vi.fn()} onComputerAction={computerAction} onClose={vi.fn()} />);
  if (failure === "connection") {
    await waitFor(() => expect(instances).toHaveLength(1));
    act(() => instances[0].dispatchEvent(new CustomEvent("disconnect", { detail: { clean: false } })));
  }
  expect(await screen.findByText("Screen unavailable")).toBeInTheDocument();
  expect(computerAction).toHaveBeenCalledOnce();
  expect(rendered.container.querySelector(".screen-trigger button")).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Open Atlas's screen" }));

  expect(await screen.findByRole("dialog", { name: "Cloud computer" })).toBeInTheDocument();
  await waitFor(() => expect(instances).toHaveLength(failure === "connection" ? 2 : 1));
  expect(computerAction).toHaveBeenCalledTimes(2);
  await userEvent.click(screen.getByRole("button", { name: "Minimize cloud computer" }));
  await waitFor(() => expect(instances).toHaveLength(failure === "connection" ? 3 : 2));
  expect(computerAction).toHaveBeenCalledTimes(3);
});
