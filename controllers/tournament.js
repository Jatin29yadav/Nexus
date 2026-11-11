const Tournament = require("../models/Tournament");

// SEC-02: rosters (player names, in-game ids, phone numbers) and captain ids
// are served to admins only. Everyone else gets what the public pages read.
const forCaller = (tournament, user) => {
  if (user && user.role === "Admin") return tournament;
  const view = tournament.toObject();
  view.registeredTeams = view.registeredTeams.map(({ _id, teamName, status }) => ({
    _id,
    teamName,
    status,
  }));
  return view;
};

module.exports.createTournament = async (req, res) => {
  try {
    const { title, game, description, eventTime, maxTeams } = req.body;

    const newTournament = new Tournament({
      title,
      game,
      description,
      eventTime,
      maxTeams,
    });

    await newTournament.save();
    return res.status(201).json({ success: true, tournament: newTournament });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Error creating tournament" });
  }
};

module.exports.getTournamentById = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.tournamentId);
    if (!tournament) {
      return res
        .status(404)
        .json({ success: false, message: "Tournament not found" });
    }
    return res
      .status(200)
      .json({ success: true, tournament: forCaller(tournament, req.user) });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Error fetching tournament details" });
  }
};

module.exports.getAllTournaments = async (req, res) => {
  try {
    const tournaments = await Tournament.find().sort({ "eventTime.start": 1 });
    return res.status(200).json({
      success: true,
      tournaments: tournaments.map((t) => forCaller(t, req.user)),
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Error fetching tournaments" });
  }
};

module.exports.registerTeam = async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { teamName, players } = req.body;

    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) {
      return res
        .status(404)
        .json({ success: false, message: "Tournament not found" });
    }

    if (tournament.registeredTeams.length >= tournament.maxTeams) {
      return res
        .status(400)
        .json({ success: false, message: "Tournament is full" });
    }

    const existingTeam = tournament.registeredTeams.find(
      (t) =>
        t.captain.toString() === req.user._id.toString() ||
        t.teamName === teamName,
    );

    if (existingTeam) {
      return res.status(400).json({
        success: false,
        message: "You or this team name are already registered",
      });
    }

    const newTeam = {
      teamName,
      captain: req.user._id,
      players,
    };

    tournament.registeredTeams.push(newTeam);

    const savedTournament = await tournament.save();
    const registeredTeam =
      savedTournament.registeredTeams[
        savedTournament.registeredTeams.length - 1
      ];

    return res.status(201).json({
      success: true,
      message: "Team registered successfully",
      team: registeredTeam,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Error registering team" });
  }
};

// UPDATE OR REJECT: Approve or Delete a Registered Team
module.exports.updateTeamStatus = async (req, res) => {
  try {
    const { tournamentId, teamId } = req.params;
    const { status } = req.body; // "Approved" or "Rejected"

    const tournament = await Tournament.findById(tournamentId);
    if (!tournament)
      return res
        .status(404)
        .json({ success: false, message: "Tournament not found" });

    const team = tournament.registeredTeams.id(teamId);
    if (!team)
      return res
        .status(404)
        .json({
          success: false,
          message: "Squad not found in this tournament.",
        });

    if (status === "Rejected") {
      tournament.registeredTeams.pull(teamId); // Removes the subdocument from array
      await tournament.save();

      return res.status(200).json({
        success: true,
        message: "Squad rejected and removed from roster.",
        action: "deleted",
      });
    }

    // If Approved, just update the status
    team.status = status;
    await tournament.save();

    return res.status(200).json({
      success: true,
      message: `Squad ${status} successfully!`,
      team,
      action: "updated",
    });
  } catch (error) {
    console.error("Status Update Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to process squad." });
  }
};

module.exports.deleteTournament = async (req, res) => {
  try {
    const { tournamentId } = req.params;

    const tournament = await Tournament.findByIdAndDelete(tournamentId);

    if (!tournament) {
      return res
        .status(404)
        .json({ success: false, message: "Tournament not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Tournament deleted successfully. All time slots are now free!",
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Error deleting tournament" });
  }
};

module.exports.updateTournament = async (req, res) => {
  try {
    // req.body was validated by updateTournamentSchema: known fields only.
    const updatedTournament = await Tournament.findByIdAndUpdate(
      req.params.tournamentId,
      { $set: req.body },
      { new: true, runValidators: true },
    );

    if (!updatedTournament) {
      return res
        .status(404)
        .json({ success: false, message: "Tournament not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Tournament updated successfully!",
      tournament: updatedTournament,
    });
  } catch (error) {
    console.error("Update Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error updating tournament details." });
  }
};
