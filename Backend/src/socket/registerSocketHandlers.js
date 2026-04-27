function registerSocketHandlers(io, auth) {
  io.on("connection", async (socket) => {
    const user = await auth.resolveUserFromToken(socket.handshake.auth?.token);

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

    socket.on("thread:join", (threadId) => {
      if (typeof threadId === "string" && threadId) {
        socket.join(`thread:${threadId}`);
      }
    });

    socket.on("thread:leave", (threadId) => {
      if (typeof threadId === "string" && threadId) {
        socket.leave(`thread:${threadId}`);
      }
    });
  });
}

module.exports = {
  registerSocketHandlers,
};
