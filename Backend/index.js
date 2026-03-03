const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

function formatTime(value) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

app.get("/api/bootstrap", async (req, res) => {
  try {
    const currentUser =
      (await prisma.user.findUnique({
        where: { id: "u-andri" },
      })) ||
      (await prisma.user.findFirst({
        orderBy: { createdAt: "asc" },
      }));

    if (!currentUser) {
      return res.status(404).json({
        error: "No users found. Run `npm run db:seed` in Backend first.",
      });
    }

    const guilds = await prisma.guild.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        channels: {
          orderBy: { position: "asc" },
        },
      },
    });

    const activeGuild = guilds[0] || null;
    const serverChannels = (activeGuild?.channels || []).filter(
      (channel) => !channel.name.startsWith("dm-")
    );
    const activeServerChannel = serverChannels[0] || null;

    const serverMessagesRaw = activeServerChannel
      ? await prisma.message.findMany({
          where: { channelId: activeServerChannel.id },
          orderBy: { createdAt: "asc" },
          include: {
            author: true,
            attachments: true,
          },
        })
      : [];

    const serverMembersRaw = activeGuild
      ? await prisma.guildMember.findMany({
          where: { guildId: activeGuild.id },
          include: { user: true },
          orderBy: { joinedAt: "asc" },
        })
      : [];

    const dmThreads = await prisma.directMessageThread.findMany({
      include: {
        participants: {
          include: { user: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const activeDmThread = dmThreads[0] || null;
    const dmPartner =
      activeDmThread?.participants.find(
        (participant) => participant.userId !== currentUser.id
      )?.user || null;

    const dmChannel =
      activeGuild && dmPartner
        ? await prisma.channel.findFirst({
            where: {
              guildId: activeGuild.id,
              name: `dm-${dmPartner.username}`,
            },
          })
        : null;

    const dmMessagesRaw = dmChannel
      ? await prisma.message.findMany({
          where: { channelId: dmChannel.id },
          orderBy: { createdAt: "asc" },
          include: {
            author: true,
            attachments: true,
          },
        })
      : [];

    const statusMap = {
      "u-andri": "online",
      "u-luna": "online",
      "u-kai": "idle",
      "u-mira": "online",
      "u-zen": "offline",
    };

    const roleMap = {
      "u-andri": "Admin",
      "u-luna": "Moderator",
      "u-kai": "Member",
      "u-mira": "Member",
      "u-zen": "Member",
    };

    const payload = {
      currentUser: {
        id: currentUser.id,
        username: currentUser.username,
        tag: `@${currentUser.username}`,
      },
      guilds: guilds.map((guild, index) => ({
        id: guild.id,
        name: guild.name,
        abbr: guild.name.slice(0, 2).toUpperCase(),
        badge: index % 2 === 0 ? 0 : 3,
      })),
      activeGuildName: activeGuild?.name || "No Server",
      serverChannels: serverChannels.map((channel, index) => ({
        id: channel.id,
        name: channel.name,
        unread: index === 0 ? 0 : 1,
        active: channel.id === activeServerChannel?.id,
      })),
      serverMessages: serverMessagesRaw.map((message) => ({
        id: message.id,
        user: message.author.username,
        time: formatTime(message.createdAt),
        text: message.content,
        media: message.attachments[0]?.url || null,
      })),
      serverMembers: serverMembersRaw.map((member) => ({
        id: member.user.id,
        name: member.nickname || member.user.username,
        role: roleMap[member.user.id] || "Member",
        status: statusMap[member.user.id] || "offline",
      })),
      dmList: dmThreads.map((thread) => {
        const partner = thread.participants.find(
          (participant) => participant.userId !== currentUser.id
        )?.user;
        return {
          id: thread.id,
          name: partner?.username || "Group Chat",
          subtitle: partner ? "Direct Message" : "Group",
          status: partner ? statusMap[partner.id] || "offline" : "online",
          active: thread.id === activeDmThread?.id,
        };
      }),
      dmTitle: dmPartner ? dmPartner.username : "Direct Messages",
      dmMessages: dmMessagesRaw.map((message) => ({
        id: message.id,
        user: message.author.username,
        time: formatTime(message.createdAt),
        text: message.content,
        media: message.attachments[0]?.url || null,
      })),
      dmMembers: (activeDmThread?.participants || []).map((participant) => ({
        id: participant.user.id,
        name: participant.user.username,
        status: statusMap[participant.user.id] || "offline",
      })),
    };

    res.json(payload);
  } catch (error) {
    console.error("Failed to build bootstrap payload:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`Backend API listening on http://localhost:${port}`);
});
