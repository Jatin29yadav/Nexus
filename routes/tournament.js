const express = require("express");
const router = express.Router();
const Tournament = require("../models/Tournament");

const tournamentController = require("../controllers/tournament");

router
  .route("/")
  .get(tournamentController.renderTournamentRegisterFrom)
  .post(tournamentController.tournamentTeamRegister);

router.route("/list").get(tournamentController.tournamentTeamsList);

module.exports = router;
