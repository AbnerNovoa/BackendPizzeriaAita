// routes/categoria.routes.js
const express = require("express");
const router = express.Router();
const categoriaController = require("../controllers/categoria.controller");
const { verifyToken } = require("../middlewares/auth.middleware");

// Todas las rutas incluyen el parámetro :tipo => 'producto' o 'insumo'
router.get("/categorias/:tipo", categoriaController.getCategorias);
router.get("/categorias/:tipo/:id", categoriaController.getCategoriaById);
router.post("/categorias/:tipo", verifyToken, categoriaController.createCategoria);
router.put("/categorias/:tipo/:id", verifyToken, categoriaController.updateCategoria);
router.delete("/categorias/:tipo/:id", verifyToken, categoriaController.deleteCategoria);

module.exports = router;
