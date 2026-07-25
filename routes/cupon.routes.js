const express = require("express");
const router = express.Router();

const cuponController = require("../controllers/cupon.controller");
const { verifyToken } = require("../middlewares/auth.middleware");

router.get("/cupones", cuponController.getCupones);
router.get("/cupones/:id", cuponController.getCuponById);
router.post("/cupones", verifyToken, cuponController.createCupon);
router.put("/cupones/:id", verifyToken, cuponController.updateCupon);
router.delete("/cupones/:id", verifyToken, cuponController.deleteCupon);

module.exports = router;
