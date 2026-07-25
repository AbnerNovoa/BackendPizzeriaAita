const express = require("express");
const router = express.Router();
const pedidoController = require("../controllers/pedido.controller");
const { verifyToken } = require("../middlewares/auth.middleware");

router.get("/pedidos", pedidoController.getPedidos);
router.get("/pedidos/hoy", pedidoController.getPedidosHoy); 
router.get("/pedidos/:id", verifyToken, pedidoController.getPedidoById);
//  Obtener solo los detalles del pedido
router.get("/pedidos/:id/detalles",  pedidoController.getPedidoDetalles);
router.post("/pedidos", pedidoController.createPedidoConDetalle);
router.put("/pedidos/:id", verifyToken, pedidoController.updatePedidoConDetalle);

router.get("/pedidos/:pedido_id/notas", verifyToken, pedidoController.getDetallesConNotas);

router.patch("/pedidos/:id/status", verifyToken, pedidoController.statusPedido);

module.exports = router;
