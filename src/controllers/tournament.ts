import mongoose, { type Types } from "mongoose";
import { Tournament, type TournamentDocument } from "../models/Tournament";
import { currentUser } from "../middleware";
import type { UserDocument } from "../models/User";
import type { ITournament } from "../types/domain";
import type { ApiHandler, ParamsDictionary } from "../types/api";
import type {
  CreateTournamentBody,
  TeamParams,
  TeamRegistrationBody,
  TeamStatusBody,
  TournamentParams,
  UpdateTournamentBody,
} from "../types/requests";

// SEC-02: rosters (player names, in-game ids, phone numbers) and captain ids
// are served to admins only. Everyone else gets what the public pages read.
const forCaller = (tournament: TournamentDocument, user: UserDocument | null | undefined) => {
  if (user && user.role === "Admin") return tournament;
  const view = tournament.toObject();
  return {
    ...view,
    registeredTeams: view.registeredTeams.map(({ _id, teamName, status }) => ({
      _id,
      teamName,
      status,
    })),
  };
};

export const createTournament: ApiHandler<ParamsDictionary, CreateTournamentBody> = async (
  req,
  res,
) => {
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
  } catch {
    return res
      .status(500)
      .json({ success: false, message: "Error creating tournament" });
  }
};

export const getTournamentById: ApiHandler<TournamentParams> = async (req, res) => {
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
  } catch {
    return res
      .status(500)
      .json({ success: false, message: "Error fetching tournament details" });
  }
};

export const getAllTournaments: ApiHandler = async (req, res) => {
  try {
    const tournaments = await Tournament.find().sort({ "eventTime.start": 1 });
    return res.status(200).json({
      success: true,
      tournaments: tournaments.map((t) => forCaller(t, req.user)),
    });
  } catch {
    return res
      .status(500)
      .json({ success: false, message: "Error fetching tournaments" });
  }
};

const CLOSED_STATUSES: ITournament["status"][] = ["Completed", "Cancelled"];

// Why a registration cannot go ahead, or null when it can.
const registrationProblem = (
  tournament: Pick<ITournament, "status" | "registeredTeams" | "maxTeams">,
  userId: Types.ObjectId,
  teamName: string,
): string | null => {
  if (CLOSED_STATUSES.includes(tournament.status)) {
    return "Registration is closed for this tournament";
  }
  if (tournament.registeredTeams.length >= tournament.maxTeams) {
    return "Tournament is full";
  }
  const taken = tournament.registeredTeams.some(
    (t) => t.captain.toString() === userId.toString() || t.teamName === teamName,
  );
  return taken ? "You or this team name are already registered" : null;
};

export const registerTeam: ApiHandler<TournamentParams, TeamRegistrationBody> = async (
  req,
  res,
) => {
  try {
    const { tournamentId } = req.params;
    const { teamName, players } = req.body; // validated by teamRegistrationSchema
    const user = currentUser(req);

    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) {
      return res
        .status(404)
        .json({ success: false, message: "Tournament not found" });
    }

    const problem = registrationProblem(tournament, user._id, teamName);
    if (problem) {
      return res.status(400).json({ success: false, message: problem });
    }

    // SEC-18: the checks above are repeated inside the write itself, so two
    // simultaneous requests cannot both pass them (no read-then-write race).
    const updated = await Tournament.findOneAndUpdate(
      {
        _id: tournamentId,
        status: mongoose.trusted({ $nin: CLOSED_STATUSES }),
        "registeredTeams.captain": mongoose.trusted({ $ne: user._id }),
        "registeredTeams.teamName": mongoose.trusted({ $ne: teamName }),
        $expr: mongoose.trusted({ $lt: [{ $size: "$registeredTeams" }, "$maxTeams"] }),
      },
      { $push: { registeredTeams: { teamName, captain: user._id, players } } },
      { new: true, runValidators: true },
    );

    if (!updated) {
      // Lost the race: report what is true now.
      const current = await Tournament.findById(tournamentId);
      const reason = current
        ? registrationProblem(current, user._id, teamName)
        : "Tournament not found";
      return res.status(current ? 400 : 404).json({
        success: false,
        message: reason || "Registration could not be completed. Please try again.",
      });
    }

    const registeredTeam = updated.registeredTeams.find(
      (t) => t.captain.toString() === user._id.toString(),
    );

    return res.status(201).json({
      success: true,
      message: "Team registered successfully",
      team: registeredTeam,
    });
  } catch {
    return res
      .status(500)
      .json({ success: false, message: "Error registering team" });
  }
};

// UPDATE OR REJECT: Approve or Delete a Registered Team
export const updateTeamStatus: ApiHandler<TeamParams, TeamStatusBody> = async (req, res) => {
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

export const deleteTournament: ApiHandler<TournamentParams> = async (req, res) => {
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
  } catch {
    return res
      .status(500)
      .json({ success: false, message: "Error deleting tournament" });
  }
};

export const updateTournament: ApiHandler<TournamentParams, UpdateTournamentBody> = async (
  req,
  res,
) => {
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
