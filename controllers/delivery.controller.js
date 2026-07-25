const { sql, getConnection } = require("../config/Connection");
const bdModel = require("../models/bd.models");

// ==============================
// 🔄 Mapper: adapta fila BD -> Modelo Delivery
// ==============================
function mapToDelivery(row = {}) {
  const template = bdModel.Delivery || {}; 

  return {
    ...template,
    ID_Delivery: row.ID_Delivery ?? template.ID_Delivery,
    ID_Pedido: row.ID_Pedido ?? template.ID_Pedido,
    Direccion: row.Direccion ?? template.Direccion,
    Estado_D: row.Estado_D ?? template.Estado_D // P=Pendiente, E=Entregado, C=Cancelado
  };
}

// ==============================
// 📘 Obtener todos los deliveries
// ==============================
exports.getDeliveries = async (_req, res) => {
  try {
    const pool = await getConnection();
    // Opcional: Podrías hacer un JOIN con Pedido/Cliente para ver quién recibe
    const result = await pool.request()
      .query("SELECT * FROM Delivery ORDER BY ID_Delivery DESC");

    const items = (result.recordset || []).map(mapToDelivery);
    return res.status(200).json(items);
  } catch (err) {
    console.error("getDeliveries error:", err);
    return res.status(500).json({ error: "Error al obtener los deliveries" });
  }
};

// ==============================
// 📘 Obtener un delivery por ID
// ==============================
exports.getDeliveryById = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getConnection();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM Delivery WHERE ID_Delivery = @id");

    if (!result.recordset.length) {
      return res.status(404).json({ error: "Delivery no encontrado" });
    }

    return res.status(200).json(mapToDelivery(result.recordset[0]));
  } catch (err) {
    console.error("getDeliveryById error:", err);
    return res.status(500).json({ error: "Error al obtener el delivery" });
  }
};

// ==============================
// 📗 Crear un nuevo delivery (MEJORADO: Retorna objeto)
// ==============================
exports.createDelivery = async (req, res) => {
  const { ID_Pedido, Direccion, Estado_D } = req.body;

  try {
    if (!ID_Pedido || !Direccion) {
      return res.status(400).json({ error: "Faltan campos obligatorios: ID_Pedido y Direccion" });
    }

    const pool = await getConnection();

    // 1. Validar que el Pedido exista
    const checkPedido = await pool.request()
      .input("ID_Pedido", sql.Int, ID_Pedido)
      .query("SELECT ID_Pedido FROM Pedido WHERE ID_Pedido = @ID_Pedido");

    if (checkPedido.recordset.length === 0) {
        return res.status(404).json({ error: "El Pedido especificado no existe" });
    }

    // 2. Insertar y obtener ID
    const result = await pool.request()
      .input("ID_Pedido", sql.Int, ID_Pedido)
      .input("Direccion", sql.VarChar(sql.MAX), Direccion) // VarChar(MAX) para textos largos
      .input("Estado_D", sql.Char(1), Estado_D || "P")
      .query(`
        INSERT INTO Delivery (ID_Pedido, Direccion, Estado_D)
        OUTPUT INSERTED.ID_Delivery
        VALUES (@ID_Pedido, @Direccion, @Estado_D)
      `);

    const newId = result.recordset[0].ID_Delivery;

    // 3. Retornar objeto completo
    const nuevoDelivery = await pool.request()
        .input("id", sql.Int, newId)
        .query("SELECT * FROM Delivery WHERE ID_Delivery = @id");

    return res.status(201).json({ 
        message: "Delivery registrado correctamente",
        delivery: mapToDelivery(nuevoDelivery.recordset[0])
    });

  } catch (err) {
    console.error("createDelivery error:", err);
    return res.status(500).json({ error: "Error al registrar el delivery" });
  }
};

// ==============================
// 📙 Actualizar delivery
// ==============================
exports.updateDelivery = async (req, res) => {
  const { id } = req.params;
  const { Direccion, Estado_D } = req.body;

  try {
    if (Direccion === undefined && Estado_D === undefined) {
      return res.status(400).json({ error: "Debe enviar Direccion y/o Estado_D para actualizar" });
    }

    const pool = await getConnection();
    const request = pool.request();
    request.input("id", sql.Int, id);

    const updates = [];
    
    if (Direccion !== undefined) {
      request.input("Direccion", sql.VarChar(sql.MAX), Direccion);
      updates.push("Direccion = @Direccion");
    }
    
    if (Estado_D !== undefined) {
      // Validar estado válido
      if (!['P','E','C'].includes(Estado_D)) {
          return res.status(400).json({ error: "Estado inválido. Use P (Pendiente), E (Entregado), C (Cancelado)" });
      }
      request.input("Estado_D", sql.Char(1), Estado_D);
      updates.push("Estado_D = @Estado_D");
    }

    const query = `UPDATE Delivery SET ${updates.join(", ")} WHERE ID_Delivery = @id`;
    
    const result = await request.query(query);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: "Delivery no encontrado" });
    }

    return res.status(200).json({ message: "Delivery actualizado correctamente" });
  } catch (err) {
    console.error("updateDelivery error:", err);
    return res.status(500).json({ error: "Error al actualizar el delivery" });
  }
};

// ==============================
// 📕 Eliminar delivery (NUEVO)
// ==============================
exports.deleteDelivery = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getConnection();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .query("DELETE FROM Delivery WHERE ID_Delivery = @id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: "Delivery no encontrado" });
    }

    return res.status(200).json({ message: "Delivery eliminado correctamente" });
  } catch (err) {
    console.error("deleteDelivery error:", err);
    return res.status(500).json({ error: "Error al eliminar el delivery" });
  }
};