function createRequireAuth(auth) {
  return async function requireAuth(req, res, next) {
    try {
      const user = await auth.resolveUserFromToken(auth.getTokenFromRequest(req));

      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error("Failed to authorize request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

module.exports = {
  createRequireAuth,
};
