const express = require("express");
const router = express.Router();
const usocuponController = require("../controllers/uso_cupon.controller");
const { verifyToken } = require("../middlewares/auth.middleware");

router.get("/usocupones", verifyToken, usocuponController.getUsosCupon);
router.get("/usocupones/:id", verifyToken, usocuponController.getUsoCuponById);
router.post("/usocupones", usocuponController.createUsoCupon);
router.put("/usocupones/:id", verifyToken, usocuponController.updateUsoCupon);
router.delete("/usocupones/:id", verifyToken, usocuponController.deleteUsoCupon);

module.exports = router;
