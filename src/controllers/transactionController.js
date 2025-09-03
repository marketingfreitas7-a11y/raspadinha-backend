// src/controllers/transactionController.js
const { PrismaClient, TransactionStatus, TransactionType } = require("@prisma/client");
const prisma = new PrismaClient();
const { api: maximus } = require("../utils/maximus");

function centsToReais(cents) {
  return (cents / 100).toFixed(2);
}

/**
 * GET /api/balance
 * Lê saldo do usuário logado
 */
async function getBalance(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { balanceCents: true },
    });

    return res.json({
      balanceCents: user.balanceCents,
      balanceReais: centsToReais(user.balanceCents),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Erro ao buscar saldo." });
  }
}

/**
 * POST /api/deposit (MOCK)
 * Credita imediatamente — útil para testes locais
 */
async function depositMock(req, res) {
  try {
    const { amountCents } = req.body;
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return res.status(400).json({ error: "amountCents inválido." });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { balanceCents: { increment: amountCents } },
      select: { balanceCents: true },
    });

    // registra transação como COMPLETED
    await prisma.transaction.create({
      data: {
        userId: req.user.id,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.COMPLETED,
        amountCents,
        description: "Depósito (mock)",
      },
    });

    return res.json({
      message: "Depósito (mock) realizado com sucesso!",
      balanceCents: user.balanceCents,
      balanceReais: centsToReais(user.balanceCents),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Erro no depósito (mock)." });
  }
}

/**
 * POST /api/deposit/pix
 * Cria cobrança PIX na Maximus e salva transação PENDING.
 * O crédito no saldo acontecerá via webhook quando o status mudar para COMPLETED.
 */
async function depositPix(req, res) {
  try {
    const { amountCents } = req.body;
    if (!Number.isInteger(amountCents) || amountCents < 100) {
      return res.status(400).json({ error: "amountCents inválido (mínimo 100)." });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, nome: true, email: true },
    });

    // payload da Maximus — ajuste campos de documento/telefone conforme seu cadastro
    const payload = {
      amount: amountCents, // em centavos
      paymentMethod: "PIX",
      customer: {
        name: user.nome || "Cliente",
        email: user.email,
        document: { number: "12345678900", type: "CPF" }, // TODO: puxar do cadastro real
        phone: "11999999999", // TODO: puxar do cadastro real
        externaRef: `user-${user.id}`,
      },
      shipping: {
        fee: 0,
        address: {
          street: "Rua Teste",
          streetNumber: "123",
          complement: "Sala 1",
          zipCode: "01000000",
          neighborhood: "Centro",
          city: "São Paulo",
          state: "SP",
          country: "br",
        },
      },
      items: [
        {
          title: "Crédito na carteira",
          unitPrice: amountCents,
          quantity: 1,
          tangible: false,
          externalRef: `wallet-topup-${Date.now()}`,
        },
      ],
      traceable: true,
      ip: req.ip || "127.0.0.1",
      postbackUrl: `${process.env.PUBLIC_WEBHOOK_BASE}/api/webhook/maximus`,
      metadata: { origem: "carteira", userId: user.id },
      pix: { expiresInDays: 1 },
    };

    // cria transação na Maximus
    const { data } = await maximus.post("/api/user/transactions", payload);

    // capture um identificador da transação retornado pela Maximus
    const providerId = String(data.id || data.transactionId || data.uuid || "");

    // salva transação local como PENDING
    const tx = await prisma.transaction.create({
      data: {
        userId: user.id,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.PENDING,
        amountCents,
        description: "Depósito via PIX (aguardando pagamento)",
        pixTransactionId: providerId || null,
      },
      select: { id: true },
    });

    // devolve os dados úteis ao front (QR Code / copia e cola vêm em data)
    return res.status(201).json({
      message: "Transação PIX criada",
      transactionId: tx.id,
      providerId,
      providerPayload: data,
    });
  } catch (e) {
    console.error(e?.response?.data || e);
    if (e?.response?.status) {
      return res.status(e.response.status).json(
        e.response.data || { error: "Erro ao criar PIX." }
      );
    }
    return res.status(500).json({ error: "Erro ao criar PIX." });
  }
}

/**
 * POST /api/webhook/maximus
 * Webhook da Maximus — atualiza status e credita saldo quando COMPLETED.
 * Idempotente: só credita quando houver mudança real para COMPLETED.
 */
async function maximusWebhook(req, res) {
  try {
    // Ajuste os nomes exatamente ao payload do webhook da Maximus
    const { id: providerId, status } = req.body || {};
    if (!providerId) {
      return res.status(400).json({ error: "providerId ausente no webhook." });
    }

    const tx = await prisma.transaction.findUnique({
      where: { pixTransactionId: String(providerId) },
      select: { id: true, userId: true, amountCents: true, status: true },
    });

    if (!tx) {
      console.warn("[webhook] transação não encontrada:", providerId);
      return res.status(200).json({ ok: true }); // acknowledge para não re-tentar indefinidamente
    }

    // Mapear status externo -> nosso enum
    let newStatus = tx.status;
    const s = String(status || "").toUpperCase();
    if (s === "COMPLETED" || s === "PAID" || s === "CONFIRMED") newStatus = TransactionStatus.COMPLETED;
    else if (s === "PENDING") newStatus = TransactionStatus.PENDING;
    else if (s === "FAILED") newStatus = TransactionStatus.FAILED;
    else if (s === "CANCELED" || s === "CANCELLED") newStatus = TransactionStatus.CANCELED;

    if (tx.status === newStatus) {
      return res.status(200).json({ ok: true });
    }

    await prisma.transaction.update({
      where: { id: tx.id },
      data: { status: newStatus },
    });

    if (newStatus === TransactionStatus.COMPLETED) {
      await prisma.user.update({
        where: { id: tx.userId },
        data: { balanceCents: { increment: tx.amountCents } },
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Erro ao processar webhook." });
  }
}

module.exports = {
  getBalance,
  depositMock,
  depositPix,
  maximusWebhook,
};