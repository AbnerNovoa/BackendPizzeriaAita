const express = require("express");
const router = express.Router();
const recetaController = require("../controllers/receta.controller");
const { verifyToken } = require("../middlewares/auth.middleware");

router.get("/recetas", verifyToken, recetaController.getRecetas);
router.get("/recetas/:id", verifyToken, recetaController.getRecetaDetalle);
router.get("/detalle-receta/por-receta/:id", verifyToken, recetaController.getDetallesPorReceta);
router.post("/recetas", verifyToken, recetaController.createRecetaConDetalle);
router.put("/recetas/:id", verifyToken, recetaController.updateReceta);
router.delete("/recetas/:id", verifyToken, recetaController.deleteReceta);

module.exports = router;
