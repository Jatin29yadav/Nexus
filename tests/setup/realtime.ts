// Live chat test harness: the real app + Socket.IO on an ephemeral local
// port, and socket.io-client connections to it. Never src/server.ts.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket as ClientSocket } from "socket.io-client";
import { app } from "../../src/app";
import { createRealtime, closeRealtime } from "../../src/realtime";
import type { ApiResponse } from "../../src/types/api";
import { api, type TestUser } from "./helpers";

export const ALLOWED_ORIGIN = "https://frontend.example.test"; // tests/setup/setup.ts

export interface Harness {
  url: string;
  close: () => Promise<void>;
}

export async function startRealtime(): Promise<Harness> {
  const server = createServer(app);
  const io = createRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, close: () => closeRealtime(io) };
}

export async function ticketFor(user: TestUser): Promise<string> {
  const res = await api().post("/api/chat/ticket").set("Cookie", user.cookie);
  if (res.status !== 200) throw new Error(`ticket request failed: ${res.status}`);
  return res.body.ticket as string;
}

const open: ClientSocket[] = [];

/** Connects over WebSocket; rejects with the server's connect_error message. */
export function connectChat(
  harness: Harness,
  { ticket, origin = ALLOWED_ORIGIN, namespace = "/chat" }: { ticket?: unknown; origin?: string; namespace?: string } = {},
): Promise<ClientSocket> {
  const socket = connect(harness.url + namespace, {
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
    auth: ticket === undefined ? {} : { ticket },
    extraHeaders: origin ? { Origin: origin } : {},
  });
  open.push(socket);
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (err) => reject(new Error(err.message)));
  });
}

export const connectAs = async (harness: Harness, user: TestUser) =>
  connectChat(harness, { ticket: await ticketFor(user) });

export const disconnectAll = (): void => {
  for (const socket of open.splice(0)) socket.disconnect();
};

export const send = (socket: ClientSocket, event: string, payload: unknown): Promise<ApiResponse> =>
  socket.timeout(3000).emitWithAck(event, payload) as Promise<ApiResponse>;

/** The next `event` on `socket`, or a rejection after `ms`. */
export function nextEvent<T = unknown>(socket: ClientSocket, event: string, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no "${event}" within ${ms} ms`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Resolves true if `event` does NOT arrive within `ms`. */
export const noEvent = (socket: ClientSocket, event: string, ms = 400): Promise<boolean> =>
  nextEvent(socket, event, ms).then(
    () => false,
    () => true,
  );
