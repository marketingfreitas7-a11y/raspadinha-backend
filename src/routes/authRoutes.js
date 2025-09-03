const express = require("express");
const router = express.Router();
const { register, login, me } = require("../controllers/authController");

// Cadastro de usuário
router.post("/register", register);

// Login de usuário
router.post("/login", login);

// Rota protegida: perfil do usuário
router.get("/me", me);

module.exports = router;
