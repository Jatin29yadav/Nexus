import { Router } from "express";
import * as chatController from "../controllers/chat";
import { isLoggedIn, isAdmin } from "../middleware";
import { chatTicketLimiter } from "../config/rateLimits";
import { validateObjectId } from "../utils/validateObjectId";
import { validate } from "../utils/validate";
import { chatMuteSchema } from "../validations/zodSchemas";

export const chatRouter = Router();
const router = chatRouter;

router.param("roomId", validateObjectId);
router.param("messageId", validateObjectId);
router.param("userId", validateObjectId);

router.post("/ticket", isLoggedIn, chatTicketLimiter, chatController.createTicket);
router.get("/rooms", chatController.getRooms);
router.get("/rooms/:roomId/messages", isLoggedIn, chatController.getRoomMessages);
router.delete("/messages/:messageId", isLoggedIn, chatController.removeMessage);
router.put(
  "/users/:userId/mute",
  isLoggedIn,
  isAdmin,
  validate({ body: chatMuteSchema }),
  chatController.muteUser,
);
