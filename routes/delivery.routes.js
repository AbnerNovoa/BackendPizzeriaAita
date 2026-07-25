const express = require("express");
const router = express.Router();
const deliveryController = require("../controllers/delivery.controller");
const { verifyToken } = require("../middlewares/auth.middleware");

router.get("/delivery", verifyToken, deliveryController.getDeliveries);
router.get("/delivery/:id", verifyToken, deliveryController.getDeliveryById);
router.post("/delivery", deliveryController.createDelivery);
router.put("/delivery/:id", verifyToken, deliveryController.updateDelivery);


module.exports = router;
