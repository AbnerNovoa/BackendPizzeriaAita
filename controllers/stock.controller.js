const { sql, getConnection } = require("../config/Connection");
const bdModel = require("../models/bd.models");

// ==============================
// 🔄 Mappers (MEJORADO: Incluye Porcentaje y Estado Visual)
// ==============================
function mapToStock(row = {}) {
  const template = bdModel?.Stock || {};
  
  // 🧮 Cálculo Matemático de Porcentaje (En memoria, no toca BD)
  const cantidad = row.Cantidad_Recibida || 0;
  const maximo = row.Stock_Max || 1; // Evitar división por cero
  let porcentaje = 0;
  
  if (maximo > 0) {
    porcentaje = ((cantidad / maximo) * 100).toFixed(2); // Ej: "10.50"
  }

  // Estado visual para el Frontend
  let estadoLlenado = "Normal";
  if (porcentaje <= 10) estadoLlenado = "Crítico 🔴";
  else if (porcentaje <= 30) estadoLlenado = "Bajo 🟠";
  else if (porcentaje >= 90) estadoLlenado = "Lleno 🟢";

  return {
    ...template,
    ID_Stock: row.ID_Stock ?? template.ID_Stock,
    ID_Insumo: row.ID_Insumo ?? template.ID_Insumo,
    
    // Datos extraídos del JOIN con Insumos
    Nombre_Insumo: row.Nombre_Insumo || "Desconocido", 
    Unidad_Med: row.Unidad_Med || "",
    Stock_Max_Insumo: row.Stock_Max || 0,
    
    // 📊 Datos Calculados
    Porcentaje_Llenado: `${porcentaje}%`,
    Valor_Porcentaje: parseFloat(porcentaje),
    Estado_Llenado: estadoLlenado,

    ID_Proveedor: row.ID_Proveedor ?? template.ID_Proveedor,
    Cantidad_Recibida: row.Cantidad_Recibida ?? template.Cantidad_Recibida,
    Costo_Unitario: row.Costo_Unitario ?? template.Costo_Unitario,
    Costo_Total: row.Costo_Total ?? template.Costo_Total,
    Fecha_Entrada: row.Fecha_Entrada ?? template.Fecha_Entrada,
    Fecha_Vencimiento: row.Fecha_Vencimiento ?? template.Fecha_Vencimiento,
    Estado: row.Estado ?? template.Estado
  };
}

function mapToMovimientoStock(row = {}) {
  const template = bdModel?.StockMovimiento || {};
  return {
    ...template,
    ID_Stock_M: row.ID_Stock_M ?? template.ID_Stock_M,
    ID_Stock: row.ID_Stock ?? template.ID_Stock,
    Tipo_Mov: row.Tipo_Mov ?? template.Tipo_Mov,
    Motivo: row.Motivo ?? template.Motivo,
    Cantidad: row.Cantidad ?? template.Cantidad,
    Stock_ACT: row.Stock_ACT ?? template.Stock_ACT,
    Usuario_ID: row.Usuario_ID ?? template.Usuario_ID,
    Fecha_Mov: row.Fecha_Mov ?? template.Fecha_Mov,
    Estado: row.Estado ?? template.Estado
  };
}

// ==============================
// 🔧 Helper: Actualizar estado Insumo según Stock
// ==============================
async function actualizarEstadoInsumo(ID_Insumo, pool, transaction = null) {
  try {
    const request = transaction ? new sql.Request(transaction) : pool.request();
    const result = await request.input("InsumoID", sql.Int, ID_Insumo)
      .query(`SELECT s.Cantidad_Recibida FROM Stock s WHERE s.ID_Insumo = @InsumoID AND s.Estado = 'A'`);

    // Si hay stock activo y cantidad > 0, el insumo está disponible ('D')
    // Si cantidad es 0, está agotado/activo ('A') -> Ajusta esto según tu lógica de negocio 'A' vs 'D'
    if (result.recordset.length > 0) {
      const cantidad = result.recordset[0].Cantidad_Recibida;
      const nuevoEstado = cantidad <= 0 ? 'A' : 'D'; 
      
      const updateReq = transaction ? new sql.Request(transaction) : pool.request();
      await updateReq.input("E", sql.Char(1), nuevoEstado).input("ID", sql.Int, ID_Insumo)
        .query("UPDATE Insumos SET Estado = @E WHERE ID_Insumo = @ID");
    }
  } catch (error) { console.error("Error actualizando estado insumo:", error); }
}

// ==============================
// 🔔 Endpoint: Obtener Alertas de Vencimiento
// ==============================
exports.getAlertasVencimiento = async (_req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT s.ID_Stock, i.Nombre as Nombre_Insumo, s.Fecha_Vencimiento, 
             DATEDIFF(day, GETDATE(), s.Fecha_Vencimiento) as Dias_Restantes
      FROM Stock s
      INNER JOIN Insumos i ON s.ID_Insumo = i.ID_Insumo
      WHERE s.Estado = 'A' AND s.Cantidad_Recibida > 0 AND s.Fecha_Vencimiento IS NOT NULL
      AND DATEDIFF(day, GETDATE(), s.Fecha_Vencimiento) <= 7
      ORDER BY s.Fecha_Vencimiento ASC
    `);

    const alertas = result.recordset.map(row => ({
        id: row.ID_Stock,
        mensaje: row.Dias_Restantes < 0 
            ? `⚠️ El insumo '${row.Nombre_Insumo}' YA VENCIÓ.`
            : `⚠️ El insumo '${row.Nombre_Insumo}' vence en ${row.Dias_Restantes} días.`,
        tipo: row.Dias_Restantes < 0 ? "error" : "warning"
    }));
    return res.status(200).json(alertas);
  } catch (err) { return res.status(500).json({ error: "Error obteniendo alertas" }); }
};

// ==============================
// 📘 Obtener stocks (CON DATOS DE INSUMO)
// ==============================
exports.getStocks = async (_req, res) => {
  try {
    const pool = await getConnection();
    const query = `
      SELECT s.*, i.Nombre as Nombre_Insumo, i.Unidad_Med, i.Stock_Max
      FROM Stock s
      INNER JOIN Insumos i ON s.ID_Insumo = i.ID_Insumo
      WHERE s.Estado = 'A'
      ORDER BY s.Fecha_Entrada DESC
    `;
    const result = await pool.request().query(query);
    return res.status(200).json(result.recordset.map(mapToStock));
  } catch (err) { return res.status(500).json({ error: "Error al obtener stocks" }); }
};

// ==============================
// 📘 Obtener stock por ID
// ==============================
exports.getStockById = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getConnection();
    const result = await pool.request().input("id", sql.Int, id).query(`
      SELECT s.*, i.Nombre as Nombre_Insumo, i.Unidad_Med, i.Stock_Max
      FROM Stock s
      INNER JOIN Insumos i ON s.ID_Insumo = i.ID_Insumo
      WHERE s.ID_Stock = @id
    `);
    if (!result.recordset.length) return res.status(404).json({ error: "Stock no encontrado" });
    return res.status(200).json(mapToStock(result.recordset[0]));
  } catch (err) { return res.status(500).json({ error: "Error al obtener stock" }); }
};

// ==============================
// 📘 (RECUPERADA) Obtener stock por ID Insumo
// ==============================
exports.getStockByInsumoId = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getConnection();
    const result = await pool.request().input("id", sql.Int, id).query(`
      SELECT s.*, i.Nombre as Nombre_Insumo, i.Unidad_Med, i.Stock_Max
      FROM Stock s
      INNER JOIN Insumos i ON s.ID_Insumo = i.ID_Insumo
      WHERE s.ID_Insumo = @id AND s.Estado = 'A'
    `);
    return res.status(200).json(result.recordset.map(mapToStock));
  } catch (err) { return res.status(500).json({ error: "Error al obtener stock de insumo" }); }
};

// ==============================
// 📗 Crear Stock
// ==============================
exports.createStock = async (req, res) => {
  const { ID_Insumo, ID_Proveedor, Cantidad_Recibida, Costo_Unitario, Fecha_Entrada, Fecha_Vencimiento, Estado } = req.body;
  try {
    if (!ID_Insumo || Cantidad_Recibida == null || Costo_Unitario == null) return res.status(400).json({ error: "Faltan datos" });

    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const costoTotal = Number((Cantidad_Recibida * Costo_Unitario).toFixed(2));
      const prov = (ID_Proveedor === "" || ID_Proveedor == null) ? null : ID_Proveedor;

      const result = await new sql.Request(transaction)
        .input("ID_Insumo", sql.Int, ID_Insumo)
        .input("ID_Proveedor", sql.Int, prov)
        .input("Cantidad_Recibida", sql.Int, Cantidad_Recibida)
        .input("Costo_Unitario", sql.Decimal(10, 2), Costo_Unitario)
        .input("Costo_Total", sql.Decimal(10, 2), costoTotal)
        .input("Fecha_Entrada", sql.Date, Fecha_Entrada || new Date())
        .input("Fecha_Vencimiento", sql.Date, Fecha_Vencimiento || null)
        .input("Estado", sql.Char(1), Estado || "A")
        .query(`
          INSERT INTO Stock (ID_Insumo, ID_Proveedor, Cantidad_Recibida, Costo_Unitario, Costo_Total, Fecha_Entrada, Fecha_Vencimiento, Estado)
          OUTPUT INSERTED.ID_Stock
          VALUES (@ID_Insumo, @ID_Proveedor, @Cantidad_Recibida, @Costo_Unitario, @Costo_Total, @Fecha_Entrada, @Fecha_Vencimiento, @Estado)
        `);

      await actualizarEstadoInsumo(ID_Insumo, pool, transaction);
      await transaction.commit();
      return res.status(201).json({ message: "Stock creado", ID_Stock: result.recordset[0].ID_Stock });
    } catch (err) { await transaction.rollback(); throw err; }
  } catch (err) { console.error(err); return res.status(500).json({ error: "Error al crear" }); }
};

// ==============================
// 📙 Actualizar Stock
// ==============================
exports.updateStock = async (req, res) => {
  const { id } = req.params;
  const { ID_Insumo, ID_Proveedor, Cantidad_Recibida, Costo_Unitario, Fecha_Vencimiento, Estado } = req.body;
  try {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const costoTotal = Number((Cantidad_Recibida * Costo_Unitario).toFixed(2));
      const prov = (ID_Proveedor === "" || ID_Proveedor == null) ? null : ID_Proveedor;

      const result = await new sql.Request(transaction)
        .input("id", sql.Int, id)
        .input("ID_Insumo", sql.Int, ID_Insumo)
        .input("ID_Proveedor", sql.Int, prov)
        .input("Cantidad_Recibida", sql.Int, Cantidad_Recibida)
        .input("Costo_Unitario", sql.Decimal(10, 2), Costo_Unitario)
        .input("Costo_Total", sql.Decimal(10, 2), costoTotal)
        .input("Fecha_Vencimiento", sql.Date, Fecha_Vencimiento)
        .input("Estado", sql.Char(1), Estado)
        .query(`UPDATE Stock SET ID_Insumo=@ID_Insumo, ID_Proveedor=@ID_Proveedor, Cantidad_Recibida=@Cantidad_Recibida,
                Costo_Unitario=@Costo_Unitario, Costo_Total=@Costo_Total, Fecha_Vencimiento=@Fecha_Vencimiento, Estado=@Estado WHERE ID_Stock=@id`);

      if (result.rowsAffected[0] === 0) { await transaction.rollback(); return res.status(404).json({ error: "No encontrado" }); }
      await actualizarEstadoInsumo(ID_Insumo, pool, transaction);
      await transaction.commit();
      return res.status(200).json({ message: "Stock actualizado" });
    } catch (err) { await transaction.rollback(); throw err; }
  } catch (err) { console.error(err); return res.status(500).json({ error: "Error al actualizar" }); }
};

// ==============================
// 📘 Obtener Movimientos
// ==============================
exports.getMovimientosStock = async (_req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query("SELECT * FROM Stock_Movimiento ORDER BY Fecha_Mov DESC");
    return res.status(200).json(result.recordset.map(mapToMovimientoStock));
  } catch (err) { return res.status(500).json({ error: "Error al obtener movimientos" }); }
};

// ==============================
// 📘 (RECUPERADA) Obtener Movimiento por ID
// ==============================
exports.getMovimientoStockById = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getConnection();
    const result = await pool.request().input("id", sql.Int, id).query("SELECT * FROM Stock_Movimiento WHERE ID_Stock_M = @id");
    if (!result.recordset.length) return res.status(404).json({ error: "Movimiento no encontrado" });
    return res.status(200).json(mapToMovimientoStock(result.recordset[0]));
  } catch (err) { return res.status(500).json({ error: "Error al obtener movimiento" }); }
};

// ==============================
// 📗 Crear Movimiento
// ==============================
exports.createMovimientoStock = async (req, res) => {
  const { ID_Stock, Tipo_Mov, Motivo, Cantidad } = req.body;
  const Usuario_ID = req.user?.ID_Usuario || null;

  try {
    if (!ID_Stock || !Tipo_Mov || Cantidad == null) return res.status(400).json({ error: "Faltan datos" });
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const stockRes = await new sql.Request(transaction).input("ID", sql.Int, ID_Stock)
        .query("SELECT Cantidad_Recibida, ID_Insumo, Costo_Unitario FROM Stock WHERE ID_Stock = @ID");
      if (!stockRes.recordset.length) { await transaction.rollback(); return res.status(404).json({ error: "Stock no encontrado" }); }

      const { Cantidad_Recibida, ID_Insumo, Costo_Unitario } = stockRes.recordset[0];
      const tipo = String(Tipo_Mov).toLowerCase();
      let nuevoStock = 0;

      if (tipo.includes("entrada") || tipo === "ajuste") nuevoStock = Cantidad_Recibida + Number(Cantidad);
      else if (tipo.includes("salida")) nuevoStock = Math.max(0, Cantidad_Recibida - Number(Cantidad));
      else { await transaction.rollback(); return res.status(400).json({ error: "Tipo inválido" }); }

      const nuevoCostoTotal = Number((nuevoStock * Costo_Unitario).toFixed(2));

      await new sql.Request(transaction).input("ID", sql.Int, ID_Stock).input("Tipo", sql.VarChar(50), Tipo_Mov)
        .input("Motivo", sql.VarChar(100), Motivo).input("Cant", sql.Int, Cantidad).input("Stock", sql.Int, nuevoStock)
        .input("User", sql.Int, Usuario_ID).input("Fecha", sql.DateTime, new Date())
        .query(`INSERT INTO Stock_Movimiento (ID_Stock, Tipo_Mov, Motivo, Cantidad, Stock_ACT, Usuario_ID, Fecha_Mov) 
                VALUES (@ID, @Tipo, @Motivo, @Cant, @Stock, @User, @Fecha)`);

      await new sql.Request(transaction).input("Cant", sql.Int, nuevoStock).input("Total", sql.Decimal(10, 2), nuevoCostoTotal).input("ID", sql.Int, ID_Stock)
        .query("UPDATE Stock SET Cantidad_Recibida = @Cant, Costo_Total = @Total WHERE ID_Stock = @ID");

      await actualizarEstadoInsumo(ID_Insumo, pool, transaction);
      await transaction.commit();
      return res.status(201).json({ message: "Movimiento registrado", Nuevo_Stock: nuevoStock });
    } catch (err) { await transaction.rollback(); throw err; }
  } catch (err) { console.error(err); return res.status(500).json({ error: "Error al crear movimiento" }); }
};

// ==============================
// 📙 (RECUPERADA) Actualizar Movimiento
// ==============================
exports.updateMovimientoStock = async (req, res) => {
  const { id } = req.params;
  const { Tipo_Mov, Motivo, Cantidad } = req.body;
  try {
    const pool = await getConnection();
    const request = pool.request().input("id", sql.Int, id);
    let updates = [];
    if (Tipo_Mov) { updates.push("Tipo_Mov=@T"); request.input("T", sql.VarChar(50), Tipo_Mov); }
    if (Motivo !== undefined) { updates.push("Motivo=@M"); request.input("M", sql.VarChar(100), Motivo); }
    if (Cantidad !== undefined) { updates.push("Cantidad=@C"); request.input("C", sql.Int, Cantidad); }
    
    if (!updates.length) return res.status(400).json({ error: "Nada que actualizar" });
    
    await request.query(`UPDATE Stock_Movimiento SET ${updates.join(",")} WHERE ID_Stock_M = @id`);
    return res.status(200).json({ message: "Movimiento actualizado" });
  } catch (err) { console.error(err); return res.status(500).json({ error: "Error al actualizar movimiento" }); }
};

// =====================================================================
// ⏰ WORKER DIARIO: Notificación de Vencimientos (Ejecución en segundo plano)
// =====================================================================
async function verificarVencimientosDiarios() {
    console.log("⏰ [System] Verificando vencimientos de stock...");
    try {
        const pool = await getConnection();
        const result = await pool.request().query(`
            SELECT i.Nombre, s.Fecha_Vencimiento, DATEDIFF(day, GETDATE(), s.Fecha_Vencimiento) as Dias
            FROM Stock s JOIN Insumos i ON s.ID_Insumo = i.ID_Insumo
            WHERE s.Estado = 'A' AND s.Cantidad_Recibida > 0 AND s.Fecha_Vencimiento IS NOT NULL
            AND DATEDIFF(day, GETDATE(), s.Fecha_Vencimiento) <= 7
        `);
        if (result.recordset.length > 0) {
            console.log("⚠️ ALERTAS DE VENCIMIENTO:");
            result.recordset.forEach(i => console.log(`   -> ${i.Nombre}: Vence en ${i.Dias} días`));
        }
    } catch (err) { console.error("❌ Error en worker:", err.message); }
}
// Ejecutar al inicio y cada 24h
setTimeout(verificarVencimientosDiarios, 5000);
setInterval(verificarVencimientosDiarios, 86400000);