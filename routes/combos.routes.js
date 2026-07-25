const express = require("express");
const router = express.Router();
const combosController = require("../controllers/combos.controller");
const { verifyToken } = require("../middlewares/auth.middleware");
const upload = require("../config/Multer");

// Todas las operaciones manejan Combos + Combos_Detalle juntos
router.get("/combos", combosController.getCombos);
router.get("/combos/:id", verifyToken, combosController.getComboById);

router.post("/combos", verifyToken, upload, combosController.createCombo); // Siempre con detalles
router.put("/combos/:id", verifyToken, upload, combosController.updateCombo); // Siempre con detalles
router.patch("/combos/:id/status", verifyToken, combosController.statusCombo); // cambiar estado
router.delete("/combos/:id", verifyToken, combosController.deleteCombo); // Elimina ambos

module.exports = router;