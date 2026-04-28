const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const { PrismaClient } = require("@prisma/client");

const { createAuth } = require("./src/lib/auth");
const { createRequireAuth } = require("./src/middleware/auth");
const { createAuthRouter } = require("./src/routes/auth");
const { createBootstrapRouter } = require("./src/routes/bootstrap");
const { createFriendsRouter } = require("./src/routes/friends");
const { createDirectMessagesRouter } = require("./src/routes/dms");
const { createGuildsRouter } = require("./src/routes/guilds");
const { createMessagesRouter } = require("./src/routes/messages");
const { registerSocketHandlers } = require("./src/socket/registerSocketHandlers");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const prisma = new PrismaClient();
const port = process.env.PORT || 3001;
const auth = createAuth({
  prisma,
  tokenSecret: process.env.TOKEN_SECRET || "discordmaybe-dev-secret",
  passwordSecret: process.env.PASSWORD_SECRET || "discordmaybe-password-secret",
});
const requireAuth = createRequireAuth(auth);
const context = {
  prisma,
  io,
  auth,
  requireAuth,
};

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use("/api/auth", createAuthRouter(context));
app.use("/api", createBootstrapRouter(context));
app.use("/api/friends", createFriendsRouter(context));
app.use("/api/dms", createDirectMessagesRouter(context));
app.use("/api/guilds", createGuildsRouter(context));
app.use("/api/messages", createMessagesRouter(context));

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

registerSocketHandlers(io, auth);

server.listen(port, () => {
  console.log(`Backend API listening on http://localhost:${port}`);
});
