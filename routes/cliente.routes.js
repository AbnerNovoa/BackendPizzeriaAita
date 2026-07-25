const express = require("express");
const router = express.Router();

const clienteController = require("../controllers/cliente.controller");
const { verifyToken } = require("../middlewares/auth.middleware");

// ==============================
// 📘 CRUD de Clientes
// ==============================
router.get("/clientes", clienteController.getClientes);
router.get("/clientes/:id", verifyToken, clienteController.getClienteById);
router.post("/clientes", clienteController.createCliente);
router.put("/clientes/:id", verifyToken, clienteController.updateCliente);
router.delete("/clientes/:id", verifyToken, clienteController.deleteCliente);
router.get("/clientes/puntos/:id", clienteController.misPuntos);

// ==============================
// 🔍 Buscar cliente por DNI o RUC (usando API externa apiperu.dev)
// ==============================
router.get("/clientes/buscar/:doc", clienteController.buscarClientePorDocumento);

module.exports = router;
