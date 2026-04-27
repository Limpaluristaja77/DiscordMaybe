async function markChannelRead(prisma, channelId, userId, lastMessage) {
  if (!channelId || !userId) {
    return;
  }

  await prisma.readState.upsert({
    where: {
      userId_channelId: {
        userId,
        channelId,
      },
    },
    update: {
      lastReadAt: lastMessage?.createdAt || new Date(),
      lastMessageId: lastMessage?.id || null,
    },
    create: {
      userId,
      channelId,
      lastReadAt: lastMessage?.createdAt || new Date(),
      lastMessageId: lastMessage?.id || null,
    },
  });
}

module.exports = {
  markChannelRead,
};
