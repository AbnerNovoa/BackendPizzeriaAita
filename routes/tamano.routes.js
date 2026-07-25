const express = require("express");
const router = express.Router();

const tamanoController = require("../controllers/tamano.controller");
const { verifyToken } = require("../middlewares/auth.middleware");

// CRUD tamaños
router.get("/tamanos", tamanoController.getTamanos);
router.get("/tamanos/:id", tamanoController.getTamanoById);
router.post("/tamanos", verifyToken, tamanoController.createTamano);
router.put("/tamanos/:id", verifyToken, tamanoController.updateTamano);
router.delete("/tamanos/:id", verifyToken, tamanoController.deleteTamano);

module.exports = router;
