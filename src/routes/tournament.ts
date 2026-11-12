import { Router } from "express";
import {
  createTournament,
  getAllTournaments,
  getTournamentById,
  updateTournament,
  registerTeam,
  updateTeamStatus,
  deleteTournament,
} from "../controllers/tournament";
import { isLoggedIn, isAdmin, optionalAuth } from "../middleware";
import { validate } from "../utils/validate";
import { validateObjectId } from "../utils/validateObjectId";
import {
  createTournamentSchema,
  updateTournamentSchema,
  teamRegistrationSchema,
  teamStatusSchema,
} from "../validations/zodSchemas";

export const tournamentRouter = Router();
const router = tournamentRouter;

router.param("tournamentId", validateObjectId);
router.param("teamId", validateObjectId);

router.get("/", optionalAuth, getAllTournaments);
router.get("/:tournamentId", optionalAuth, getTournamentById);
router.post(
  "/",
  isLoggedIn,
  isAdmin,
  validate({ body: createTournamentSchema }),
  createTournament,
);
router.post(
  "/:tournamentId/register",
  isLoggedIn,
  validate({ body: teamRegistrationSchema }),
  registerTeam,
);
router.put(
  "/:tournamentId",
  isLoggedIn,
  isAdmin,
  validate({ body: updateTournamentSchema }),
  updateTournament,
);
router.put(
  "/:tournamentId/team/:teamId/status",
  isLoggedIn,
  isAdmin,
  validate({ body: teamStatusSchema }),
  updateTeamStatus,
);
router.delete("/:tournamentId", isLoggedIn, isAdmin, deleteTournament);
