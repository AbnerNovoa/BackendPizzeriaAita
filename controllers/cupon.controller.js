const { sql, getConnection } = require("../config/Connection");
const bdModel = require("../models/bd.models");

// ==============================================
// 🔄 Mapper: adapta una fila SQL al modelo Cupon
// ==============================================
function mapToCupon(row = {}) {
  const template = bdModel.Cupon || {}; // Usamos el modelo importado

  return {
    ...template,
    ID_Cupon: row.ID_Cupon ?? template.ID_Cupon,
    Cod_Cupon: row.Cod_Cupon ?? template.Cod_Cupon,
    Descripcion: row.Descripcion ?? template.Descripcion,
    Tipo_Desc: row.Tipo_Desc ?? template.Tipo_Desc,
    Valor_Desc: row.Valor_Desc ?? template.Valor_Desc,
    Monto_Max: row.Monto_Max ?? template.Monto_Max,
    Usos_Max: row.Usos_Max ?? template.Usos_Max,
    Usos_Act: row.Usos_Act ?? template.Usos_Act,
    Fecha_INC: row.Fecha_INC ?? template.Fecha_INC,
    Fecha_FIN: row.Fecha_FIN ?? template.Fecha_FIN,
    Estado: row.Estado ?? template.Estado,
    Fecha_Registro: row.Fecha_Registro ?? template.Fecha_Registro
  };
}

// ==============================================
// 📘 Obtener todos los cupones
// ==============================================
exports.getCupones = async (_req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query("SELECT * FROM Cupones ORDER BY ID_Cupon DESC"); // Orden descendente para ver los nuevos primero
    const cupones = (result.recordset || []).map(mapToCupon);
    return res.status(200).json(cupones);
  } catch (err) {
    console.error("getCupones error:", err);
    return res.status(500).json({ error: "Error al obtener los cupones" });
  }
};

// ==============================================
// 📘 Obtener un cupón por ID
// ==============================================
exports.getCuponById = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getConnection();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM Cupones WHERE ID_Cupon = @id");

    if (!result.recordset.length) {
      return res.status(404).json({ error: "Cupón no encontrado" });
    }

    return res.status(200).json(mapToCupon(result.recordset[0]));
  } catch (err) {
    console.error("getCuponById error:", err);
    return res.status(500).json({ error: "Error al obtener el cupón" });
  }
};

// ==============================================
// 📗 Crear un nuevo cupón (CORREGIDO: Retorna el objeto)
// ==============================================
exports.createCupon = async (req, res) => {
  const {
    Cod_Cupon,
    Descripcion,
    Tipo_Desc,
    Valor_Desc,
    Monto_Max,
    Usos_Max,
    Fecha_INC,
    Fecha_FIN,
    Estado
  } = req.body;

  try {
    // Validaciones mínimas
    if (!Cod_Cupon || !Tipo_Desc || Valor_Desc == null) {
      return res.status(400).json({
        error: "Faltan campos obligatorios: Cod_Cupon, Tipo_Desc o Valor_Desc"
      });
    }

    const pool = await getConnection();

    // 1. Verificar si ya existe código (evitar duplicados)
    const existe = await pool.request()
      .input("Cod_Cupon", sql.VarChar(50), Cod_Cupon.trim())
      .query("SELECT ID_Cupon FROM Cupones WHERE Cod_Cupon = @Cod_Cupon");

    if (existe.recordset.length > 0) {
      return res.status(400).json({ error: `Ya existe un cupón con el código '${Cod_Cupon}'` });
    }

    // 2. Insertar y obtener ID
    const request = pool.request()
      .input("Cod_Cupon", sql.VarChar(50), Cod_Cupon.trim())
      .input("Descripcion", sql.VarChar(255), Descripcion || "")
      .input("Tipo_Desc", sql.VarChar(50), Tipo_Desc)
      .input("Valor_Desc", sql.Decimal(10, 2), Valor_Desc)
      .input("Monto_Max", sql.Decimal(10, 2), Monto_Max || 0.0)
      .input("Usos_Max", sql.Int, Usos_Max || 1)
      .input("Usos_Act", sql.Int, 0) // Siempre inicia en 0
      .input("Fecha_INC", sql.Date, Fecha_INC ? new Date(Fecha_INC) : new Date())
      .input("Fecha_FIN", sql.Date, Fecha_FIN ? new Date(Fecha_FIN) : null)
      .input("Estado", sql.Char(1), (Estado || "A"))
      .input("Fecha_Registro", sql.DateTime, new Date());

    const result = await request.query(`
      INSERT INTO Cupones (
        Cod_Cupon, Descripcion, Tipo_Desc, Valor_Desc,
        Monto_Max, Usos_Max, Usos_Act,
        Fecha_INC, Fecha_FIN, Estado, Fecha_Registro
      ) 
      OUTPUT INSERTED.ID_Cupon
      VALUES (
        @Cod_Cupon, @Descripcion, @Tipo_Desc, @Valor_Desc,
        @Monto_Max, @Usos_Max, @Usos_Act,
        @Fecha_INC, @Fecha_FIN, @Estado, @Fecha_Registro
      )
    `);

    const newId = result.recordset[0].ID_Cupon;

    // 3. Obtener el cupón completo para devolverlo
    const nuevoCupon = await pool.request()
        .input("id", sql.Int, newId)
        .query("SELECT * FROM Cupones WHERE ID_Cupon = @id");

    return res.status(201).json({ 
        message: "Cupón registrado correctamente",
        cupon: mapToCupon(nuevoCupon.recordset[0])
    });

  } catch (err) {
    console.error("createCupon error:", err);
    return res.status(500).json({ error: "Error al registrar el cupón" });
  }
};

// ==============================================
// 📙 Actualizar un cupón
// ==============================================
exports.updateCupon = async (req, res) => {
  const { id } = req.params;
  const {
    Cod_Cupon,
    Descripcion,
    Tipo_Desc,
    Valor_Desc,
    Monto_Max,
    Usos_Max,
    Usos_Act,
    Fecha_INC,
    Fecha_FIN,
    Estado
  } = req.body;

  try {
    const pool = await getConnection();
    
    // Validar duplicado de código solo si se está cambiando el código
    if (Cod_Cupon) {
        const existe = await pool.request()
            .input("Cod", sql.VarChar(50), Cod_Cupon.trim())
            .input("id", sql.Int, id)
            .query("SELECT ID_Cupon FROM Cupones WHERE Cod_Cupon = @Cod AND ID_Cupon <> @id");
        
        if (existe.recordset.length > 0) {
            return res.status(400).json({ error: "El código de cupón ya está en uso" });
        }
    }

    const request = pool.request();
    request.input("id", sql.Int, id);

    let query = "UPDATE Cupones SET";
    let hasUpdates = false;

    if (Cod_Cupon !== undefined) {
      query += " Cod_Cupon = @Cod_Cupon,";
      request.input("Cod_Cupon", sql.VarChar(50), Cod_Cupon);
      hasUpdates = true;
    }
    if (Descripcion !== undefined) {
      query += " Descripcion = @Descripcion,";
      request.input("Descripcion", sql.VarChar(255), Descripcion);
      hasUpdates = true;
    }
    if (Tipo_Desc !== undefined) {
      query += " Tipo_Desc = @Tipo_Desc,";
      request.input("Tipo_Desc", sql.VarChar(50), Tipo_Desc);
      hasUpdates = true;
    }
    if (Valor_Desc !== undefined) {
      query += " Valor_Desc = @Valor_Desc,";
      request.input("Valor_Desc", sql.Decimal(10, 2), Valor_Desc);
      hasUpdates = true;
    }
    if (Monto_Max !== undefined) {
      query += " Monto_Max = @Monto_Max,";
      request.input("Monto_Max", sql.Decimal(10, 2), Monto_Max);
      hasUpdates = true;
    }
    if (Usos_Max !== undefined) {
      query += " Usos_Max = @Usos_Max,";
      request.input("Usos_Max", sql.Int, Usos_Max);
      hasUpdates = true;
    }
    if (Usos_Act !== undefined) {
      query += " Usos_Act = @Usos_Act,";
      request.input("Usos_Act", sql.Int, Usos_Act);
      hasUpdates = true;
    }
    if (Fecha_INC !== undefined) {
      query += " Fecha_INC = @Fecha_INC,";
      request.input("Fecha_INC", Fecha_INC ? new Date(Fecha_INC) : null);
      hasUpdates = true;
    }
    if (Fecha_FIN !== undefined) {
      query += " Fecha_FIN = @Fecha_FIN,";
      request.input("Fecha_FIN", Fecha_FIN ? new Date(Fecha_FIN) : null);
      hasUpdates = true;
    }
    if (Estado !== undefined) {
      query += " Estado = @Estado,";
      request.input("Estado", sql.Char(1), Estado);
      hasUpdates = true;
    }

    if (!hasUpdates) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    // quitar coma final y agregar WHERE
    query = query.slice(0, -1);
    query += " WHERE ID_Cupon = @id";

    const result = await request.query(query);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: "Cupón no encontrado" });
    }

    return res.status(200).json({ message: "Cupón actualizado correctamente" });
  } catch (err) {
    console.error("updateCupon error:", err);
    return res.status(500).json({ error: "Error al actualizar el cupón" });
  }
};

// ==============================================
// 📕 Eliminar un cupón (CORREGIDO: Manejo de error FK)
// ==============================================
exports.deleteCupon = async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await getConnection();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .query("DELETE FROM Cupones WHERE ID_Cupon = @id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: "Cupón no encontrado" });
    }

    return res.status(200).json({ message: "Cupón eliminado correctamente" });
  } catch (err) {
    console.error("deleteCupon error:", err);
    
    // 547 es el código de error de SQL Server para violación de llave foránea
    if (err.number === 547) {
        return res.status(400).json({ 
            error: "No se puede eliminar el cupón porque ya ha sido utilizado en ventas." 
        });
    }

    return res.status(500).json({ error: "Error al eliminar el cupón" });
  }
};