const joi = require("joi");

//Message Schema
const messageSchema = joi.object({
  message: joi
    .object({
      message: joi.string().required().min(10),
    })
    .required(),
});

//Tournament Schema
const tournamentSchema = joi.object({
  teamName: joi.string().trim().min(2).max(20).required(),
  captainName: joi.string().trim().min(4).max(30).required(),
  captainEmail: joi.string().email().required(),
  captainPhone: joi
    .string()
    .pattern(/^[0-9]{10}$/)
    .required(),
  members: joi
    .array()
    .items(joi.string().trim().min(4).max(30))
    .min(1)
    .max(6)
    .required(),
});

module.exports = { messageSchema, tournamentSchema };
