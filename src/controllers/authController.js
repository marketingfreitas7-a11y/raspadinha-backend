// src/controllers/authController.js
const {
  PrismaClient,
  TransactionType,
  TransactionStatus,
} = require("@prisma/client");
const prisma = new PrismaClient();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev_fallback_secret";

// Cadastro
async function register(req, res) {
  try {
    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ error: "Preencha todos os campos." });
    }

    // já existe?
    const existente = await prisma.user.findUnique({ where: { email } });
    if (existente) {
      return res.status(409).json({ error: "Email já cadastrado." });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    // Tudo atômico: cria o usuário e registra a transação de bônus
    const novoUsuario = await prisma.$transaction(async (tx) => {
      // balanceCents já nasce = 2000 pelo default do schema
      const user = await tx.user.create({
        data: { nome, email, senha: senhaHash },
        select: { id: true, nome: true, email: true, createdAt: true, balanceCents: true },
      });

      // registra o bônus de boas-vindas no histórico (R$ 20,00)
      await tx.transaction.create({
        data: {
          userId: user.id,
          type: TransactionType.BONUS,
          status: TransactionStatus.COMPLETED,
          amountCents: 2000,
          description: "Bônus de boas-vindas",
        },
      });

      return user;
    });

    return res.status(201).json({ message: "Usuário cadastrado!", user: novoUsuario });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Email já cadastrado." });
    }
    console.error(err);
    return res.status(500).json({ error: "Erro no servidor." });
  }
}

// Login
async function login(req, res) {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) {
      return res.status(400).json({ error: "Informe email e senha." });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    const ok = await bcrypt.compare(senha, user.senha);
    if (!ok) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "1h",
    });

    return res.json({
      message: "Login realizado com sucesso!",
      token,
      user: { id: user.id, nome: user.nome, email: user.email },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro no servidor." });
  }
}

// Perfil (lê o usuário a partir do token)
async function me(req, res) {
  try {
    const auth = req.headers.authorization || "";
    const [, token] = auth.split(" ");
    if (!token) return res.status(401).json({ error: "Token ausente." });

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "Token inválido ou expirado." });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, nome: true, email: true, createdAt: true, balanceCents: true },
    });

    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    return res.json({ user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro no servidor." });
  }
}

module.exports = { register, login, me };
