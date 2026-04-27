const express = require("express");
const { buildBootstrapPayload } = require("../services/bootstrapService");

function createBootstrapRouter({ prisma, requireAuth }) {
  const router = express.Router();

  router.get("/bootstrap", requireAuth, async (req, res) => {
    try {
      const payload = await buildBootstrapPayload(prisma, req.user, req.query);
      res.json(payload);
    } catch (error) {
      console.error("Failed to build bootstrap payload:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}

module.exports = {
  createBootstrapRouter,
};
