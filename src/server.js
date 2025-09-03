// src/server.js
require("dotenv").config(); // carrega .env (DATABASE_URL, JWT_SECRET, etc)

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const app = express();
const PORT = process.env.PORT || 3000;

// se rodar atrás de proxy (Railway/Vercel), isso ajuda em cookies/ips reais
app.set("trust proxy", 1);

// middlewares básicos
app.use(cors());         // depois podemos restringir a origin do seu frontend
app.use(helmet());       // segurança HTTP
app.use(express.json()); // JSON body parser

// rotas de autenticação
const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);

// rotas de transações (saldo, extrato, depósito PIX e webhook Maximus)
const transactionRoutes = require("./routes/transactionRoutes");
app.use("/api", transactionRoutes); // /api/balance, /api/transactions, /api/deposit, /api/webhooks/maximus

// rota de saúde
app.get("/", (_req, res) => {
  res.send("Backend da Raspadinha organizado e rodando! 🚀");
});

// 404 padrão
app.use((_req, res) => {
  res.status(404).json({ error: "Rota não encontrada." });
});

// inicializa
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});