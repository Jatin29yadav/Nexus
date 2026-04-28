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
const { isLoggedIn, isAdmin } = require("../middleware");

router.get("/", getAllTournaments);
router.get("/:tournamentId", getTournamentById);
router.post("/", isLoggedIn, isAdmin, createTournament);
router.post("/:tournamentId/register", isLoggedIn, registerTeam);
router.put("/:tournamentId", isLoggedIn, isAdmin, updateTournament);
router.put(
  "/:tournamentId/team/:teamId/status",
  isLoggedIn,
  isAdmin,
  updateTeamStatus,
);
router.delete("/:tournamentId", isLoggedIn, isAdmin, deleteTournament);

module.exports = router;
