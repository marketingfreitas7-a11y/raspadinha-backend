const axios = require("axios");

const BASE_URL = process.env.MAXIMUS_BASE_URL || "https://api.fastsoftbrasil.com";
const SECRET = process.env.MAXIMUS_SECRET;

if (!SECRET) {
  // não bloqueia, mas avisa
  console.warn("[maximus] MAXIMUS_SECRET não definido no .env");
}

/**
 * Gera o header Authorization: Basic <base64("x:SECRET")>
 */
function basicAuthHeader() {
  const token = Buffer.from(`x:${SECRET}`).toString("base64");
  return `Basic ${token}`;
}

/**
 * Axios já configurado
 */
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  config.headers.Authorization = basicAuthHeader();
  return config;
});

module.exports = { api };