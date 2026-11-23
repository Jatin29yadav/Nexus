import { Station } from "../models/Station";
import type { ApiHandler } from "../types/api";

export const getAllStations: ApiHandler = async (req, res) => {
  try {
    // SEC-22: public endpoint. Only what the seat map reads; never who holds
    // a station or which booking it belongs to.
    const stations = await Station.find()
      .select("stationId type status")
      .sort({ stationId: 1 })
      .lean();

    return res.status(200).json({ success: true, stations });
  } catch {
    return res
      .status(500)
      .json({ success: false, message: "Error loading seat map data" });
  }
};
