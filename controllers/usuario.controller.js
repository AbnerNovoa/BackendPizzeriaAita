const { sql, getConnection } = require("../config/Connection");
const bdModel = require("../models/bd.models");
const bcrypt = require("bcryptjs");

// ==============================
// 🔄 Mapper: adapta fila DB al modelo (SIN PASSWORD)
// ==============================
function mapToUsuario(row = {}) {
  const template = bdModel?.Usuario || {};

  return {
    ...template,
    ID_Usuario: row.ID_Usuario ?? template.ID_Usuario,
    Perfil: row.Perfil ?? template.Perfil,
    Correo: row.Correo ?? template.Correo,
    // ⚠️ IMPORTANTE: No devolvemos el password por seguridad
    Password: "",
    Roll: row.Roll ?? template.Roll,
    Estado: row.Estado ?? template.Estado,
    Fecha_Registro: row.Fecha_Registro ?? template.Fecha_Registro,
  };
}

// ==============================
// 📘 Obtener todos los usuarios
// ==============================
exports.getUsuarios = async (_req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT ID_Usuario, Perfil, Correo, Roll, Estado, Fecha_Registro 
      FROM Usuario 
      ORDER BY ID_Usuario DESC
    `);

    const usuarios = (result.recordset || []).map(mapToUsuario);
    return res.status(200).json(usuarios);
  } catch (err) {
    console.error("getUsuarios error:", err);
    return res.status(500).json({ error: "Error al obtener los usuarios" });
  }
};

// ==============================
// 📘 Obtener usuario por ID
// ==============================
exports.getUsuarioById = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getConnection();
    const result = await pool.request().input("id", sql.Int, id).query(`
        SELECT ID_Usuario, Perfil, Correo, Roll, Estado, Fecha_Registro 
        FROM Usuario 
        WHERE ID_Usuario = @id
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    return res.status(200).json(mapToUsuario(result.recordset[0]));
  } catch (err) {
    console.error("getUsuarioById error:", err);
    return res.status(500).json({ error: "Error al obtener el usuario" });
  }
};

// ==============================
// 📗 Crear usuario (MEJORADO: Retorna objeto sin password)
// ==============================
exports.createUsuario = async (req, res) => {
  const { Perfil, Correo, Password, Roll, Estado } = req.body;

  try {
    if (!Perfil || !Correo || !Password) {
      return res.status(400).json({
        error: "Faltan campos obligatorios: Perfil, Correo y Password",
      });
    }

    const pool = await getConnection();

    // 1. Verificar duplicado de correo
    const exists = await pool
      .request()
      .input("Correo", sql.VarChar(100), Correo)
      .query("SELECT ID_Usuario FROM Usuario WHERE Correo = @Correo");

    if (exists.recordset.length > 0) {
      return res
        .status(409)
        .json({ error: "El correo electrónico ya está registrado." });
    }

    // 2. Encriptar contraseña
    const hashed = await bcrypt.hash(Password, 10);

    // 3. Insertar y devolver ID
    const result = await pool
      .request()
      .input("Perfil", sql.VarChar(50), Perfil)
      .input("Correo", sql.VarChar(100), Correo)
      .input("Password", sql.VarChar(255), hashed)
      .input("Roll", sql.Char(1), Roll || "E")
      .input("Estado", sql.Char(1), Estado || "A")
      .input("Fecha", sql.DateTime, new Date()).query(`
        INSERT INTO Usuario (Perfil, Correo, Password, Roll, Estado, Fecha_Registro)
        OUTPUT INSERTED.ID_Usuario
        VALUES (@Perfil, @Correo, @Password, @Roll, @Estado, @Fecha)
      `);

    const newId = result.recordset[0].ID_Usuario;

    // 4. Devolver usuario creado (sin password)
    const newUser = await pool
      .request()
      .input("id", sql.Int, newId)
      .query(
        "SELECT ID_Usuario, Perfil, Correo, Roll, Estado, Fecha_Registro FROM Usuario WHERE ID_Usuario = @id",
      );

    return res.status(201).json({
      message: "Usuario creado exitosamente",
      usuario: mapToUsuario(newUser.recordset[0]),
    });
  } catch (err) {
    console.error("createUsuario error:", err);
    return res.status(500).json({ error: "Error al crear el usuario" });
  }
};

// ==============================
// 📙 Actualizar usuario
// ==============================
exports.updateUsuario = async (req, res) => {
  const { id } = req.params;
  const { Perfil, Roll, Estado, Correo, Password } = req.body;

  try {
    const pool = await getConnection();

    // Validar correo duplicado si se cambia
    if (Correo) {
      const check = await pool
        .request()
        .input("Correo", sql.VarChar(100), Correo)
        .input("id", sql.Int, id)
        .query(
          "SELECT ID_Usuario FROM Usuario WHERE Correo = @Correo AND ID_Usuario <> @id",
        );

      if (check.recordset.length > 0) {
        return res
          .status(409)
          .json({ error: "El correo ya está en uso por otro usuario." });
      }
    }

    const request = pool.request();
    request.input("id", sql.Int, id);

    let updateParts = [];
    if (Perfil !== undefined) {
      updateParts.push("Perfil = @Perfil");
      request.input("Perfil", sql.VarChar(50), Perfil);
    }
    if (Correo !== undefined) {
      updateParts.push("Correo = @Correo");
      request.input("Correo", sql.VarChar(100), Correo);
    }
    if (Roll !== undefined) {
      updateParts.push("Roll = @Roll");
      request.input("Roll", sql.Char(1), Roll);
    }
    if (Estado !== undefined) {
      updateParts.push("Estado = @Estado");
      request.input("Estado", sql.Char(1), Estado);
    }

    if (Password !== undefined && Password.trim() !== "") {
      const hashed = await bcrypt.hash(Password, 10);
      updateParts.push("Password = @Password");
      request.input("Password", sql.VarChar(255), hashed);
    }

    if (updateParts.length === 0) {
      return res
        .status(400)
        .json({ error: "No se proporcionaron campos para actualizar" });
    }

    const query = `UPDATE Usuario SET ${updateParts.join(", ")} WHERE ID_Usuario = @id`;
    const result = await request.query(query);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    return res
      .status(200)
      .json({ message: "Usuario actualizado exitosamente" });
  } catch (err) {
    console.error("updateUsuario error:", err);
    return res.status(500).json({ error: "Error al actualizar el usuario" });
  }
};

// ==============================
// 📕 Eliminar usuario (MEJORADO: Check dependencias)
// ==============================
exports.deleteUsuario = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getConnection();

    // 1. Verificar si tiene ventas asociadas
    const checkVentas = await pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT COUNT(*) as count FROM Pedido WHERE ID_Usuario = @id"); // Usamos Pedido porque Venta se liga a Pedido

    if (checkVentas.recordset[0].count > 0) {
      return res.status(409).json({
        error:
          "No se puede eliminar: El usuario ha registrado pedidos/ventas. Desactívelo en su lugar.",
      });
    }

    // 2. Verificar si tiene movimientos de stock
    const checkStock = await pool
      .request()
      .input("id", sql.Int, id)
      .query(
        "SELECT COUNT(*) as count FROM Stock_Movimiento WHERE Usuario_ID = @id",
      );

    if (checkStock.recordset[0].count > 0) {
      return res.status(409).json({
        error:
          "No se puede eliminar: El usuario ha realizado movimientos de inventario.",
      });
    }

    // 3. Eliminar
    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .query("DELETE FROM Usuario WHERE ID_Usuario = @id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    return res.status(200).json({ message: "Usuario eliminado exitosamente" });
  } catch (err) {
    console.error("deleteUsuario error:", err);
    return res.status(500).json({ error: "Error al eliminar el usuario" });
  }
};

// ==============================
// 🔐 Cambiar contraseña (Específico)
// ==============================
exports.changePassword = async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  try {
    if (!password)
      return res
        .status(400)
        .json({ error: "Debe ingresar una nueva contraseña" });

    const hashed = await bcrypt.hash(password, 10);
    const pool = await getConnection();

    const result = await pool
      .request()
      .input("Password", sql.VarChar(255), hashed)
      .input("id", sql.Int, id)
      .query("UPDATE Usuario SET Password = @Password WHERE ID_Usuario = @id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    return res
      .status(200)
      .json({ message: "Contraseña actualizada correctamente" });
  } catch (err) {
    console.error("changePassword error:", err);
    return res.status(500).json({ error: "Error al cambiar la contraseña" });
  }
};

// ==============================
// 🔄 Cambiar estado (Activo/Inactivo)
// ==============================
exports.statusUsuario = async (req, res) => {
  const { id } = req.params;
  const { Estado } = req.body; // Recibimos el estado deseado explícitamente

  try {
    const pool = await getConnection();

    // Si no envían estado, hacemos toggle (invertir)
    let nuevoEstado = Estado;

    if (!nuevoEstado) {
      const check = await pool
        .request()
        .input("id", sql.Int, id)
        .query("SELECT Estado FROM Usuario WHERE ID_Usuario = @id");
      if (!check.recordset.length)
        return res.status(404).json({ error: "Usuario no encontrado" });
      nuevoEstado = check.recordset[0].Estado === "A" ? "I" : "A";
    }

    await pool
      .request()
      .input("id", sql.Int, id)
      .input("Estado", sql.Char(1), nuevoEstado)
      .query("UPDATE Usuario SET Estado = @Estado WHERE ID_Usuario = @id");

    return res.status(200).json({
      message: `Estado actualizado a ${nuevoEstado === "A" ? "Activo" : "Inactivo"}`,
      estado: nuevoEstado,
    });
  } catch (err) {
    console.error("statusUsuario error:", err);
    return res
      .status(500)
      .json({ error: "Error al cambiar el estado del usuario" });
  }
};
