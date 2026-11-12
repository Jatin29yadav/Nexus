const express = require("express");
const router = express.Router();
const {
  createTournament,
  getAllTournaments,
  getTournamentById,
  updateTournament,
  registerTeam,
  updateTeamStatus,
  deleteTournament,
} = require("../controllers/tournament");
const { isLoggedIn, isAdmin, optionalAuth } = require("../middleware");
const { validate } = require("../utils/validate");
const { validateObjectId } = require("../utils/validateObjectId");
const {
  createTournamentSchema,
  updateTournamentSchema,
  teamRegistrationSchema,
  teamStatusSchema,
} = require("../validations/zodSchemas");

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

module.exports = router;
