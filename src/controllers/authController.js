// src/controllers/authController.js
const { PrismaClient, TransactionType, TransactionStatus } = require("@prisma/client");
const prisma = new PrismaClient();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev_fallback_secret";

// Cadastro - CORRIGIDO para aceitar todos os campos
async function register(req, res) {
  try {
    const { nome, email, telefone, cpf, senha } = req.body;

    if (!nome || !email || !telefone || !cpf || !senha) {
      return res.status(400).json({ error: "Preencha todos os campos." });
    }

    // Verificar se já existe
    const existente = await prisma.user.findFirst({ 
      where: { 
        OR: [
          { email },
          { telefone },
          { cpf }
        ]
      } 
    });
    
    if (existente) {
      return res.status(409).json({ error: "Email, telefone ou CPF já cadastrado." });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const novoUsuario = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { nome, email, telefone, cpf, senha: senhaHash },
        select: { id: true, nome: true, email: true, balanceCents: true },
      });

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

    const token = jwt.sign({ id: novoUsuario.id, email }, JWT_SECRET, { expiresIn: "24h" });

    return res.status(201).json({ 
      message: "Usuário cadastrado!", 
      token,
      user: novoUsuario 
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro no servidor." });
  }
}

// Login - CORRIGIDO para usar telefone
async function login(req, res) {
  try {
    const { telefone, senha } = req.body;
    if (!telefone || !senha) {
      return res.status(400).json({ error: "Informe telefone e senha." });
    }

    const user = await prisma.user.findUnique({ where: { telefone } });
    if (!user) {
      return res.status(401).json({ error: "Telefone ou senha incorretos." });
    }

    const ok = await bcrypt.compare(senha, user.senha);
    if (!ok) {
      return res.status(401).json({ error: "Telefone ou senha incorretos." });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "24h" });

    return res.json({
      message: "Login realizado com sucesso!",
      token,
      user: { id: user.id, nome: user.nome, email: user.email, saldo: user.balanceCents / 100 },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro no servidor." });
  }
}

// Resto do código igual...
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
