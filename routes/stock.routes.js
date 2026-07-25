const express = require("express");
const router = express.Router();
const stockController = require("../controllers/stock.controller");
const { verifyToken } = require("../middlewares/auth.middleware");

// Stocks
router.get("/stock", verifyToken, stockController.getStocks);
router.get("/stock/:id", verifyToken, stockController.getStockById);
router.post("/stock", verifyToken, stockController.createStock);
router.put("/stock/:id", verifyToken, stockController.updateStock);

// Movimientos
router.get("/stock/movimientos", verifyToken, stockController.getMovimientosStock);
router.get("/stock/movimientos/:id", verifyToken, stockController.getMovimientoStockById);
router.post("/stock/movimientos", verifyToken, stockController.createMovimientoStock);
router.put("/stock/movimientos/:id", verifyToken, stockController.updateMovimientoStock);

// Agrega esta línea en stock.routes.js después de las otras rutas de stock
router.get("/stock/insumo/:id", verifyToken, stockController.getStockByInsumoId);

module.exports = router;
