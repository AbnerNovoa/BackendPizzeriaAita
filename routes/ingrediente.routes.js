const express = require("express");
const router = express.Router();

const insumoController = require("../controllers/ingrediente.controller");
const { verifyToken } = require("../middlewares/auth.middleware");

router.get("/insumos", verifyToken, insumoController.getInsumos);
router.get("/insumos/:id", verifyToken, insumoController.getInsumoById);
router.post("/insumos", verifyToken, insumoController.createInsumo);
router.put("/insumos/:id", verifyToken, insumoController.updateInsumo);
router.delete("/insumos/:id", verifyToken, insumoController.deleteInsumo);

module.exports = router;
