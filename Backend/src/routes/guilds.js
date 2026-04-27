const express = require("express");
const { buildGuildBadge } = require("../lib/presence");

function createGuildsRouter({ prisma, requireAuth }) {
  const router = express.Router();

  router.post("/", requireAuth, async (req, res) => {
    try {
      const rawName = typeof req.body?.name === "string" ? req.body.name.trim() : "";

      if (rawName.length < 2) {
        return res.status(400).json({ error: "Server name must be at least 2 characters" });
      }

      const name = rawName.slice(0, 40);
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "chat";

      const guild = await prisma.guild.create({
        data: {
          name,
          ownerId: req.user.id,
          members: {
            create: {
              userId: req.user.id,
              nickname: req.user.username,
            },
          },
          channels: {
            create: [
              {
                name: "general",
                position: 0,
              },
              {
                name: "announcements",
                type: "ANNOUNCEMENT",
                position: 1,
              },
              {
                name: `${slug}-chat`,
                position: 2,
              },
            ],
          },
        },
        include: {
          channels: {
            orderBy: { position: "asc" },
          },
        },
      });

      res.status(201).json({
        guild: {
          id: guild.id,
          name: guild.name,
          abbr: guild.name.slice(0, 2).toUpperCase(),
          badge: buildGuildBadge(0),
          active: true,
        },
        activeGuildId: guild.id,
        activeServerChannelId: guild.channels[0]?.id || null,
      });
    } catch (error) {
      console.error("Failed to create guild:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.post("/:guildId/channels", requireAuth, async (req, res) => {
    try {
      const guildId = typeof req.params.guildId === "string" ? req.params.guildId : "";
      const rawName = typeof req.body?.name === "string" ? req.body.name.trim() : "";

      if (!guildId) {
        return res.status(400).json({ error: "Guild id is required" });
      }

      if (rawName.length < 2) {
        return res.status(400).json({ error: "Channel name must be at least 2 characters" });
      }

      const membership = await prisma.guildMember.findUnique({
        where: {
          guildId_userId: {
            guildId,
            userId: req.user.id,
          },
        },
      });

      if (!membership) {
        return res.status(403).json({ error: "You are not a member of this server" });
      }

      const name = rawName
        .slice(0, 40)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      if (!name) {
        return res.status(400).json({ error: "Channel name must contain letters or numbers" });
      }

      const existingChannel = await prisma.channel.findFirst({
        where: {
          guildId,
          name,
        },
      });

      if (existingChannel) {
        return res.status(409).json({ error: "A channel with that name already exists" });
      }

      const lastChannel = await prisma.channel.findFirst({
        where: { guildId },
        orderBy: { position: "desc" },
      });

      const channel = await prisma.channel.create({
        data: {
          guildId,
          name,
          position: lastChannel ? lastChannel.position + 1 : 0,
        },
      });

      res.status(201).json({
        channel: {
          id: channel.id,
          name: channel.name,
        },
      });
    } catch (error) {
      console.error("Failed to create channel:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}

module.exports = {
  createGuildsRouter,
};
