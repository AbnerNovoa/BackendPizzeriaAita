const express = require("express");
const router = express.Router();
const productoController = require("../controllers/producto.controller");
const { verifyToken } = require("../middlewares/auth.middleware");
const upload = require("../config/Multer");

// Definir las rutas de productos
router.get("/productos", productoController.getProductos);
router.get("/productos/:id", productoController.getProductoById);
// POST y PUT permiten subida de archivos a través del middleware upload
router.post("/productos", verifyToken, upload, productoController.createProducto);
router.put("/productos/:id", verifyToken, upload, productoController.updateProducto);
router.delete("/productos/:id", verifyToken, productoController.deleteProducto);

module.exports = router;
