const {
  serializeAuthUser,
  serializeMessage,
  serializeDmThread,
} = require("../lib/serializers");
const { buildGuildBadge, getUserRole, getUserStatus } = require("../lib/presence");
const {
  getAcceptedFriendships,
  getPendingFriendRequests,
  splitPendingRequests,
} = require("./friendService");

async function buildBootstrapPayload(prisma, currentUser, query) {
  const requestedGuildId = typeof query.guildId === "string" ? query.guildId : "";
  const requestedServerChannelId =
    typeof query.serverChannelId === "string" ? query.serverChannelId : "";
  const requestedDmThreadId = typeof query.dmThreadId === "string" ? query.dmThreadId : "";

  const [guilds, dmThreads, acceptedFriends, pendingRequests] = await Promise.all([
    prisma.guild.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        channels: {
          orderBy: { position: "asc" },
        },
      },
    }),
    prisma.directMessageThread.findMany({
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
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            attachments: true,
          },
        },
        readStates: {
          where: {
            userId: currentUser.id,
          },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    getAcceptedFriendships(prisma, currentUser.id),
    getPendingFriendRequests(prisma, currentUser.id),
  ]);

  const activeGuild = guilds.find((guild) => guild.id === requestedGuildId) || guilds[0] || null;
  const serverChannels = (activeGuild?.channels || []).filter(
    (channel) => !channel.name.startsWith("dm-")
  );
  const activeServerChannel =
    serverChannels.find((channel) => channel.id === requestedServerChannelId) ||
    serverChannels[0] ||
    null;
  const serverChannelIds = serverChannels.map((channel) => channel.id);
  const serverReadStates = serverChannelIds.length
    ? await prisma.readState.findMany({
        where: {
          userId: currentUser.id,
          channelId: {
            in: serverChannelIds,
          },
        },
      })
    : [];
  const serverReadStateByChannelId = new Map(
    serverReadStates.map((readState) => [readState.channelId, readState])
  );

  const [serverMessagesRaw, serverMembersRaw] = await Promise.all([
    activeServerChannel
      ? prisma.message.findMany({
          where: { channelId: activeServerChannel.id },
          orderBy: { createdAt: "asc" },
          include: {
            author: true,
            attachments: true,
          },
        })
      : Promise.resolve([]),
    activeGuild
      ? prisma.guildMember.findMany({
          where: { guildId: activeGuild.id },
          include: { user: true },
          orderBy: { joinedAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const activeDmThread =
    dmThreads.find((thread) => thread.id === requestedDmThreadId) || dmThreads[0] || null;
  const dmPartner =
    activeDmThread?.participants.find((participant) => participant.userId !== currentUser.id)
      ?.user || null;

  const dmMessagesRaw = activeDmThread
    ? await prisma.message.findMany({
        where: { threadId: activeDmThread.id },
        orderBy: { createdAt: "asc" },
        include: {
          author: true,
          attachments: true,
        },
      })
    : [];

  const dmUnreadCounts = new Map(
    await Promise.all(
      dmThreads.map(async (thread) => {
        const lastReadAt = thread.readStates[0]?.lastReadAt || null;
        const unreadCount = await prisma.message.count({
          where: {
            threadId: thread.id,
            authorId: {
              not: currentUser.id,
            },
            ...(lastReadAt
              ? {
                  createdAt: {
                    gt: lastReadAt,
                  },
                }
              : {}),
          },
        });

        return [thread.id, unreadCount];
      })
    )
  );
  const serverUnreadCounts = new Map(
    await Promise.all(
      serverChannels.map(async (channel) => {
        const lastReadAt = serverReadStateByChannelId.get(channel.id)?.lastReadAt || null;
        const unreadCount = await prisma.message.count({
          where: {
            channelId: channel.id,
            authorId: {
              not: currentUser.id,
            },
            ...(lastReadAt
              ? {
                  createdAt: {
                    gt: lastReadAt,
                  },
                }
              : {}),
          },
        });

        return [channel.id, unreadCount];
      })
    )
  );

  const threadByFriendId = new Map();
  dmThreads.forEach((thread) => {
    const partner = thread.participants.find(
      (participant) => participant.userId !== currentUser.id
    )?.user;

    if (partner) {
      threadByFriendId.set(partner.id, thread.id);
    }
  });

  const friends = acceptedFriends.map((request) => {
    const friend = request.senderId === currentUser.id ? request.receiver : request.sender;

    return {
      id: friend.id,
      username: friend.username,
      tag: `@${friend.username}`,
      status: getUserStatus(friend.id),
      dmThreadId: threadByFriendId.get(friend.id) || null,
    };
  });

  const { incomingFriendRequests, outgoingFriendRequests } = splitPendingRequests(
    pendingRequests,
    currentUser.id
  );

  return {
    currentUser: serializeAuthUser(currentUser),
    activeGuildId: activeGuild?.id || null,
    guilds: guilds.map((guild, index) => ({
      id: guild.id,
      name: guild.name,
      abbr: guild.name.slice(0, 2).toUpperCase(),
      badge: buildGuildBadge(index),
      active: guild.id === activeGuild?.id,
    })),
    activeGuildName: activeGuild?.name || "No Server",
    serverChannels: serverChannels.map((channel) => ({
      id: channel.id,
      name: channel.name,
      unread: serverUnreadCounts.get(channel.id) || 0,
      hasUnread: (serverUnreadCounts.get(channel.id) || 0) > 0,
      active: channel.id === activeServerChannel?.id,
    })),
    activeServerChannelId: activeServerChannel?.id || null,
    serverMessages: serverMessagesRaw.map(serializeMessage),
    serverMembers: serverMembersRaw.map((member) => ({
      id: member.user.id,
      name: member.nickname || member.user.username,
      role: getUserRole(member.user.id),
      status: getUserStatus(member.user.id),
    })),
    friends,
    incomingFriendRequests,
    outgoingFriendRequests,
    dmList: dmThreads.map((thread) => ({
      ...serializeDmThread(thread, currentUser.id),
      unreadCount: dmUnreadCounts.get(thread.id) || 0,
      hasUnread: (dmUnreadCounts.get(thread.id) || 0) > 0,
      active: thread.id === activeDmThread?.id,
    })),
    dmTitle: dmPartner ? dmPartner.username : "Direct Messages",
    activeDmThreadId: activeDmThread?.id || null,
    dmMessages: dmMessagesRaw.map(serializeMessage),
    dmMembers: (activeDmThread?.participants || []).map((participant) => ({
      id: participant.user.id,
      name: participant.user.username,
      status: getUserStatus(participant.user.id),
    })),
  };
}

module.exports = {
  buildBootstrapPayload,
};
