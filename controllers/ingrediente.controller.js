const { sql, getConnection } = require("../config/Connection");
const bdModel = require("../models/bd.models");

// ==================================================
// 🔄 Mapper: adapta una fila SQL al modelo Insumo
// ==================================================
function mapToInsumo(row = {}) {
  const template = bdModel?.Insumo || {
    ID_Insumo: 0,
    Nombre: "",
    Descripcion: "",
    Unidad_Med: "",
    ID_Categoria_I: 0,
    Stock_Min: 0,
    Stock_Max: 0,
    Estado: "D",
    Fecha_Registro: ""
  };

  return {
    ...template,
    ID_Insumo: row.ID_Insumo ?? template.ID_Insumo,
    Nombre: row.Nombre ?? template.Nombre,
    Descripcion: row.Descripcion ?? template.Descripcion,
    Unidad_Med: row.Unidad_Med ?? template.Unidad_Med,
    ID_Categoria_I: row.ID_Categoria_I ?? template.ID_Categoria_I,
    Stock_Min: row.Stock_Min ?? template.Stock_Min,
    Stock_Max: row.Stock_Max ?? template.Stock_Max,
    Estado: row.Estado ?? template.Estado,
    Fecha_Registro: row.Fecha_Registro ?? template.Fecha_Registro
  };
}

// ==================================================
// 🔧 Función auxiliar: Crear stock con proveedor
// ==================================================
async function crearStockConProveedor(ID_Insumo, ID_Proveedor, Costo_Unitario, Fecha_Vencimiento, pool, transaction = null) {
  try {
    const request = transaction ? new sql.Request(transaction) : pool.request();
    
    const proveedorValue = (ID_Proveedor === "" || ID_Proveedor === null || ID_Proveedor === undefined) ? null : ID_Proveedor;
    const costoValue = Costo_Unitario != null ? Costo_Unitario : 0.0;
    const fechaVencValue = (Fecha_Vencimiento === "" || Fecha_Vencimiento === null || Fecha_Vencimiento === undefined) ? null : Fecha_Vencimiento;
    
    await request
      .input("ID_Insumo", sql.Int, ID_Insumo)
      .input("ID_Proveedor", sql.Int, proveedorValue)
      .input("Cantidad_Recibida", sql.Int, 0)
      .input("Costo_Unitario", sql.Decimal(10, 2), costoValue)
      .input("Costo_Total", sql.Decimal(10, 2), 0.0)
      .input("Fecha_Entrada", sql.Date, new Date())
      .input("Fecha_Vencimiento", sql.Date, fechaVencValue)
      .input("Estado", sql.Char(1), "A")
      .query(`
        INSERT INTO Stock (
          ID_Insumo, ID_Proveedor, Cantidad_Recibida,
          Costo_Unitario, Costo_Total, Fecha_Entrada, Fecha_Vencimiento, Estado
        ) VALUES (
          @ID_Insumo, @ID_Proveedor, @Cantidad_Recibida,
          @Costo_Unitario, @Costo_Total, @Fecha_Entrada, @Fecha_Vencimiento, @Estado
        )
      `);
    
    console.log(`✅ Stock creado con proveedor para insumo ID: ${ID_Insumo}`);
    return true;
  } catch (error) {
    console.error(`❌ Error al crear stock con proveedor para insumo ${ID_Insumo}:`, error);
    throw error;
  }
}

// ==================================================
// 🔧 Función auxiliar: Actualizar stock con proveedor
// ==================================================
async function actualizarStockConProveedor(ID_Insumo, ID_Proveedor, Costo_Unitario, Fecha_Vencimiento, pool, transaction = null) {
  try {
    const request = transaction ? new sql.Request(transaction) : pool.request();
    
    const proveedorValue = (ID_Proveedor === "" || ID_Proveedor === null || ID_Proveedor === undefined) ? null : ID_Proveedor;
    const costoValue = Costo_Unitario != null ? Costo_Unitario : 0.0;
    const fechaVencValue = (Fecha_Vencimiento === "" || Fecha_Vencimiento === null || Fecha_Vencimiento === undefined) ? null : Fecha_Vencimiento;
    
    const checkStock = await request
      .input("ID_Insumo", sql.Int, ID_Insumo)
      .query("SELECT ID_Stock FROM Stock WHERE ID_Insumo = @ID_Insumo AND Estado = 'A'");

    if (checkStock.recordset.length > 0) {
      await request
        .input("ID_Proveedor", sql.Int, proveedorValue)
        .input("Costo_Unitario", sql.Decimal(10, 2), costoValue)
        .input("Fecha_Vencimiento", sql.Date, fechaVencValue)
        .query(`
          UPDATE Stock SET 
            ID_Proveedor = @ID_Proveedor,
            Costo_Unitario = @Costo_Unitario,
            Fecha_Vencimiento = @Fecha_Vencimiento
          WHERE ID_Insumo = @ID_Insumo AND Estado = 'A'
        `);
      console.log(`✅ Stock actualizado para insumo ID: ${ID_Insumo}`);
    } else {
      await crearStockConProveedor(ID_Insumo, ID_Proveedor, Costo_Unitario, Fecha_Vencimiento, pool, transaction);
    }
    return true;
  } catch (error) {
    console.error(`❌ Error al actualizar stock para insumo ${ID_Insumo}:`, error);
    throw error;
  }
}

// ==================================================
// 📘 Obtener todos los insumos
// ==================================================
exports.getInsumos = async (_req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query("SELECT * FROM Insumos ORDER BY Nombre ASC");
    const insumos = (result.recordset || []).map(mapToInsumo);
    return res.status(200).json(insumos);
  } catch (err) {
    console.error("getInsumos error:", err);
    return res.status(500).json({ error: "Error al obtener los insumos" });
  }
};

// ==================================================
// 📘 Obtener un insumo por ID
// ==================================================
exports.getInsumoById = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getConnection();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM Insumos WHERE ID_Insumo = @id");

    if (!result.recordset.length) {
      return res.status(404).json({ error: "Insumo no encontrado" });
    }

    return res.status(200).json(mapToInsumo(result.recordset[0]));
  } catch (err) {
    console.error("getInsumoById error:", err);
    return res.status(500).json({ error: "Error al obtener el insumo" });
  }
};

// ==================================================
// 📗 Crear un nuevo insumo (CON STOCK INICIAL)
// ==================================================
exports.createInsumo = async (req, res) => {
  const {
    Nombre, Descripcion, Unidad_Med, ID_Categoria_I, Stock_Min,
    ID_Proveedor, Costo_Unitario, Fecha_Vencimiento
  } = req.body;

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);

  try {
    if (!Nombre || !Unidad_Med || ID_Categoria_I == null) {
      return res.status(400).json({ error: "Faltan campos obligatorios: Nombre, Unidad_Med o ID_Categoria_I" });
    }

    await transaction.begin();

    // 1. Insertar Insumo
    const resultInsumo = await new sql.Request(transaction)
      .input("Nombre", sql.VarChar(100), Nombre)
      .input("Descripcion", sql.VarChar(255), Descripcion || "")
      .input("Unidad_Med", sql.VarChar(50), Unidad_Med)
      .input("ID_Categoria_I", sql.Int, ID_Categoria_I)
      .input("Stock_Min", sql.Int, (Stock_Min ?? 0))
      .input("Stock_Max", sql.Int, 1000)
      .input("Estado", sql.Char(1), "D")
      .input("Fecha_Registro", sql.DateTime, new Date())
      .query(`
        INSERT INTO Insumos (Nombre, Descripcion, Unidad_Med, ID_Categoria_I, Stock_Min, Stock_Max, Estado, Fecha_Registro) 
        OUTPUT INSERTED.ID_Insumo
        VALUES (@Nombre, @Descripcion, @Unidad_Med, @ID_Categoria_I, @Stock_Min, @Stock_Max, @Estado, @Fecha_Registro)
      `);

    const ID_Insumo = resultInsumo.recordset[0].ID_Insumo;

    // 2. Crear Stock Inicial
    await crearStockConProveedor(ID_Insumo, ID_Proveedor, Costo_Unitario, Fecha_Vencimiento, pool, transaction);

    await transaction.commit();
    return res.status(201).json({ 
      message: "Insumo registrado correctamente",
      ID_Insumo: ID_Insumo
    });

  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error("createInsumo error:", err);
    return res.status(500).json({ error: "Error al registrar el insumo" });
  }
};

// ==================================================
// 📙 Actualizar insumo
// ==================================================
exports.updateInsumo = async (req, res) => {
  const { id } = req.params;
  const {
    Nombre, Descripcion, Unidad_Med, ID_Categoria_I, Stock_Min, Stock_Max,
    ID_Proveedor, Costo_Unitario, Fecha_Vencimiento
  } = req.body;

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // 1. Update Insumo
    const request = new sql.Request(transaction);
    request.input("id", sql.Int, id);
    let query = "UPDATE Insumos SET";
    let hasUpdates = false;

    if (Nombre !== undefined) { query += " Nombre = @Nombre,"; request.input("Nombre", sql.VarChar(100), Nombre); hasUpdates = true; }
    if (Descripcion !== undefined) { query += " Descripcion = @Descripcion,"; request.input("Descripcion", sql.VarChar(255), Descripcion); hasUpdates = true; }
    if (Unidad_Med !== undefined) { query += " Unidad_Med = @Unidad_Med,"; request.input("Unidad_Med", sql.VarChar(50), Unidad_Med); hasUpdates = true; }
    if (ID_Categoria_I !== undefined) { query += " ID_Categoria_I = @ID_Categoria_I,"; request.input("ID_Categoria_I", sql.Int, ID_Categoria_I); hasUpdates = true; }
    if (Stock_Min !== undefined) { query += " Stock_Min = @Stock_Min,"; request.input("Stock_Min", sql.Int, Stock_Min); hasUpdates = true; }
    if (Stock_Max !== undefined) { query += " Stock_Max = @Stock_Max,"; request.input("Stock_Max", sql.Int, Stock_Max); hasUpdates = true; }

    if (hasUpdates) {
      query = query.slice(0, -1) + " WHERE ID_Insumo = @id";
      const result = await request.query(query);
      if (result.rowsAffected[0] === 0) {
        await transaction.rollback();
        return res.status(404).json({ error: "Insumo no encontrado" });
      }
    }

    // 2. Update Stock/Proveedor
    if (ID_Proveedor !== undefined || Costo_Unitario !== undefined || Fecha_Vencimiento !== undefined) {
      await actualizarStockConProveedor(id, ID_Proveedor, Costo_Unitario, Fecha_Vencimiento, pool, transaction);
    }

    // 3. Auto-Actualizar Estado según Stock
    const estadoRequest = new sql.Request(transaction);
    const stockRes = await estadoRequest.input("ID", sql.Int, id)
        .query("SELECT s.Cantidad_Recibida, i.Stock_Min FROM Stock s JOIN Insumos i ON s.ID_Insumo=i.ID_Insumo WHERE s.ID_Insumo=@ID AND s.Estado='A'");
    
    if (stockRes.recordset.length > 0) {
        const { Cantidad_Recibida, Stock_Min } = stockRes.recordset[0];
        const nuevoEstado = (Cantidad_Recibida < Stock_Min) ? 'A' : 'D'; // A=Agotado?, D=Disponible
        // Nota: En tu modelo 'A' suele ser Agotado y 'D' Disponible, ajusta si es al revés
        await new sql.Request(transaction).input("E", sql.Char(1), nuevoEstado).input("ID", sql.Int, id)
            .query("UPDATE Insumos SET Estado=@E WHERE ID_Insumo=@ID");
    }

    await transaction.commit();
    return res.status(200).json({ message: "Insumo actualizado correctamente" });

  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error("updateInsumo error:", err);
    return res.status(500).json({ error: "Error al actualizar el insumo" });
  }
};

// ==================================================
// 📕 Eliminar insumo (CASCADA: Movimientos -> Stock -> Insumo)
// ==================================================
exports.deleteInsumo = async (req, res) => {
  const { id } = req.params;
  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // 1. Verificar existencia
    const check = await new sql.Request(transaction).input("id", sql.Int, id).query("SELECT ID_Insumo FROM Insumos WHERE ID_Insumo = @id");
    if (check.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ error: "Insumo no encontrado" });
    }

    // 2. Borrar Movimientos
    await new sql.Request(transaction).input("id", sql.Int, id).query("DELETE FROM Stock_Movimiento WHERE ID_Stock IN (SELECT ID_Stock FROM Stock WHERE ID_Insumo = @id)");

    // 3. Borrar Stock
    await new sql.Request(transaction).input("id", sql.Int, id).query("DELETE FROM Stock WHERE ID_Insumo = @id");

    // 4. Borrar Insumo
    await new sql.Request(transaction).input("id", sql.Int, id).query("DELETE FROM Insumos WHERE ID_Insumo = @id");

    await transaction.commit();
    return res.status(200).json({ message: "Insumo eliminado correctamente" });

  } catch (err) {
    if (transaction._aborted === false) await transaction.rollback();
    console.error("deleteInsumo error:", err);
    if (err.number === 547) return res.status(409).json({ error: "No se puede eliminar: Está en uso en recetas o productos." });
    return res.status(500).json({ error: "Error al eliminar" });
  }
};