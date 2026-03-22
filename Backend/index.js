const express = require("express");
const cors = require("cors");
const http = require("http");
const crypto = require("crypto");
const { Server } = require("socket.io");
const { PrismaClient } = require("@prisma/client");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});
const prisma = new PrismaClient();
const port = process.env.PORT || 3001;
const TOKEN_SECRET = process.env.TOKEN_SECRET || "discordmaybe-dev-secret";
const PASSWORD_SECRET = process.env.PASSWORD_SECRET || "discordmaybe-password-secret";

app.use(cors());
app.use(express.json({ limit: "10mb" }));

function formatTime(value) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function createPasswordHash(password) {
  return crypto.scryptSync(password, PASSWORD_SECRET, 64).toString("hex");
}

function verifyPassword(password, passwordHash) {
  const incomingHash = createPasswordHash(password);
  return crypto.timingSafeEqual(
    Buffer.from(incomingHash, "hex"),
    Buffer.from(passwordHash, "hex")
  );
}

function createToken(userId) {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    })
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", TOKEN_SECRET)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return null;
  }

  const [payload, signature] = token.split(".");
  const expectedSignature = crypto
    .createHmac("sha256", TOKEN_SECRET)
    .update(payload)
    .digest("base64url");

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

    if (!decoded.userId || !decoded.exp || decoded.exp < Date.now()) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

function getTokenFromRequest(req) {
  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length);
}

async function resolveUserFromToken(token) {
  const decoded = verifyToken(token);

  if (!decoded) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: decoded.userId },
  });
}

async function requireAuth(req, res, next) {
  try {
    const user = await resolveUserFromToken(getTokenFromRequest(req));

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Failed to authorize request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

function serializeAuthUser(user) {
  return {
    id: user.id,
    username: user.username,
    tag: `@${user.username}`,
  };
}

function serializeMessage(message) {
  const attachments = (message.attachments || []).map((attachment) => ({
    id: attachment.id,
    url: attachment.url,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
  }));

  return {
    id: message.id,
    user: message.author.username,
    time: formatTime(message.createdAt),
    text: message.content,
    media:
      attachments.find((attachment) => attachment.mimeType?.startsWith("image/"))?.url ||
      null,
    attachments,
    channelId: message.channelId,
  };
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body ?? {};
    const normalizedUsername = typeof username === "string" ? username.trim().toLowerCase() : "";
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!normalizedUsername || !normalizedEmail || typeof password !== "string") {
      return res.status(400).json({ error: "username, email and password are required" });
    }

    if (normalizedUsername.length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ username: normalizedUsername }, { email: normalizedEmail }],
      },
    });

    if (existingUser) {
      return res.status(409).json({ error: "Username or email already exists" });
    }

    const user = await prisma.user.create({
      data: {
        username: normalizedUsername,
        email: normalizedEmail,
        passwordHash: createPasswordHash(password),
      },
    });

    const firstGuild = await prisma.guild.findFirst({
      orderBy: { createdAt: "asc" },
    });

    if (firstGuild) {
      await prisma.guildMember.create({
        data: {
          guildId: firstGuild.id,
          userId: user.id,
          nickname: user.username,
        },
      });
    }

    res.status(201).json({
      token: createToken(user.id),
      user: serializeAuthUser(user),
    });
  } catch (error) {
    console.error("Failed to register user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body ?? {};
    const loginValue =
      typeof emailOrUsername === "string" ? emailOrUsername.trim().toLowerCase() : "";

    if (!loginValue || typeof password !== "string") {
      return res.status(400).json({ error: "email/username and password are required" });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ username: loginValue }, { email: loginValue }],
      },
    });

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    res.json({
      token: createToken(user.id),
      user: serializeAuthUser(user),
    });
  } catch (error) {
    console.error("Failed to login user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/bootstrap", requireAuth, async (req, res) => {
  try {
    const currentUser = req.user;
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
      where: {
        participants: {
          some: {
            userId: currentUser.id,
          },
        },
      },
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

    res.json({
      currentUser: serializeAuthUser(currentUser),
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
      activeServerChannelId: activeServerChannel?.id || null,
      serverMessages: serverMessagesRaw.map(serializeMessage),
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
      activeDmChannelId: dmChannel?.id || null,
      dmMessages: dmMessagesRaw.map(serializeMessage),
      dmMembers: (activeDmThread?.participants || []).map((participant) => ({
        id: participant.user.id,
        name: participant.user.username,
        status: statusMap[participant.user.id] || "offline",
      })),
    });
  } catch (error) {
    console.error("Failed to build bootstrap payload:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/messages", requireAuth, async (req, res) => {
  try {
    const { channelId, content, attachments = [] } = req.body ?? {};
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

    if (!channelId || (!trimmedContent && preparedAttachments.length === 0)) {
      return res
        .status(400)
        .json({ error: "channelId and either content or attachments are required" });
    }

    const message = await prisma.message.create({
      data: {
        channelId,
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

    const serializedMessage = serializeMessage(message);
    io.to(`channel:${channelId}`).emit("message:new", serializedMessage);

    res.status(201).json(serializedMessage);
  } catch (error) {
    console.error("Failed to create message:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

io.on("connection", async (socket) => {
  const user = await resolveUserFromToken(socket.handshake.auth?.token);

  if (!user) {
    socket.disconnect(true);
    return;
  }

  socket.data.userId = user.id;

  socket.on("channel:join", (channelId) => {
    if (typeof channelId === "string" && channelId) {
      socket.join(`channel:${channelId}`);
    }
  });

  socket.on("channel:leave", (channelId) => {
    if (typeof channelId === "string" && channelId) {
      socket.leave(`channel:${channelId}`);
    }
  });
});

server.listen(port, () => {
  console.log(`Backend API listening on http://localhost:${port}`);
});
