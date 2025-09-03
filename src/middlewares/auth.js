const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev_fallback_secret";

function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Token não enviado." });
  }

  const [, token] = authHeader.split(" ");
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // exemplo: { id, email }
    return next();
  } catch (e) {
    return res.status(401).json({ error: "Token inválido ou expirado." });
  }
}

module.exports = auth;
