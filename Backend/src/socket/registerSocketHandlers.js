function registerSocketHandlers(io, auth) {
  io.on("connection", async (socket) => {
    const user = await auth.resolveUserFromToken(socket.handshake.auth?.token);

    if (!user) {
      socket.disconnect(true);
      return;
    }

    socket.data.userId = user.id;
    socket.data.callRooms = new Set();

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

    socket.on("call:invite", ({ threadId }) => {
      if (typeof threadId !== "string" || !threadId) {
        return;
      }

      socket.to(`thread:${threadId}`).emit("call:incoming", {
        threadId,
        fromUserId: user.id,
        fromUsername: user.username,
      });
    });

    socket.on("call:join", ({ threadId }, callback) => {
      if (typeof threadId !== "string" || !threadId) {
        if (typeof callback === "function") {
          callback({ ok: false, error: "threadId is required" });
        }
        return;
      }

      const roomName = `call:${threadId}`;
      const room = io.sockets.adapter.rooms.get(roomName);
      const participantIds = room
        ? Array.from(room)
            .filter((socketId) => socketId !== socket.id)
            .map((socketId) => io.sockets.sockets.get(socketId)?.data?.userId)
            .filter(Boolean)
        : [];

      socket.join(roomName);
      socket.data.callRooms.add(roomName);

      socket.to(roomName).emit("call:participant-joined", {
        threadId,
        userId: user.id,
        username: user.username,
      });

      if (typeof callback === "function") {
        callback({ ok: true, participantIds });
      }
    });

    socket.on("call:leave", ({ threadId }) => {
      if (typeof threadId !== "string" || !threadId) {
        return;
      }

      const roomName = `call:${threadId}`;
      socket.leave(roomName);
      socket.data.callRooms.delete(roomName);
      socket.to(roomName).emit("call:participant-left", {
        threadId,
        userId: user.id,
      });
    });

    socket.on("webrtc:offer", ({ threadId, sdp }) => {
      if (typeof threadId !== "string" || !threadId || !sdp) {
        return;
      }

      socket.to(`call:${threadId}`).emit("webrtc:offer", {
        threadId,
        sdp,
        fromUserId: user.id,
        fromUsername: user.username,
      });
    });

    socket.on("webrtc:answer", ({ threadId, sdp }) => {
      if (typeof threadId !== "string" || !threadId || !sdp) {
        return;
      }

      socket.to(`call:${threadId}`).emit("webrtc:answer", {
        threadId,
        sdp,
        fromUserId: user.id,
      });
    });

    socket.on("webrtc:ice-candidate", ({ threadId, candidate }) => {
      if (typeof threadId !== "string" || !threadId || !candidate) {
        return;
      }

      socket.to(`call:${threadId}`).emit("webrtc:ice-candidate", {
        threadId,
        candidate,
        fromUserId: user.id,
      });
    });

    socket.on("disconnect", () => {
      socket.data.callRooms.forEach((roomName) => {
        const threadId = roomName.replace("call:", "");
        socket.to(roomName).emit("call:participant-left", {
          threadId,
          userId: user.id,
        });
      });
    });
  });
}

module.exports = {
  registerSocketHandlers,
};
