const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const PASSWORD_SECRET = process.env.PASSWORD_SECRET || "discordmaybe-password-secret";

function createPasswordHash(password) {
  return crypto.scryptSync(password, PASSWORD_SECRET, 64).toString("hex");
}

async function main() {
  await prisma.messageAttachment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.readState.deleteMany();
  await prisma.permissionOverwrite.deleteMany();
  await prisma.role.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.guildMember.deleteMany();
  await prisma.directMessage.deleteMany();
  await prisma.directMessageThread.deleteMany();
  await prisma.guild.deleteMany();
  await prisma.user.deleteMany();

  const users = await prisma.$transaction([
    prisma.user.create({
      data: {
        id: "u-andri",
        username: "andri",
        email: "andri@example.com",
        passwordHash: createPasswordHash("andri123"),
        avatarUrl: null,
      },
    }),
    prisma.user.create({
      data: {
        id: "u-luna",
        username: "luna",
        email: "luna@example.com",
        passwordHash: createPasswordHash("luna123"),
      },
    }),
    prisma.user.create({
      data: {
        id: "u-kai",
        username: "kai",
        email: "kai@example.com",
        passwordHash: createPasswordHash("kai123"),
      },
    }),
    prisma.user.create({
      data: {
        id: "u-mira",
        username: "mira",
        email: "mira@example.com",
        passwordHash: createPasswordHash("mira123"),
      },
    }),
    prisma.user.create({
      data: {
        id: "u-zen",
        username: "zen",
        email: "zen@example.com",
        passwordHash: createPasswordHash("zen123"),
      },
    }),
  ]);

  const guild = await prisma.guild.create({
    data: {
      id: "g-maybe",
      name: "DiscordMaybe",
      ownerId: "u-andri",
      iconUrl: null,
    },
  });

  await prisma.guildMember.createMany({
    data: users.map((user) => ({
      guildId: guild.id,
      userId: user.id,
      nickname: user.id === "u-andri" ? "andri" : null,
    })),
  });

  await prisma.role.createMany({
    data: [
      {
        id: "r-admin",
        guildId: guild.id,
        name: "Admin",
        color: "#f04747",
        position: 2,
        permissions: 1024n,
      },
      {
        id: "r-mod",
        guildId: guild.id,
        name: "Moderator",
        color: "#5865f2",
        position: 1,
        permissions: 256n,
      },
      {
        id: "r-member",
        guildId: guild.id,
        name: "Member",
        color: "#57f287",
        position: 0,
        permissions: 64n,
      },
    ],
  });

  await prisma.$transaction([
    prisma.channel.create({
      data: {
        id: "c-general",
        guildId: guild.id,
        name: "general",
        position: 0,
      },
    }),
    prisma.channel.create({
      data: {
        id: "c-announcements",
        guildId: guild.id,
        name: "announcements",
        type: "ANNOUNCEMENT",
        position: 1,
      },
    }),
    prisma.channel.create({
      data: {
        id: "c-fan-art",
        guildId: guild.id,
        name: "fan-art",
        position: 2,
      },
    }),
    prisma.channel.create({
      data: {
        id: "c-dm-luna",
        guildId: guild.id,
        name: "dm-luna",
        position: 3,
      },
    }),
  ]);

  await prisma.permissionOverwrite.create({
    data: {
      id: "po-general-member",
      channelId: "c-general",
      roleId: "r-member",
      allowBits: 64n,
      denyBits: 0n,
    },
  });

  await prisma.message.createMany({
    data: [
      {
        id: "m-1",
        channelId: "c-general",
        authorId: "u-luna",
        content: "Yehhaw",
      },
      {
        id: "m-2",
        channelId: "c-general",
        authorId: "u-kai",
        content: "Habahow",
      },
      {
        id: "m-3",
        channelId: "c-general",
        authorId: "u-andri",
        content: "Yes",
      },
    ],
  });

  const dmThread = await prisma.directMessageThread.create({
    data: { id: "dm-thread-1" },
  });

  await prisma.directMessage.createMany({
    data: [
      { id: "dm-user-1", threadId: dmThread.id, userId: "u-andri" },
      { id: "dm-user-2", threadId: dmThread.id, userId: "u-luna" },
    ],
  });

  await prisma.message.create({
    data: {
      id: "m-dm-1",
      channelId: "c-dm-luna",
      authorId: "u-luna",
      content: "Pics",
      attachments: {
        create: {
          id: "att-1",
          url: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1100&q=80",
          fileName: "mountain.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 245120,
        },
      },
    },
  });

  await prisma.readState.createMany({
    data: [
      {
        id: "rs-andri-general",
        userId: "u-andri",
        channelId: "c-general",
        lastMessageId: "m-3",
      },
      {
        id: "rs-luna-general",
        userId: "u-luna",
        channelId: "c-general",
        lastMessageId: "m-2",
      },
    ],
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Seeding failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
