const { sql, getConnection } = require("../config/Connection");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

// 🔹 LOGIN
exports.login = async (req, res) => {
  try {
    const { Correo, Password } = req.body;

    if (!Correo || !Password) {
      return res.status(400).json({ error: "Los campos Correo y contraseña son obligatorios." });
    }

    const pool = await getConnection();

    // Buscar usuario en la tabla 'Usuario'
    const result = await pool.request()
      .input("Correo", sql.VarChar, Correo)
      .query("SELECT * FROM Usuario WHERE Correo = @Correo");

    if (result.recordset.length === 0) {
      return res.status(401).json({ error: "Usuario no encontrado." });
    }

    const user = result.recordset[0];

    // Verificar si el usuario está activo
    if (user.Estado !== "A") {
      return res.status(403).json({ error: "Usuario inactivo. Contacte con el administrador." });
    }

    // Verificar contraseña con bcrypt
    const isPasswordValid = await bcrypt.compare(Password, user.Password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Contraseña incorrecta." });
    }

    // Generar token JWT
    const token = jwt.sign(
      {
        ID_Usuario: user.ID_Usuario,
        Correo: user.Correo,
        Perfil: user.Perfil,
        rol: user.Roll,
      },
      process.env.JWT_SECRET,
      { expiresIn: "5h" } // Expira en 5 horas
    );

    // Respuesta al cliente
    res.status(200).json({
      success: true,
      message: "Inicio de sesión exitoso.",
      token,
      user: {
        id: user.ID_Usuario,
        nombre: user.Perfil,
        rol: user.Roll,
      },
    });

  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
};

// 🔹 LOGOUT
exports.logout = (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Sesión cerrada correctamente. El token debe eliminarse en el cliente.",
  });
};
