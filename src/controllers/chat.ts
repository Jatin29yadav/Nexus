import { User } from "../models/User";
import { currentUser } from "../middleware";
import { CHAT_TICKET_TTL_SECONDS, signChatTicket } from "../utils/authToken";
import { chatHistoryQuerySchema } from "../validations/zodSchemas";
import { deleteMessage, findRoom, historyPage, listRooms } from "../services/chat.service";
import type { ApiHandler, ParamsDictionary } from "../types/api";
import type { ChatMessageParams, ChatMuteBody, ChatRoomParams, ChatUserParams } from "../types/requests";
import { messageOf } from "../utils/narrow";

// A 60 s ticket for the Socket.IO handshake (realtime/auth.ts).
export const createTicket: ApiHandler = async (req, res) => {
  try {
    const user = currentUser(req);
    const ticket = signChatTicket(user._id, user.tokenVersion || 0);
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ success: true, ticket, expiresIn: CHAT_TICKET_TTL_SECONDS });
  } catch (error) {
    console.error("Chat ticket error:", messageOf(error));
    return res.status(500).json({ success: false, message: "Could not start chat." });
  }
};

export const getRooms: ApiHandler = async (req, res) => {
  try {
    return res.status(200).json({ success: true, rooms: await listRooms() });
  } catch (error) {
    console.error("Chat rooms error:", messageOf(error));
    return res.status(500).json({ success: false, message: "Error fetching chat rooms" });
  }
};

export const getRoomMessages: ApiHandler<ChatRoomParams> = async (req, res) => {
  const query = chatHistoryQuerySchema.safeParse(req.query);
  if (!query.success) {
    return res
      .status(400)
      .json({ success: false, message: query.error.issues[0]?.message || "Invalid request." });
  }
  try {
    const room = await findRoom(req.params.roomId);
    if (!room) return res.status(404).json({ success: false, message: "Room not found." });
    const { messages, hasMore } = await historyPage(room._id, query.data.before, query.data.limit);
    return res.status(200).json({ success: true, messages, hasMore });
  } catch (error) {
    console.error("Chat history error:", messageOf(error));
    return res.status(500).json({ success: false, message: "Error fetching messages" });
  }
};

export const removeMessage: ApiHandler<ChatMessageParams> = async (req, res) => {
  try {
    const user = currentUser(req);
    const result = await deleteMessage(req.params.messageId, {
      id: user._id.toString(),
      isAdmin: user.role === "Admin",
    });
    if (result === "not_found") {
      return res.status(404).json({ success: false, message: "Message not found." });
    }
    if (result === "forbidden") {
      return res
        .status(403)
        .json({ success: false, message: "You can only delete your own message within 5 minutes." });
    }
    return res.status(200).json({ success: true, message: "Message deleted." });
  } catch (error) {
    console.error("Chat delete error:", messageOf(error));
    return res.status(500).json({ success: false, message: "Error deleting message" });
  }
};

export const muteUser: ApiHandler<ChatUserParams, ChatMuteBody> = async (req, res) => {
  try {
    const { minutes } = req.body;
    const mutedUntil = minutes > 0 ? new Date(Date.now() + minutes * 60 * 1000) : null;
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { chatMutedUntil: mutedUntil },
      { new: true },
    ).select("_id");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    return res.status(200).json({
      success: true,
      message: mutedUntil ? "User muted." : "User unmuted.",
      mutedUntil: mutedUntil ? mutedUntil.toISOString() : null,
    });
  } catch (error) {
    console.error("Chat mute error:", messageOf(error));
    return res.status(500).json({ success: false, message: "Error updating mute" });
  }
};
