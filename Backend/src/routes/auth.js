const express = require("express");
const { serializeAuthUser } = require("../lib/serializers");

function createAuthRouter({ prisma, auth }) {
  const router = express.Router();

  router.post("/register", async (req, res) => {
    try {
      const { username, email, password } = req.body ?? {};
      const normalizedUsername =
        typeof username === "string" ? username.trim().toLowerCase() : "";
      const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

      if (!normalizedUsername || !normalizedEmail || typeof password !== "string") {
        return res.status(400).json({ error: "username, email and password are required" });
      }

      if (normalizedUsername.length < 3) {
        return res.status(400).json({ error: "Username must be at least 3 characters" });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [{ username: normalizedUsername }, { email: normalizedEmail }],
        },
      });

      if (existingUser) {
        return res.status(409).json({ error: "Username or email already exists" });
      }

      const user = await prisma.user.create({
        data: {
          username: normalizedUsername,
          email: normalizedEmail,
          passwordHash: auth.createPasswordHash(password),
        },
      });

      const firstGuild = await prisma.guild.findFirst({
        orderBy: { createdAt: "asc" },
      });

      if (firstGuild) {
        await prisma.guildMember.create({
          data: {
            guildId: firstGuild.id,
            userId: user.id,
            nickname: user.username,
          },
        });
      }

      res.status(201).json({
        token: auth.createToken(user.id),
        user: serializeAuthUser(user),
      });
    } catch (error) {
      console.error("Failed to register user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.post("/login", async (req, res) => {
    try {
      const { emailOrUsername, password } = req.body ?? {};
      const loginValue =
        typeof emailOrUsername === "string" ? emailOrUsername.trim().toLowerCase() : "";

      if (!loginValue || typeof password !== "string") {
        return res.status(400).json({ error: "email/username and password are required" });
      }

      const user = await prisma.user.findFirst({
        where: {
          OR: [{ username: loginValue }, { email: loginValue }],
        },
      });

      if (!user || !auth.verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      res.json({
        token: auth.createToken(user.id),
        user: serializeAuthUser(user),
      });
    } catch (error) {
      console.error("Failed to login user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}

module.exports = {
  createAuthRouter,
};
