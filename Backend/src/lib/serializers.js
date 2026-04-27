const { getUserStatus } = require("./presence");

function formatTime(value) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
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
    channelId: message.channelId || null,
    threadId: message.threadId || null,
  };
}

function serializeFriendRequest(request, currentUserId) {
  const otherUser = request.senderId === currentUserId ? request.receiver : request.sender;

  return {
    id: request.id,
    username: otherUser.username,
    tag: `@${otherUser.username}`,
    direction: request.senderId === currentUserId ? "outgoing" : "incoming",
    status: request.status.toLowerCase(),
  };
}

function serializeDmThread(thread, currentUserId) {
  const partner = thread.participants.find(
    (participant) => participant.userId !== currentUserId
  )?.user;

  return {
    id: thread.id,
    name: partner?.username || "Group Chat",
    subtitle: partner ? "Direct Message" : "Group",
    status: partner ? getUserStatus(partner.id) : "online",
    active: false,
  };
}

module.exports = {
  serializeAuthUser,
  serializeMessage,
  serializeFriendRequest,
  serializeDmThread,
};
