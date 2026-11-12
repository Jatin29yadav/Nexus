import { Router } from "express";
import * as messageController from "../controllers/message";
import { isLoggedIn, isAdmin } from "../middleware";
import { contactLimiter } from "../config/rateLimits";
import { validateObjectId } from "../utils/validateObjectId";
import { validate } from "../utils/validate";
import { messageSchema } from "../validations/zodSchemas";

export const messageRouter = Router();
const router = messageRouter;

router.param("id", validateObjectId);

router.post(
  "/",
  contactLimiter,
  validate({ body: messageSchema }),
  messageController.contactMessage,
);

router.get("/", isLoggedIn, isAdmin, messageController.getAllMessages);
router.put("/:id/read", isLoggedIn, isAdmin, messageController.markMessageRead);
router.delete("/:id", isLoggedIn, isAdmin, messageController.deleteMessage);
