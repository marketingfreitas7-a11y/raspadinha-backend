const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const {
  getBalance,
  depositMock,
  depositPix,
  maximusWebhook,
} = require("../controllers/transactionController");

// saldo
router.get("/balance", auth, getBalance);

// depósito MOCK (local)
router.post("/deposit", auth, depositMock);

// depósito PIX REAL (Maximus)
router.post("/deposit/pix", auth, depositPix);

// webhook (sem auth porque a Maximus vai chamar de fora)
router.post("/webhook/maximus", express.json(), maximusWebhook);

module.exports = router;