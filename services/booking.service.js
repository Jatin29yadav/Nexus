const mongoose = require("mongoose");
const Booking = require("../models/booking.model");
const Setup = require("../models/setup.model");

async function findAvailableSetups({
  bookingStart,
  bookingEnd,
  type,
  excludeSetupIds = [],
}) {
  // Step 1: get all active setups of type
  const allSetups = await Setup.find({ type, isActive: true }).lean();

  // If no setups at all
  if (!allSetups.length) return [];

  const allIds = allSetups.map((s) => s._id);

  // Step 2: find bookings that overlap the required time and involve those setups
  const overlappingBookings = await Booking.find({
    setupIds: { $in: allIds },
    $or: [
      {
        "bookingTime.start": { $lt: bookingEnd },
        "bookingTime.end": { $gt: bookingStart },
      },
    ],
    status: { $ne: "cancelled" }, // ignore cancelled bookings
  }).lean();

  // Mark busy setup ids
  const busySetupIds = new Set();
  for (const b of overlappingBookings) {
    (b.setupIds || []).forEach((id) => busySetupIds.add(String(id)));
  }

  // Filter free setups
  const freeSetups = allSetups.filter(
    (s) =>
      !busySetupIds.has(String(s._id)) &&
      !excludeSetupIds.includes(String(s._id))
  );

  return freeSetups;
}

async function allocateSetups({
  bookingStart,
  bookingEnd,
  type,
  slotsRequested,
  setupPreference = [],
}) {
  // 1) If user gave preferences, check those first (ensure they're free)
  if (Array.isArray(setupPreference) && setupPreference.length) {
    const prefSetups = await Setup.find({
      _id: { $in: setupPreference },
      type,
      isActive: true,
    }).lean();
    const prefIds = prefSetups.map((s) => String(s._id));

    const freePref = await findAvailableSetups({
      bookingStart,
      bookingEnd,
      type,
      excludeSetupIds: [],
    });
    const freePrefIdsSet = new Set(freePref.map((s) => String(s._id)));
    const allocatedFromPref = prefIds
      .filter((id) => freePrefIdsSet.has(id))
      .slice(0, slotsRequested);

    if (allocatedFromPref.length === slotsRequested) return allocatedFromPref;
    // else fall through to allocate remaining from pool (allow partial)
    const remaining = slotsRequested - allocatedFromPref.length;
    const otherFree = freePref
      .filter((s) => !allocatedFromPref.includes(String(s._id)))
      .map((s) => String(s._id));
    const fill = otherFree.slice(0, remaining);
    return allocatedFromPref.concat(fill);
  }

  // 2) Normal allocation
  const freeSetups = await findAvailableSetups({
    bookingStart,
    bookingEnd,
    type,
  });
  if (freeSetups.length < slotsRequested) return [];
  // pick first N
  return freeSetups.slice(0, slotsRequested).map((s) => String(s._id));
}

async function findNextAvailableStart({
  requestedStart,
  durationMs,
  type,
  slotsRequested,
  searchLimitHours = 168,
}) {
  const limitDate = new Date(
    requestedStart.getTime() + searchLimitHours * 3600 * 1000
  ); // e.g., search up to 1 week by default
  let candidate = new Date(requestedStart);

  const setups = await Setup.find({ type, isActive: true }).lean();
  if (!setups.length) return null;

  const setupIds = setups.map((s) => String(s._id));

  // fetch relevant bookings for these setups within the search window
  const bookings = await Booking.find({
    setupIds: { $in: setupIds },
    // bookings that overlap [requestedStart, limitDate + duration]
    $or: [
      {
        "bookingTime.start": {
          $lt: new Date(limitDate.getTime() + durationMs),
        },
        "bookingTime.end": { $gt: requestedStart },
      },
    ],
    status: { $ne: "cancelled" },
  }).lean();

  // map each setupId to sorted busy intervals
  const busyMap = {};
  for (const s of setupIds) busyMap[s] = [];
  for (const b of bookings) {
    for (const sid of b.setupIds) {
      const sidStr = String(sid);
      if (!busyMap[sidStr]) busyMap[sidStr] = [];
      busyMap[sidStr].push({
        start: new Date(b.bookingTime.start),
        end: new Date(b.bookingTime.end),
      });
    }
  }
  for (const sid of Object.keys(busyMap)) {
    busyMap[sid].sort((a, b) => a.start - b.start);
  }

  const durationEnd = (start) => new Date(start.getTime() + durationMs);

  // Loop until we reach limitDate
  while (candidate < limitDate) {
    // Count setups that are free for [candidate, candidate+duration]
    const endCandidate = durationEnd(candidate);
    let freeCount = 0;
    const blockingEnds = [];

    for (const sid of setupIds) {
      const intervals = busyMap[sid];
      // check whether any interval overlaps [candidate, endCandidate)
      let blocked = false;
      for (const iv of intervals) {
        if (candidate < iv.end && endCandidate > iv.start) {
          blocked = true;
          blockingEnds.push(iv.end); // candidate must jump at least to this end
          break;
        }
        // since intervals sorted, break early optimization
        if (iv.start > endCandidate) break;
      }
      if (!blocked) freeCount++;
      if (freeCount >= slotsRequested) break;
    }

    if (freeCount >= slotsRequested) return candidate; // found
    // not enough free setups -> move candidate to earliest blocking end (min of blockingEnds) + small epsilon (1 minute)
    if (!blockingEnds.length) break; // nothing blocking but insufficient setups? then no solution
    const earliestRelease = new Date(
      Math.min(...blockingEnds.map((d) => d.getTime()))
    );
    // Move candidate forward a bit (e.g., 1 minute) after earliestRelease
    candidate = new Date(earliestRelease.getTime() + 60 * 1000);
  }

  return null; // no available within search window
}

module.exports = {
  findAvailableSetups,
  allocateSetups,
  findNextAvailableStart,
};
