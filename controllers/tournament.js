const Tournament = require("../models/Tournament");

module.exports.renderTournamentRegisterFrom = (req, res) => {
  res.render("tournament/tournament.ejs");
};

module.exports.tournamentTeamRegister = async (req, res) => {
  try {
    const { teamName, captainName, captainEmail, captainPhone, members } =
      req.body;

    const newTournament = new Tournament({
      teamName,
      captainName,
      captainEmail,
      captainPhone,
      members,
    });

    await newTournament.save();

    req.flash("success", "Team registered successfully in the Tournament!");
    res.redirect("/tournament/list");
  } catch (err) {
    console.error("Tournament Registration Error:", err);
    req.flash("error", "Sorry, some error occurred. Please try again later.");
    res.redirect("/tournament");
  }
};

module.exports.tournamentTeamsList = async (req, res) => {
  try {
    const teams = await Tournament.find();
    res.render("tournament/tournamentList.ejs", { teams });
  } catch (err) {
    console.error("Fetching Teams Error:", err);
    req.flash("error", "Something went wrong while fetching teams.");
    res.redirect("/tournament/list");
  }
};
