const express = require("express");
const { serializeFriendRequest } = require("../lib/serializers");
const { buildPairKey } = require("../services/friendService");

function createFriendsRouter({ prisma, requireAuth }) {
  const router = express.Router();

  router.post("/requests", requireAuth, async (req, res) => {
    try {
      const rawUsername = typeof req.body?.username === "string" ? req.body.username : "";
      const username = rawUsername.trim().toLowerCase();

      if (!username) {
        return res.status(400).json({ error: "Username is required" });
      }

      if (username === req.user.username) {
        return res.status(400).json({ error: "You cannot add yourself" });
      }

      const receiver = await prisma.user.findUnique({
        where: { username },
      });

      if (!receiver) {
        return res.status(404).json({ error: "User not found" });
      }

      const pairKey = buildPairKey(req.user.id, receiver.id);
      const existingRequest = await prisma.friendRequest.findUnique({
        where: { pairKey },
      });

      if (existingRequest?.status === "ACCEPTED") {
        return res.status(409).json({ error: "You are already friends" });
      }

      if (existingRequest?.status === "PENDING") {
        if (existingRequest.senderId === req.user.id) {
          return res.status(409).json({ error: "Friend request already sent" });
        }

        return res
          .status(409)
          .json({ error: "That user already sent you a request. Accept it from the Friends tab." });
      }

      const friendRequest = existingRequest
        ? await prisma.friendRequest.update({
            where: { id: existingRequest.id },
            data: {
              senderId: req.user.id,
              receiverId: receiver.id,
              status: "PENDING",
              respondedAt: null,
            },
            include: {
              sender: true,
              receiver: true,
            },
          })
        : await prisma.friendRequest.create({
            data: {
              senderId: req.user.id,
              receiverId: receiver.id,
              pairKey,
            },
            include: {
              sender: true,
              receiver: true,
            },
          });

      res.status(201).json({
        request: serializeFriendRequest(friendRequest, req.user.id),
      });
    } catch (error) {
      console.error("Failed to send friend request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.post("/requests/:requestId/accept", requireAuth, async (req, res) => {
    try {
      const requestId = typeof req.params.requestId === "string" ? req.params.requestId : "";

      const friendRequest = await prisma.friendRequest.findUnique({
        where: { id: requestId },
      });

      if (!friendRequest || friendRequest.receiverId !== req.user.id) {
        return res.status(404).json({ error: "Friend request not found" });
      }

      if (friendRequest.status === "ACCEPTED") {
        return res.status(409).json({ error: "Friend request already accepted" });
      }

      const updatedRequest = await prisma.friendRequest.update({
        where: { id: requestId },
        data: {
          status: "ACCEPTED",
          respondedAt: new Date(),
        },
        include: {
          sender: true,
          receiver: true,
        },
      });

      res.json({
        request: serializeFriendRequest(updatedRequest, req.user.id),
      });
    } catch (error) {
      console.error("Failed to accept friend request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}

module.exports = {
  createFriendsRouter,
};
