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

beforeEach(() => { instances.splice(0); constructor.mockClear(); });

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
    getImageData.mockReturnValue({ data: Uint8ClampedArray.from([0, 0, 0, 255]) });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  } finally { getContext.mockRestore(); vi.useRealTimers(); }
});
