const axios = require("axios");

/**
 * 1. ENVIAR MENSAJE VIA WHATSAPP CLOUD API
 */
async function enviarMensajePedido(numeroDestino, pedidoData) {
  const { id_pedido, monto, metodo_pago } = pedidoData;
  const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

  const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
  const textoMensaje = `Pedido ${id_pedido}\nMonto ${monto} soles\nmetodo pago: ${metodo_pago}\n\nTransferencia exitosa?`;

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: numeroDestino,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: textoMensaje },
      action: {
        buttons: [
          { type: "reply", reply: { id: "btn_si", title: "SI" } },
          { type: "reply", reply: { id: "btn_no", title: "NO" } },
        ],
      },
    },
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    console.log(
      `[${new Date().toLocaleTimeString()}] -> Mensaje de WhatsApp enviado para el Pedido: ${id_pedido}`,
    );
    return response.data;
  } catch (error) {
    console.error(
      "Error al enviar mensaje de WhatsApp:",
      error.response?.data || error.message,
    );
    throw error;
  }
}

/**
 * 2. TEMPORIZADOR CON PROBABLIDAD QUE DEVUELVE EL RESULTADO
 * Espera 20 segundos y retorna true (70%) o false (30%)
 */
function iniciarTemporizadorRespuesta(pedidoData) {
  return new Promise((resolve) => {
    const TIEMPO_LIMITE = 5000; // 20 segundos

    console.log(
      `[${new Date().toLocaleTimeString()}] -> Esperando validación automática de transferencia (20 segundos)...`,
    );

    setTimeout(() => {
      const probabilidad = Math.floor(Math.random() * 100) + 1;

      if (probabilidad <= 70) {
        console.log("=================================");
        console.log("Validacion automática exitosa");
        console.log(`Detalle: Simulación exitosa (${probabilidad}%)`);
        console.log("=================================\n");
        resolve(true); // ÉXITO
      } else {
        console.log("=================================");
        console.log("Validacion automática fallida");
        console.log(`Detalle: Simulación fallida (${probabilidad}%)`);
        console.log("=================================\n");
        resolve(false); // FALLO
      }
    }, TIEMPO_LIMITE);
  });
}

module.exports = {
  enviarMensajePedido,
  iniciarTemporizadorRespuesta,
};
