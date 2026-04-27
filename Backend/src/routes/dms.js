const express = require("express");
const { areUsersFriends } = require("../services/friendService");
const { markDmThreadRead } = require("../services/dmReadStateService");

function createDirectMessagesRouter({ prisma, requireAuth }) {
  const router = express.Router();

  router.post("/", requireAuth, async (req, res) => {
    try {
      const friendUserId = typeof req.body?.friendUserId === "string" ? req.body.friendUserId : "";

      if (!friendUserId) {
        return res.status(400).json({ error: "friendUserId is required" });
      }

      if (friendUserId === req.user.id) {
        return res.status(400).json({ error: "Cannot create a DM with yourself" });
      }

      const friend = await prisma.user.findUnique({
        where: { id: friendUserId },
      });

      if (!friend) {
        return res.status(404).json({ error: "Friend not found" });
      }

      const isFriend = await areUsersFriends(prisma, req.user.id, friendUserId);

      if (!isFriend) {
        return res.status(403).json({ error: "You can only DM accepted friends" });
      }

      const existingThread = await prisma.directMessageThread.findFirst({
        where: {
          AND: [
            { participants: { some: { userId: req.user.id } } },
            { participants: { some: { userId: friendUserId } } },
          ],
        },
        include: {
          participants: true,
        },
      });

      if (existingThread) {
        return res.json({ threadId: existingThread.id });
      }

      const thread = await prisma.directMessageThread.create({
        data: {
          participants: {
            create: [{ userId: req.user.id }, { userId: friendUserId }],
          },
        },
      });

      res.status(201).json({ threadId: thread.id });
    } catch (error) {
      console.error("Failed to create DM thread:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.post("/:threadId/read", requireAuth, async (req, res) => {
    try {
      const threadId = typeof req.params?.threadId === "string" ? req.params.threadId : "";

      if (!threadId) {
        return res.status(400).json({ error: "threadId is required" });
      }

      const thread = await prisma.directMessageThread.findFirst({
        where: {
          id: threadId,
          participants: {
            some: {
              userId: req.user.id,
            },
          },
        },
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

      if (!thread) {
        return res.status(404).json({ error: "Direct message thread not found" });
      }

      await markDmThreadRead(prisma, threadId, req.user.id, thread.messages[0] || null);
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to mark DM as read:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}

module.exports = {
  createDirectMessagesRouter,
};
