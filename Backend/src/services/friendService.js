const { serializeFriendRequest } = require("../lib/serializers");

function buildPairKey(firstUserId, secondUserId) {
  return [firstUserId, secondUserId].sort().join(":");
}

async function getAcceptedFriendships(prisma, currentUserId) {
  return prisma.friendRequest.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ senderId: currentUserId }, { receiverId: currentUserId }],
    },
    include: {
      sender: true,
      receiver: true,
    },
    orderBy: { updatedAt: "desc" },
  });
}

async function areUsersFriends(prisma, firstUserId, secondUserId) {
  const friendship = await prisma.friendRequest.findUnique({
    where: {
      pairKey: buildPairKey(firstUserId, secondUserId),
    },
  });

  return friendship?.status === "ACCEPTED";
}

async function getPendingFriendRequests(prisma, currentUserId) {
  return prisma.friendRequest.findMany({
    where: {
      status: "PENDING",
      OR: [{ senderId: currentUserId }, { receiverId: currentUserId }],
    },
    include: {
      sender: true,
      receiver: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

function splitPendingRequests(requests, currentUserId) {
  return {
    incomingFriendRequests: requests
      .filter((request) => request.receiverId === currentUserId)
      .map((request) => serializeFriendRequest(request, currentUserId)),
    outgoingFriendRequests: requests
      .filter((request) => request.senderId === currentUserId)
      .map((request) => serializeFriendRequest(request, currentUserId)),
  };
}

module.exports = {
  buildPairKey,
  getAcceptedFriendships,
  areUsersFriends,
  getPendingFriendRequests,
  splitPendingRequests,
};
