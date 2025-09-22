const joi = require("joi");

//Message Schema
const messageSchema = joi.object({
  message: joi
    .object({
      name: joi.string().required().min(3).max(25),
      email: joi.string().email().trim().required(),
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

//Booking Schema
const bookingSchema = joi.object({
  name: joi.string().trim().min(3).max(25).required(),
  email: joi.string().email().required(),
  phone: joi
    .string()
    .pattern(/^[0-9]{10}$/)
    .required(),
  membersCount: joi.number().integer().min(1).max(20).default(1).required(),
  membersName: joi
    .array()
    .items(joi.string().trim().min(4).max(30))
    .min(1)
    .max(20)
    .required(),
  bookingType: joi.string().valid("PC", "VR").required(),
  bookingTime: joi
    .object({
      start: joi.date().required(),
      end: joi
        .date()
        .required()
        .greater(joi.ref("start"))
        .custom((value, helpers) => {
          const start = new Date(helpers.state.ancestors[0].start);
          const diffMs = new Date(value) - start;
          const diffHrs = diffMs / (1000 * 60 * 60);
          if (diffHrs < 1 || diffHrs > 8) {
            return helpers.error("any.invalid", {
              message: "Booking length must be between 1 and 8 hours",
            });
          }
          return value;
        }, "duration check"),
    })
    .required(),
});

module.exports = { messageSchema, tournamentSchema, bookingSchema };
