function buildGuildBadge(index) {
  return index % 2 === 0 ? 0 : 3;
}

function getUserStatus(userId) {
  const statusMap = {
    "u-andri": "online",
    "u-luna": "online",
    "u-kai": "idle",
    "u-mira": "online",
    "u-zen": "offline",
  };

  return statusMap[userId] || "offline";
}

function getUserRole(userId) {
  const roleMap = {
    "u-andri": "Admin",
    "u-luna": "Moderator",
    "u-kai": "Member",
    "u-mira": "Member",
    "u-zen": "Member",
  };

  return roleMap[userId] || "Member";
}

module.exports = {
  buildGuildBadge,
  getUserStatus,
  getUserRole,
};
