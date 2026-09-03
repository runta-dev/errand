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
  expect(instances[0]).toMatchObject({ viewOnly: false, scaleViewport: true, resizeSession: true });
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
