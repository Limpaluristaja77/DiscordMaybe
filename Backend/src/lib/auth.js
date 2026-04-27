const crypto = require("crypto");

function createAuth({ prisma, tokenSecret, passwordSecret }) {
  function createPasswordHash(password) {
    return crypto.scryptSync(password, passwordSecret, 64).toString("hex");
  }

  function verifyPassword(password, passwordHash) {
    const incomingHash = createPasswordHash(password);
    return crypto.timingSafeEqual(
      Buffer.from(incomingHash, "hex"),
      Buffer.from(passwordHash, "hex")
    );
  }

  function createToken(userId) {
    const payload = Buffer.from(
      JSON.stringify({
        userId,
        exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
      })
    ).toString("base64url");
    const signature = crypto
      .createHmac("sha256", tokenSecret)
      .update(payload)
      .digest("base64url");

    return `${payload}.${signature}`;
  }

  function verifyToken(token) {
    if (!token || typeof token !== "string" || !token.includes(".")) {
      return null;
    }

    const [payload, signature] = token.split(".");
    const expectedSignature = crypto
      .createHmac("sha256", tokenSecret)
      .update(payload)
      .digest("base64url");

    if (signature !== expectedSignature) {
      return null;
    }

    try {
      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

      if (!decoded.userId || !decoded.exp || decoded.exp < Date.now()) {
        return null;
      }

      return decoded;
    } catch {
      return null;
    }
  }

  function getTokenFromRequest(req) {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return null;
    }

    return authorization.slice("Bearer ".length);
  }

  async function resolveUserFromToken(token) {
    const decoded = verifyToken(token);

    if (!decoded) {
      return null;
    }

    return prisma.user.findUnique({
      where: { id: decoded.userId },
    });
  }

  return {
    createPasswordHash,
    verifyPassword,
    createToken,
    verifyToken,
    getTokenFromRequest,
    resolveUserFromToken,
  };
}

module.exports = {
  createAuth,
};
