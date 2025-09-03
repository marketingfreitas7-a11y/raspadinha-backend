const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// util para ler externalRef tipo "user-123"
function parseUserExternalRef(ref) {
  if (!ref) return null;
  const m = String(ref).match(/^user-(\d+)$/);
  return m ? Number(m[1]) : null;
}

router.post("/webhooks/maximus", async (req, res) => {
  try {
    const evt = req.body; // Maximus envia JSON

    // Opcional: valide origem (se a Maximus enviar algum header de segurança)
    // Exemplo: const sig = req.get("x-maximus-signature");

    // Precisamos do status e do amount
    if (!evt || !evt.status || !evt.amount) {
      return res.status(400).json({ ok: false, reason: "payload inválido" });
    }

    // Identifique o usuário:
    const userId =
      parseUserExternalRef(evt?.customer?.externalRef) ||
      null;

    // Tente conciliar pela transação local também, se você guardou pixTransactionId
    let tx;
    if (evt.id) {
      tx = await prisma.transaction.findFirst({
        where: { pixTransactionId: String(evt.id) }
      });
    }

    // Se vier COMPLETED, credita
    if (evt.status === "COMPLETED" && evt.paymentMethod === "PIX") {
      const amountCents = Number(evt.amount);

      // atualiza transação local se existir
      if (tx) {
        await prisma.transaction.update({
          where: { id: tx.id },
          data: { status: "COMPLETED" }
        });

        // credita o usuário dono da transação local
        await prisma.user.update({
          where: { id: tx.userId },
          data: { balanceCents: { increment: amountCents } }
        });
      } else if (userId) {
        // fallback: credita pelo externalRef (sem transação local)
        await prisma.user.update({
          where: { id: userId },
          data: { balanceCents: { increment: amountCents } }
        });

        // e crie o lançamento
        await prisma.transaction.create({
          data: {
            userId,
            type: "DEPOSIT",
            status: "COMPLETED",
            amountCents,
            description: "Depósito via PIX (webhook Maximus)",
            pixTransactionId: evt.id ? String(evt.id) : null
          }
        });
      }
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("Webhook Maximus erro:", e);
    return res.status(500).json({ ok: false });
  }
});

module.exports = router;