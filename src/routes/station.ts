import { Router } from "express";
import { getAllStations } from "../controllers/station";

export const stationRouter = Router();

stationRouter.get("/", getAllStations);
