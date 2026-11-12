const express = require("express");
const router = express.Router();
const { getAllStations } = require("../controllers/station");

router.get("/", getAllStations);

module.exports = router;
