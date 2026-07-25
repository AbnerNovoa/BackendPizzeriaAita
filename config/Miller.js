require("dotenv").config();
const nodemailer = require("nodemailer");

const codigosPago = {};

console.log("📧 Configurando email con:", process.env.EMAIL_USER);

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verificar configuración de email
transporter.verify(function (error, success) {
  if (error) {
    console.log("❌ Error configurando email:", error.message);
    console.log("💡 Asegúrate de:");
    console.log("   1. Usar una CONTRASEÑA DE APLICACIÓN de Gmail");
    console.log("   2. Tener la verificación en 2 pasos activada");
    console.log("   3. Las credenciales en el archivo .env sean correctas");
  } else {
    console.log("✅ Servidor de email listo para enviar mensajes");
  }
});

const codigoPago = async (req, res) => {
  try {
    console.log("📧 Solicitud recibida para enviar código");
    
    // SIEMPRE enviar a tu correo personal
    const emailDestino = "abnerluisnovoa@gmail.com, brayantitovasqueztorrez@gmail.com";
    
    const codigo = Math.floor(1000 + Math.random() * 9000);
    codigosPago[emailDestino] = codigo;

    console.log("🔐 Código generado para:", emailDestino, "->", codigo);

    // Código expira en 5 minutos
    setTimeout(() => {
      delete codigosPago[emailDestino];
      console.log("⏰ Código expirado para:", emailDestino);
    }, 5 * 60 * 1000);

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: emailDestino, // SIEMPRE a tu correo
      subject: "Código de Verificación - Pizzería",
      text: `Tu código de verificación es: ${codigo}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #e74c3c;">Pizzería - Código de Verificación</h2>
          <p>Estimado cliente,</p>
          <p>Su código de verificación para completar el pago es:</p>
          <div style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; color: #e74c3c; border-radius: 5px; margin: 20px 0;">
            ${codigo}
          </div>
          <p>Este código expirará en 5 minutos.</p>
          <p>Si no solicitó este código, por favor ignore este mensaje.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">&copy; 2024 Pizzería. Todos los derechos reservados.</p>
        </div>
      `,
    };

    console.log("📤 Enviando email a:", emailDestino);
    await transporter.sendMail(mailOptions);
    console.log("✅ Correo enviado exitosamente a:", emailDestino);
    
    res.status(200).json({ 
      success: true,
      message: "Código de pago enviado correctamente a tu correo",
      codigo: codigo // Para desarrollo
    });

  } catch (error) {
    console.error("❌ Error al enviar el código de pago:", error.message);
    res.status(500).json({ 
      success: false,
      message: "Error al enviar el código de pago. Verifica la configuración de email." 
    });
  }
};

const verificarPago = (req, res) => {
  try {
    console.log("🔍 Solicitud de verificación recibida");
    
    // SIEMPRE verificar contra tu correfo
    const emailDestino = "abnerluisnovoa@gmail.com, brayantitovasqueztorrez@gmail.com";
    const { codigo } = req.body;

    console.log("Código recibido para verificar:", codigo);
    console.log("Códigos activos en memoria:", codigosPago);

    if (!codigo) {
      return res.status(400).json({ 
        success: false,
        message: "Falta el código de verificación" 
      });
    }

    const codigoGuardado = codigosPago[emailDestino];
    console.log("Código guardado para", emailDestino, ":", codigoGuardado);
    
    // Validar que el código sea numérico
    const codigoNumerico = parseInt(codigo);
    if (isNaN(codigoNumerico)) {
      console.log("❌ Código no es numérico:", codigo);
      return res.status(400).json({ 
        success: false,
        message: "El código debe ser numérico" 
      });
    }
    
    if (codigoGuardado && codigoGuardado === codigoNumerico) {
      delete codigosPago[emailDestino];
      console.log("✅ Código verificado correctamente para:", emailDestino);
      return res.status(200).json({ 
        success: true,
        message: "Pago verificado correctamente" 
      });
    } else {
      console.log("❌ Código incorrecto o expirado para:", emailDestino);
      console.log("Esperado:", codigoGuardado, "Recibido:", codigoNumerico);
      return res.status(400).json({ 
        success: false,
        message: "Código de pago incorrecto o expirado" 
      });
    }
  } catch (error) {
    console.error("❌ Error verificando código:", error);
    res.status(500).json({ 
      success: false,
      message: "Error interno del servidor" 
    });
  }
};

module.exports = {
  codigoPago,
  verificarPago,
};