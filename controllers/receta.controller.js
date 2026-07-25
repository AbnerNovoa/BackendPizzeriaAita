const { sql, getConnection } = require("../config/Connection");
const bdModel = require("../models/bd.models");

// ==============================
// ⏱️ Conversión Minutos <-> Time
// ==============================
function minutosToTimeString(minutos) {
  if (minutos == null || isNaN(minutos)) return null;
  const horas = Math.floor(minutos / 60);
  const mins = Math.floor(minutos % 60);
  return `${String(horas).padStart(2, "0")}:${String(mins).padStart(2, "0")}:00`;
}

function timeToString(value) {
  if (!value) return null;
  if (typeof value === "string" && value.includes("T")) { // ISO String
    const date = new Date(value);
    return date.toISOString().substr(11, 8); // HH:mm:ss
  }
  if (value instanceof Date) {
    return value.toISOString().substr(11, 8);
  }
  return value; // Asumimos string ya formateado
}

// ==============================
// 🔄 Mappers
// ==============================
function mapToReceta(row = {}) {
  const template = bdModel?.Receta || {};
  return {
    ...template,
    ID_Receta: row.ID_Receta ?? template.ID_Receta,
    Nombre: row.Nombre ?? template.Nombre,
    Descripcion: row.Descripcion ?? template.Descripcion,
    Tiempo_Preparacion: timeToString(row.Tiempo_Preparacion)
  };
}

function mapToDetalleReceta(row = {}) {
  const template = bdModel?.RecetaDetalle || {};
  return {
    ...template,
    ID_Receta_D: row.ID_Receta_D ?? template.ID_Receta_D,
    ID_Receta: row.ID_Receta ?? template.ID_Receta,
    ID_Insumo: row.ID_Insumo ?? template.ID_Insumo,
    Nombre_Insumo: row.Nombre_Insumo ?? "",
    Unidad_Med: row.Unidad_Med ?? "",
    Cantidad: row.Cantidad ?? template.Cantidad,
    Uso: row.Uso ?? template.Uso
  };
}

// ==============================
// 📘 Obtener todas las recetas
// ==============================
exports.getRecetas = async (_req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query("SELECT * FROM Receta ORDER BY ID_Receta DESC");
    const recetas = (result.recordset || []).map(mapToReceta);
    return res.status(200).json(recetas);
  } catch (err) {
    console.error("getRecetas error:", err);
    return res.status(500).json({ error: "Error al obtener las recetas" });
  }
};

// ==============================
// 📘 Obtener receta por ID (Solo datos básicos)
// ==============================
exports.getRecetaById = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getConnection();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM Receta WHERE ID_Receta = @id");

    if (!result.recordset.length) {
      return res.status(404).json({ error: "Receta no encontrada" });
    }

    return res.status(200).json(mapToReceta(result.recordset[0]));
  } catch (err) {
    console.error("getRecetaById error:", err);
    return res.status(500).json({ error: "Error al obtener la receta" });
  }
};

// ==============================
// 📘 Obtener Receta + Detalles (Estructura { receta, detalles })
// ==============================
exports.getRecetaDetalle = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getConnection();

    // 1. Obtener Cabecera
    const recRes = await pool.request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM Receta WHERE ID_Receta = @id");

    if (!recRes.recordset.length) {
      return res.status(404).json({ error: "Receta no encontrada" });
    }
    const receta = mapToReceta(recRes.recordset[0]);

    // 2. Obtener Detalles
    const detRes = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        SELECT rd.*, i.Nombre AS Nombre_Insumo, i.Unidad_Med
        FROM Receta_Detalle rd
        LEFT JOIN Insumos i ON rd.ID_Insumo = i.ID_Insumo
        WHERE rd.ID_Receta = @id
        ORDER BY rd.ID_Receta_D ASC
      `);
    
    const detalles = detRes.recordset.map(mapToDetalleReceta);

    return res.status(200).json({ receta, detalles });

  } catch (err) {
    console.error("getRecetaDetalle error:", err);
    return res.status(500).json({ error: "Error al obtener el detalle de la receta" });
  }
};

// ==============================
// 📘 Obtener SOLO los detalles de una receta
// ==============================
exports.getDetallesPorReceta = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getConnection();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        SELECT rd.*, i.Nombre AS Nombre_Insumo, i.Unidad_Med
        FROM Receta_Detalle rd
        LEFT JOIN Insumos i ON rd.ID_Insumo = i.ID_Insumo
        WHERE rd.ID_Receta = @id
        ORDER BY rd.ID_Receta_D ASC
      `);

    const detalles = result.recordset.map(mapToDetalleReceta);
    return res.status(200).json(detalles);
  } catch (err) {
    console.error("getDetallesPorReceta error:", err);
    return res.status(500).json({ error: "Error al obtener los detalles" });
  }
};

// ==============================
// 📗 Crear receta con detalles (Transaccional)
// ==============================
exports.createRecetaConDetalle = async (req, res) => {
  const { Nombre, Descripcion, Tiempo_Preparacion, Detalles } = req.body;

  if (!Nombre || !Array.isArray(Detalles) || Detalles.length === 0) {
    return res.status(400).json({
      error: "Faltan campos obligatorios: Nombre y al menos un detalle en 'Detalles'"
    });
  }

  let transaction;
  try {
    const pool = await getConnection();
    
    // Validar insumos antes de iniciar transacción
    const insumoIds = Detalles.map(d => d.ID_Insumo).filter(id => id);
    if (insumoIds.length > 0) {
        const checkInsumos = await pool.request().query(`SELECT ID_Insumo FROM Insumos WHERE ID_Insumo IN (${insumoIds.join(',')})`);
        if (checkInsumos.recordset.length !== insumoIds.length) {
            return res.status(400).json({ error: "Uno o más insumos especificados no existen." });
        }
    }

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Insertar Receta
    const tiempoStr = minutosToTimeString(Tiempo_Preparacion);
    const recRes = await new sql.Request(transaction)
      .input("Nombre", sql.VarChar(100), Nombre)
      .input("Descripcion", sql.Text, Descripcion || "")
      .input("Tiempo_Preparacion", sql.VarChar(8), tiempoStr)
      .query(`
        INSERT INTO Receta (Nombre, Descripcion, Tiempo_Preparacion)
        OUTPUT INSERTED.ID_Receta
        VALUES (@Nombre, @Descripcion, @Tiempo_Preparacion)
      `);

    const recetaId = recRes.recordset[0].ID_Receta;

    // Insertar Detalles
    for (const det of Detalles) {
      await new sql.Request(transaction)
        .input("ID_Receta", sql.Int, recetaId)
        .input("ID_Insumo", sql.Int, det.ID_Insumo)
        .input("Cantidad", sql.Decimal(10, 2), det.Cantidad)
        .input("Uso", sql.Text, det.Uso || null)
        .query(`INSERT INTO Receta_Detalle (ID_Receta, ID_Insumo, Cantidad, Uso) VALUES (@ID_Receta, @ID_Insumo, @Cantidad, @Uso)`);
    }

    await transaction.commit();

    return res.status(201).json({
      message: "Receta creada correctamente",
      ID_Receta: recetaId
    });

  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error("createRecetaConDetalle error:", err);
    return res.status(500).json({ error: "Error al crear la receta" });
  }
};

// ==============================
// 📙 Actualizar receta
// ==============================
exports.updateReceta = async (req, res) => {
  const { id } = req.params;
  const { Nombre, Descripcion, Tiempo_Preparacion, Detalles } = req.body;

  let transaction;
  try {
    const pool = await getConnection();
    
    const check = await pool.request().input("id", sql.Int, id).query("SELECT ID_Receta FROM Receta WHERE ID_Receta = @id");
    if (!check.recordset.length) return res.status(404).json({ error: "Receta no encontrada" });

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Update Header
    const reqUpd = new sql.Request(transaction);
    reqUpd.input("id", sql.Int, id);
    let updates = [];
    
    if (Nombre) { updates.push("Nombre=@Nombre"); reqUpd.input("Nombre", sql.VarChar(100), Nombre); }
    if (Descripcion !== undefined) { updates.push("Descripcion=@Desc"); reqUpd.input("Desc", sql.Text, Descripcion); }
    if (Tiempo_Preparacion !== undefined) { 
        updates.push("Tiempo_Preparacion=@Time"); 
        reqUpd.input("Time", sql.VarChar(8), minutosToTimeString(Tiempo_Preparacion)); 
    }

    if (updates.length > 0) {
        await reqUpd.query(`UPDATE Receta SET ${updates.join(", ")} WHERE ID_Receta = @id`);
    }

    // Update Detalles
    if (Array.isArray(Detalles)) {
        const reqDet = new sql.Request(transaction);
        reqDet.input("id", sql.Int, id);
        await reqDet.query("DELETE FROM Receta_Detalle WHERE ID_Receta = @id");

        for (const det of Detalles) {
            await new sql.Request(transaction)
                .input("ID_Receta", sql.Int, id)
                .input("ID_Insumo", sql.Int, det.ID_Insumo)
                .input("Cantidad", sql.Decimal(10, 2), det.Cantidad)
                .input("Uso", sql.Text, det.Uso || null)
                .query(`INSERT INTO Receta_Detalle (ID_Receta, ID_Insumo, Cantidad, Uso) VALUES (@ID_Receta, @ID_Insumo, @Cantidad, @Uso)`);
        }
    }

    await transaction.commit();
    return res.status(200).json({ message: "Receta actualizada correctamente" });

  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error("updateReceta error:", err);
    return res.status(500).json({ error: "Error al actualizar receta" });
  }
};

// ==============================
// 📕 Eliminar receta
// ==============================
exports.deleteReceta = async (req, res) => {
  const { id } = req.params;
  let transaction;
  try {
    const pool = await getConnection();

    // Verificar uso en productos
    const checkUso = await pool.request().input("id", sql.Int, id)
        .query("SELECT COUNT(*) as count FROM Producto WHERE ID_Receta = @id");
    
    if (checkUso.recordset[0].count > 0) {
        return res.status(409).json({ error: "No se puede eliminar: Receta en uso por un producto." });
    }

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    await new sql.Request(transaction).input("id", sql.Int, id).query("DELETE FROM Receta_Detalle WHERE ID_Receta = @id");
    const delRes = await new sql.Request(transaction).input("id", sql.Int, id).query("DELETE FROM Receta WHERE ID_Receta = @id");

    if (delRes.rowsAffected[0] === 0) {
        await transaction.rollback();
        return res.status(404).json({ error: "Receta no encontrada" });
    }

    await transaction.commit();
    return res.status(200).json({ message: "Receta eliminada correctamente" });

  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error("deleteReceta error:", err);
    return res.status(500).json({ error: "Error al eliminar receta" });
  }
};