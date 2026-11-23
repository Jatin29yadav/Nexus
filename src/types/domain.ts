// Shared domain types: the shape of each stored document, as the models
// define it. Mongoose adds `_id` (and `__v`); timestamps are listed where the
// schema turns them on.
import type { Types } from "mongoose";

export type UserRole = "User" | "Admin";
export type StationType = "PC" | "Console";
export type StationStatus = "Available" | "Occupied" | "Maintenance" | "Offline";
export type BookingType = StationType;
export type BookingStatus = "Active" | "Completed" | "Cancelled";
export type TeamStatus = "Pending" | "Approved" | "Rejected";
export type TournamentStatus =
  | "Upcoming"
  | "Registration Open"
  | "Live"
  | "Completed"
  | "Cancelled";
export type MessageStatus = "Unread" | "Read";
export type ChatRoomType = "lobby" | "tournament" | "announcements";

interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}

export interface IUser extends Timestamps {
  email: string;
  username: string;
  phone?: string;
  /** bcrypt hash. Not selected by default. */
  password: string;
  role: UserRole;
  /** SEC-09 revocation counter. Not selected by default. */
  tokenVersion: number;
  /** Station ids, e.g. "PC-05". */
  wishlist: string[];
  /** Never written to today (see CLAUDE.md, known gaps). */
  bookings: Types.ObjectId[];
  /** Live chat: the user cannot post until this time. Not selected by default. */
  chatMutedUntil?: Date | null;
}

export interface IUserMethods {
  comparePassword(password: string): Promise<boolean>;
}

export interface IStation extends Timestamps {
  /** e.g. "PC-01", "C-05" */
  stationId: string;
  type: StationType;
  status: StationStatus;
  assignedUser: Types.ObjectId | null;
  activeBooking: Types.ObjectId | null;
}

export interface IBooking extends Timestamps {
  user: Types.ObjectId;
  /** Station ids (`IStation.stationId`), not ObjectIds. */
  stations: string[];
  name?: string;
  email?: string;
  phone?: string;
  bookingType: BookingType;
  membersCount?: number;
  membersName: string[];
  bookingTime: { start?: Date; end?: Date };
  totalAmount: number;
  status: BookingStatus;
}

export interface IPlayer {
  name: string;
  inGameId: string;
  phone: string;
}

export interface ITeam {
  _id: Types.ObjectId;
  teamName: string;
  captain: Types.ObjectId;
  players: IPlayer[];
  status: TeamStatus;
  assignedPCs: Types.ObjectId[];
}

export interface ITournament extends Timestamps {
  title: string;
  game: string;
  description?: string;
  prize: string;
  entryFee: string;
  format: string;
  thumbnail: string;
  rules: string[];
  eventTime: { start: Date; end: Date };
  maxTeams: number;
  registeredTeams: ITeam[];
  status: TournamentStatus;
}

export interface IMessage {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  status: MessageStatus;
  createdAt: Date;
}

export interface IChatRoom extends Timestamps {
  /** Stable key: "general", "announcements" or "tournament-<tournamentId>". */
  slug: string;
  name: string;
  type: ChatRoomType;
  /** Set for type "tournament" only. */
  tournament: Types.ObjectId | null;
  /** Only admins may post. */
  readOnly: boolean;
}

export interface IChatMessage {
  room: Types.ObjectId;
  user: Types.ObjectId;
  /** Copied at write time so history needs no populate. */
  username: string;
  text: string;
  /** Client-chosen id that makes a resend after a reconnect idempotent. */
  clientId: string;
  createdAt: Date;
  deletedAt: Date | null;
  deletedBy: Types.ObjectId | null;
}

/** Legacy (unused) allocator model. */
export interface ISetup extends Timestamps {
  name: string;
  type: "PC" | "VR";
  isActive: boolean;
  meta: Record<string, unknown>;
}
