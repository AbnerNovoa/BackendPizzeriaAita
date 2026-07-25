const express = require("express");
const router = express.Router();
const { codigoPago, verificarPago } = require("../config/Miller");

router.post("/codigo-pago", codigoPago);

router.post("/verificar-pago", verificarPago);

module.exports = router;
