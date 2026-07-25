const express = require("express");
const router = express.Router();
const ventaController = require("../controllers/venta.controller");
const { verifyToken } = require("../middlewares/auth.middleware");

router.get("/ventas", verifyToken, ventaController.getVentas);
router.get("/ventas/hoy", verifyToken, ventaController.getVentasHoy);
router.get("/ventas/periodo", verifyToken, ventaController.getVentasPorPeriodo);
router.get("/ventas/estadisticas", verifyToken, ventaController.getEstadisticasVentas);
router.get("/ventas/:id", verifyToken, ventaController.getVentaById);
router.get("/ventas/boleta/:id", ventaController.datosBoletaVenta);
router.get("/ventas/detalles/:id", ventaController.detallesVenta);
router.post("/ventas", ventaController.createVenta);

module.exports = router;

