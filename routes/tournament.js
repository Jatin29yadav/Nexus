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
const validate = require("../utils/validate");
const { updateTournamentSchema } = require("../validations/zodSchemas");

router.get("/", optionalAuth, getAllTournaments);
router.get("/:tournamentId", optionalAuth, getTournamentById);
router.post("/", isLoggedIn, isAdmin, createTournament);
router.post("/:tournamentId/register", isLoggedIn, registerTeam);
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
  updateTeamStatus,
);
router.delete("/:tournamentId", isLoggedIn, isAdmin, deleteTournament);

module.exports = router;
