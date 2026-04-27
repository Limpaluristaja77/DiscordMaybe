async function markDmThreadRead(prisma, threadId, userId, lastMessage) {
  if (!threadId || !userId) {
    return;
  }

  await prisma.dmReadState.upsert({
    where: {
      userId_threadId: {
        userId,
        threadId,
      },
    },
    update: {
      lastReadAt: lastMessage?.createdAt || new Date(),
      lastMessageId: lastMessage?.id || null,
    },
    create: {
      userId,
      threadId,
      lastReadAt: lastMessage?.createdAt || new Date(),
      lastMessageId: lastMessage?.id || null,
    },
  });
}

module.exports = {
  markDmThreadRead,
};
