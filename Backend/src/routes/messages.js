const express = require("express");
const { serializeMessage } = require("../lib/serializers");
const { markDmThreadRead } = require("../services/dmReadStateService");
const { markChannelRead } = require("../services/channelReadStateService");

function createMessagesRouter({ prisma, io, requireAuth }) {
  const router = express.Router();

  router.post("/", requireAuth, async (req, res) => {
    try {
      const { channelId, threadId, content, attachments = [] } = req.body ?? {};
      const trimmedContent = typeof content === "string" ? content.trim() : "";
      const preparedAttachments = Array.isArray(attachments)
        ? attachments
            .filter(
              (attachment) =>
                attachment &&
                typeof attachment.dataUrl === "string" &&
                typeof attachment.fileName === "string"
            )
            .slice(0, 4)
        : [];

      if ((!channelId && !threadId) || (channelId && threadId)) {
        return res.status(400).json({ error: "Provide either channelId or threadId" });
      }

      if (!trimmedContent && preparedAttachments.length === 0) {
        return res.status(400).json({ error: "Either content or attachments are required" });
      }

      if (channelId) {
        const channel = await prisma.channel.findUnique({
          where: { id: channelId },
        });

        if (!channel) {
          return res.status(404).json({ error: "Channel not found" });
        }

        const membership = await prisma.guildMember.findUnique({
          where: {
            guildId_userId: {
              guildId: channel.guildId,
              userId: req.user.id,
            },
          },
        });

        if (!membership) {
          return res.status(403).json({ error: "You are not a member of this server" });
        }
      }

      if (threadId) {
        const thread = await prisma.directMessageThread.findFirst({
          where: {
            id: threadId,
            participants: {
              some: {
                userId: req.user.id,
              },
            },
          },
        });

        if (!thread) {
          return res.status(404).json({ error: "Direct message thread not found" });
        }
      }

      const message = await prisma.message.create({
        data: {
          channelId: channelId || null,
          threadId: threadId || null,
          authorId: req.user.id,
          content: trimmedContent,
          attachments: preparedAttachments.length
            ? {
                create: preparedAttachments.map((attachment) => ({
                  url: attachment.dataUrl,
                  fileName: attachment.fileName,
                  mimeType: attachment.mimeType || null,
                  sizeBytes: attachment.sizeBytes || null,
                })),
              }
            : undefined,
        },
        include: {
          author: true,
          attachments: true,
        },
      });

      if (threadId) {
        await prisma.directMessageThread.update({
          where: { id: threadId },
          data: { updatedAt: new Date() },
        });

        await markDmThreadRead(prisma, threadId, req.user.id, message);
      }

      const serializedMessage = serializeMessage(message);

      if (channelId) {
        io.to(`channel:${channelId}`).emit("message:new", serializedMessage);
      }

      if (threadId) {
        io.to(`thread:${threadId}`).emit("message:new", serializedMessage);
      }

      res.status(201).json(serializedMessage);
    } catch (error) {
      console.error("Failed to create message:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.post("/channels/:channelId/read", requireAuth, async (req, res) => {
    try {
      const channelId = typeof req.params?.channelId === "string" ? req.params.channelId : "";

      if (!channelId) {
        return res.status(400).json({ error: "channelId is required" });
      }

      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
      });

      if (!channel) {
        return res.status(404).json({ error: "Channel not found" });
      }

      const membership = await prisma.guildMember.findUnique({
        where: {
          guildId_userId: {
            guildId: channel.guildId,
            userId: req.user.id,
          },
        },
      });

      if (!membership) {
        return res.status(403).json({ error: "You are not a member of this server" });
      }

      const latestMessage = await prisma.message.findFirst({
        where: { channelId },
        orderBy: { createdAt: "desc" },
      });

      await markChannelRead(prisma, channelId, req.user.id, latestMessage);
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to mark channel as read:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}

module.exports = {
  createMessagesRouter,
};
