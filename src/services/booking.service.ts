// LEGACY and UNUSED: an allocator for the old Setup model. It reads a
// `setupIds` field that today's Booking schema does not have (see CLAUDE.md).
// Kept as it was; typed against the legacy shape it expects.
import type { Types } from "mongoose";
import { Booking } from "../models/Booking";
import { Setup } from "../models/Setup";
import type { ISetup } from "../types/domain";

type SetupType = ISetup["type"];
type LeanSetup = ISetup & { _id: Types.ObjectId };

/** A booking as this allocator expects it to be stored (not the current schema). */
interface LegacyBooking {
  setupIds?: Array<Types.ObjectId | string>;
  bookingTime: { start: Date; end: Date };
}

interface Interval {
  start: Date;
  end: Date;
}

/**
 * 🔍 Find all setups that are free for the given time window.
 * It filters active setups of the given type and excludes those already booked.
 */
export async function findAvailableSetups({
  bookingStart,
  bookingEnd,
  type,
  excludeSetupIds = [],
}: {
  bookingStart: Date;
  bookingEnd: Date;
  type: SetupType;
  excludeSetupIds?: string[];
}): Promise<LeanSetup[]> {
  // Step 1️⃣: Find all active setups of this type (e.g., PC or VR)
  const allSetups = await Setup.find({ type, isActive: true }).lean<LeanSetup[]>();

  if (!allSetups.length) return []; // no setups of that type

  const allIds = allSetups.map((s) => s._id);

  // Step 2️⃣: Find existing bookings overlapping with requested time
  const overlappingBookings = await Booking.find({
    setupIds: { $in: allIds },
    $or: [
      {
        "bookingTime.start": { $lt: bookingEnd },
        "bookingTime.end": { $gt: bookingStart },
      },
    ],
    status: { $ne: "cancelled" }, // ignore cancelled ones
  }).lean<LegacyBooking[]>();

  // Step 3️⃣: Mark setups that are already booked
  const busySetupIds = new Set<string>();
  for (const b of overlappingBookings) {
    (b.setupIds || []).forEach((id) => busySetupIds.add(String(id)));
  }

  // Step 4️⃣: Filter out busy setups and those excluded manually
  const freeSetups = allSetups.filter(
    (s) => !busySetupIds.has(String(s._id)) && !excludeSetupIds.includes(String(s._id)),
  );

  return freeSetups;
}

/**
 * ⚙️ Allocate setups intelligently
 * Tries to allocate based on preference (if given), otherwise allocates first available setups.
 */
export async function allocateSetups({
  bookingStart,
  bookingEnd,
  type,
  slotsRequested,
  setupPreference = [],
}: {
  bookingStart: Date;
  bookingEnd: Date;
  type: SetupType;
  slotsRequested: number;
  setupPreference?: string[];
}): Promise<string[]> {
  // 1️⃣ Preference based allocation
  if (Array.isArray(setupPreference) && setupPreference.length) {
    const prefSetups = await Setup.find({
      _id: { $in: setupPreference },
      type,
      isActive: true,
    }).lean<LeanSetup[]>();
    const prefIds = prefSetups.map((s) => String(s._id));

    const freePref = await findAvailableSetups({
      bookingStart,
      bookingEnd,
      type,
    });

    const freePrefIdsSet = new Set(freePref.map((s) => String(s._id)));
    const allocatedFromPref = prefIds
      .filter((id) => freePrefIdsSet.has(id))
      .slice(0, slotsRequested);

    if (allocatedFromPref.length === slotsRequested) return allocatedFromPref;

    // Fill remaining setups from pool if partial preference matched
    const remaining = slotsRequested - allocatedFromPref.length;
    const otherFree = freePref
      .filter((s) => !allocatedFromPref.includes(String(s._id)))
      .map((s) => String(s._id));
    const fill = otherFree.slice(0, remaining);
    return allocatedFromPref.concat(fill);
  }

  // 2️⃣ Standard allocation if no preferences given
  const freeSetups = await findAvailableSetups({
    bookingStart,
    bookingEnd,
    type,
  });
  if (freeSetups.length < slotsRequested) return [];
  return freeSetups.slice(0, slotsRequested).map((s) => String(s._id));
}

/**
 * 🧭 Find next available start time when all setups are booked.
 * Searches ahead (default 1 week) to suggest a possible next slot.
 */
export async function findNextAvailableStart({
  requestedStart,
  durationMs,
  type,
  slotsRequested,
  searchLimitHours = 168, // 1 week
}: {
  requestedStart: Date;
  durationMs: number;
  type: SetupType;
  slotsRequested: number;
  searchLimitHours?: number;
}): Promise<Date | null> {
  const limitDate = new Date(requestedStart.getTime() + searchLimitHours * 3600 * 1000);
  let candidate = new Date(requestedStart);

  const setups = await Setup.find({ type, isActive: true }).lean<LeanSetup[]>();
  if (!setups.length) return null;

  const setupIds = setups.map((s) => String(s._id));

  // Fetch all overlapping bookings in this period
  const bookings = await Booking.find({
    setupIds: { $in: setupIds },
    $or: [
      {
        "bookingTime.start": {
          $lt: new Date(limitDate.getTime() + durationMs),
        },
        "bookingTime.end": { $gt: requestedStart },
      },
    ],
    status: { $ne: "cancelled" },
  }).lean<LegacyBooking[]>();

  // Build busy map (setupId -> list of busy intervals)
  const busyMap: Record<string, Interval[]> = {};
  for (const s of setupIds) busyMap[s] = [];
  for (const b of bookings) {
    for (const sid of b.setupIds ?? []) {
      const sidStr = String(sid);
      const intervals = (busyMap[sidStr] ??= []);
      intervals.push({
        start: new Date(b.bookingTime.start),
        end: new Date(b.bookingTime.end),
      });
    }
  }

  // Sort intervals by start time for faster lookup
  for (const intervals of Object.values(busyMap)) {
    intervals.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  const durationEnd = (start: Date): Date => new Date(start.getTime() + durationMs);

  // Try to find next free slot
  while (candidate < limitDate) {
    const endCandidate = durationEnd(candidate);
    let freeCount = 0;
    const blockingEnds: Date[] = [];

    for (const sid of setupIds) {
      const intervals = busyMap[sid] ?? [];
      let blocked = false;

      for (const iv of intervals) {
        // Check overlap
        if (candidate < iv.end && endCandidate > iv.start) {
          blocked = true;
          blockingEnds.push(iv.end);
          break;
        }
        if (iv.start > endCandidate) break; // early exit optimization
      }

      if (!blocked) freeCount++;
      if (freeCount >= slotsRequested) break;
    }

    // If enough free setups found
    if (freeCount >= slotsRequested) return candidate;

    // Otherwise, jump to the earliest blocking end time + 1 minute
    if (!blockingEnds.length) break;
    const earliestRelease = new Date(Math.min(...blockingEnds.map((d) => d.getTime())));
    candidate = new Date(earliestRelease.getTime() + 60 * 1000);
  }

  return null; // no availability found
}
