const express = require("express");
const router = express.Router();
const usuarioController = require("../controllers/usuario.controller");
const { verifyToken } = require("../middlewares/auth.middleware");

// Listar y obtener requieren token
router.get("/usuarios", verifyToken, usuarioController.getUsuarios);
router.get("/usuarios/:id", verifyToken, usuarioController.getUsuarioById);
router.post("/usuarios", usuarioController.createUsuario);
router.put("/usuarios/:id", verifyToken, usuarioController.updateUsuario);
router.delete("/usuarios/:id", verifyToken, usuarioController.deleteUsuario);
router.put("/usuarios/:id/password", usuarioController.changePassword);
router.put("/usuarios/:id/status", verifyToken, usuarioController.statusUsuario);


module.exports = router;
