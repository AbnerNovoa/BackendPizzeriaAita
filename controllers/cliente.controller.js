const { sql, getConnection } = require("../config/Connection");
const axios = require("axios");
const bdModel = require("../models/bd.models"); 

// ==============================
// 🔄 Mapper: adapta fila BD -> Modelo
// ==============================
function mapToCliente(row = {}) {
  const template = bdModel.Cliente || {}; 

  return {
    ...template, 
    ID_Cliente: row.ID_Cliente ?? template.ID_Cliente,
    ID_Tipo_Doc: row.ID_Tipo_Doc ?? template.ID_Tipo_Doc,
    Numero_Documento: row.Numero_Documento ?? template.Numero_Documento,
    Nombre: row.Nombre ?? template.Nombre,
    Apellido: row.Apellido ?? template.Apellido,
    Telefono: row.Telefono ?? template.Telefono,
    Fecha_Registro: row.Fecha_Registro ?? template.Fecha_Registro
  };
}

// ==============================
// 📘 Obtener todos los clientes
// ==============================
exports.getClientes = async (_req, res) => {
  try {
    const pool = await getConnection();
    const query = `SELECT * FROM Cliente ORDER BY ID_Cliente DESC`;
    const result = await pool.request().query(query);
    const clientes = (result.recordset || []).map(mapToCliente);
    return res.status(200).json(clientes);
  } catch (err) {
    console.error("getClientes error:", err);
    return res.status(500).json({ error: "Error al obtener los clientes" });
  }
};

// ==============================
// 📘 Obtener un cliente por ID
// ==============================
exports.getClienteById = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getConnection();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM Cliente WHERE ID_Cliente = @id");

    if (!result.recordset.length) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    return res.status(200).json(mapToCliente(result.recordset[0]));
  } catch (err) {
    console.error("getClienteById error:", err);
    return res.status(500).json({ error: "Error al obtener el cliente" });
  }
};

// ==============================
// 📗 Crear un nuevo cliente (CON PUNTOS INICIALIZADOS)
// ==============================
exports.createCliente = async (req, res) => {
  const { Nombre, Apellido, Numero_Documento, Telefono, ID_Tipo_Doc } = req.body;

  try {
    const pool = await getConnection();

    // 1. Validar Duplicados
    if (Numero_Documento && Numero_Documento.trim() !== "") {
      const existe = await pool.request()
        .input("Doc", sql.VarChar(20), Numero_Documento.trim())
        .query("SELECT ID_Cliente FROM Cliente WHERE Numero_Documento = @Doc");

      if (existe.recordset.length > 0) {
        return res.status(400).json({ error: "Ya existe un cliente con ese número de documento" });
      }
    }

    // 2. Lógica Tipo Doc
    let finalTipoDoc = ID_Tipo_Doc;
    if (!finalTipoDoc && Numero_Documento) {
        const len = Numero_Documento.trim().length;
        let abrev = (len === 8) ? 'DNI' : (len === 11) ? 'RUC' : null;
        if (abrev) {
            const tDoc = await pool.request().input("A", sql.VarChar(10), abrev)
                .query("SELECT ID_Tipo_Doc FROM Tipo_Documento WHERE Abreviatura = @A");
            if (tDoc.recordset.length > 0) finalTipoDoc = tDoc.recordset[0].ID_Tipo_Doc;
        }
    }

    // ⚡ INICIAR TRANSACCIÓN
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
        // 3. Insertar Cliente
        const request = new sql.Request(transaction);
        const resultCliente = await request
          .input("ID_Tipo_Doc", sql.Int, finalTipoDoc || null)
          .input("Numero_Documento", sql.VarChar(20), Numero_Documento?.trim() || null)
          .input("Nombre", sql.VarChar(100), Nombre?.trim() || null)
          .input("Apellido", sql.VarChar(100), Apellido?.trim() || null)
          .input("Telefono", sql.VarChar(20), Telefono?.trim() || null)
          .query(`
            INSERT INTO Cliente (ID_Tipo_Doc, Numero_Documento, Nombre, Apellido, Telefono)
            OUTPUT INSERTED.ID_Cliente
            VALUES (@ID_Tipo_Doc, @Numero_Documento, @Nombre, @Apellido, @Telefono);
          `);

        const idNuevoCliente = resultCliente.recordset[0].ID_Cliente;

        // 4. Crear registro de Puntos (Inicializado en 0)
        await new sql.Request(transaction)
            .input("ID_Cliente", sql.Int, idNuevoCliente)
            .query(`
                INSERT INTO Cliente_Puntos (ID_Cliente, Puntos_Acumulados, Fecha_Actualizacion)
                VALUES (@ID_Cliente, 0, GETDATE())
            `);

        await transaction.commit();

        // 5. Devolver respuesta
        const ultimo = await pool.request()
            .input("id", sql.Int, idNuevoCliente)
            .query("SELECT * FROM Cliente WHERE ID_Cliente = @id");
            
        return res.status(201).json(mapToCliente(ultimo.recordset[0]));

    } catch (errTransaction) {
        await transaction.rollback();
        throw errTransaction;
    }

  } catch (err) {
    console.error("createCliente error:", err);
    return res.status(500).json({ error: "Error al registrar el cliente" });
  }
};

// ==============================
// 📙 Actualizar cliente
// ==============================
exports.updateCliente = async (req, res) => {
  const { id } = req.params;
  const { Nombre, Apellido, Numero_Documento, Telefono, ID_Tipo_Doc } = req.body;

  try {
    const pool = await getConnection();

    if (Numero_Documento && Numero_Documento.trim() !== "") {
      const existe = await pool.request()
        .input("Doc", sql.VarChar(20), Numero_Documento.trim())
        .input("id", sql.Int, id)
        .query("SELECT ID_Cliente FROM Cliente WHERE Numero_Documento = @Doc AND ID_Cliente <> @id");

      if (existe.recordset.length > 0) {
        return res.status(400).json({ error: "El documento ya pertenece a otro cliente" });
      }
    }

    let query = `UPDATE Cliente SET`;
    const request = pool.request();
    request.input("id", sql.Int, id);
    let hasUpdates = false;

    if (ID_Tipo_Doc !== undefined) { query += ` ID_Tipo_Doc = @ID_Tipo_Doc,`; request.input("ID_Tipo_Doc", sql.Int, ID_Tipo_Doc); hasUpdates = true; }
    if (Numero_Documento !== undefined) { query += ` Numero_Documento = @Numero_Documento,`; request.input("Numero_Documento", sql.VarChar(20), Numero_Documento?.trim() || null); hasUpdates = true; }
    if (Nombre !== undefined) { query += ` Nombre = @Nombre,`; request.input("Nombre", sql.VarChar(100), Nombre?.trim() || null); hasUpdates = true; }
    if (Apellido !== undefined) { query += ` Apellido = @Apellido,`; request.input("Apellido", sql.VarChar(100), Apellido?.trim() || null); hasUpdates = true; }
    if (Telefono !== undefined) { query += ` Telefono = @Telefono,`; request.input("Telefono", sql.VarChar(20), Telefono?.trim() || null); hasUpdates = true; }

    if (!hasUpdates) return res.status(400).json({ error: "Nada que actualizar" });

    query = query.slice(0, -1) + ` WHERE ID_Cliente = @id`;
    
    const result = await request.query(query);

    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Cliente no encontrado" });

    return res.status(200).json({ message: "Cliente actualizado correctamente" });

  } catch (err) {
    console.error("updateCliente error:", err);
    return res.status(500).json({ error: "Error al actualizar el cliente" });
  }
};

// ==============================
// 📕 Eliminar cliente (Con limpieza de puntos)
// ==============================
exports.deleteCliente = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getConnection();

    const check = await pool.request().input("id", sql.Int, id)
        .query("SELECT Nombre FROM Cliente WHERE ID_Cliente = @id");
    if (check.recordset.length > 0 && check.recordset[0].Nombre === 'Clientes Varios') {
        return res.status(400).json({ error: "No se puede eliminar 'Clientes Varios'" });
    }

    // ⚡ Transacción para borrar puntos y luego cliente
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
        // 1. Borrar Puntos
        await new sql.Request(transaction).input("id", sql.Int, id)
            .query("DELETE FROM Cliente_Puntos WHERE ID_Cliente = @id");

        // 2. Borrar Cliente
        const result = await new sql.Request(transaction).input("id", sql.Int, id)
            .query("DELETE FROM Cliente WHERE ID_Cliente = @id");

        if (result.rowsAffected[0] === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: "Cliente no encontrado" });
        }

        await transaction.commit();
        return res.status(200).json({ message: "Cliente eliminado correctamente" });

    } catch (errTrans) {
        await transaction.rollback();
        throw errTrans; // Lanzar para que lo capture el catch de abajo
    }

  } catch (err) {
    console.error("deleteCliente error:", err);
    if (err.number === 547) return res.status(400).json({ error: "No se puede eliminar: Tiene ventas o pedidos asociados." });
    return res.status(500).json({ error: "Error al eliminar" });
  }
};

// ==============================
// 🔍 Buscar y guardar (API EXTERNA + PUNTOS)
// ==============================
exports.buscarClientePorDocumento = async (req, res) => {
  const { doc } = req.params;
  const token = process.env.TOKEN;

  try {
    if (!doc || (doc.length !== 8 && doc.length !== 11)) {
      return res.status(400).json({ error: "Documento inválido" });
    }

    const pool = await getConnection();

    // 1. Buscar en BD local
    const existe = await pool.request()
      .input("Doc", sql.VarChar(20), doc.trim())
      .query("SELECT * FROM Cliente WHERE Numero_Documento = @Doc");

    if (existe.recordset.length > 0) {
      return res.status(200).json({
        message: "Cliente encontrado en BD",
        cliente: mapToCliente(existe.recordset[0]),
      });
    }

    // 2. API Externa
    const headers = { Authorization: `Bearer ${token}` };
    let nombre = "", apellido = "", tipoAbrev = "";

    if (doc.length === 8) {
      tipoAbrev = "DNI";
      const { data } = await axios.get(`https://apiperu.dev/api/dni/${doc}`, { headers });
      if (!data.success) return res.status(404).json({ error: "DNI no encontrado en API" });
      
      nombre = data.data.nombres?.trim() || "";
      apellido = `${data.data.apellido_paterno || ""} ${data.data.apellido_materno || ""}`.trim();

    } else {
      tipoAbrev = "RUC";
      const { data } = await axios.get(`https://apiperu.dev/api/ruc/${doc}`, { headers });
      if (!data.success) return res.status(404).json({ error: "RUC no encontrado en API" });

      nombre = data.data.nombre_o_razon_social?.trim() || "";
      apellido = `${data.data.estado || ""} | ${data.data.condicion || ""}`;
    }

    // 3. Buscar ID Tipo Doc
    let idTipoDoc = null;
    const tDoc = await pool.request().input("A", sql.VarChar(10), tipoAbrev)
        .query("SELECT ID_Tipo_Doc FROM Tipo_Documento WHERE Abreviatura = @A");
    if (tDoc.recordset.length > 0) idTipoDoc = tDoc.recordset[0].ID_Tipo_Doc;

    // ⚡ INICIAR TRANSACCIÓN
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
        // 4. Insertar Cliente
        const resultInsert = await new sql.Request(transaction)
          .input("ID_Tipo_Doc", sql.Int, idTipoDoc)
          .input("Numero_Documento", sql.VarChar(20), doc.trim())
          .input("Nombre", sql.VarChar(100), nombre)
          .input("Apellido", sql.VarChar(100), apellido)
          .query(`
            INSERT INTO Cliente (ID_Tipo_Doc, Numero_Documento, Nombre, Apellido, Telefono) 
            OUTPUT INSERTED.ID_Cliente
            VALUES (@ID_Tipo_Doc, @Numero_Documento, @Nombre, @Apellido, NULL)
          `);
        
        const idNuevoCliente = resultInsert.recordset[0].ID_Cliente;

        // 5. Crear registro de Puntos (0)
        await new sql.Request(transaction)
            .input("ID_Cliente", sql.Int, idNuevoCliente)
            .query(`
                INSERT INTO Cliente_Puntos (ID_Cliente, Puntos_Acumulados, Fecha_Actualizacion)
                VALUES (@ID_Cliente, 0, GETDATE())
            `);

        await transaction.commit();

        // 6. Retornar
        const nuevo = await pool.request().input("Doc", sql.VarChar(20), doc.trim())
            .query("SELECT TOP 1 * FROM Cliente WHERE Numero_Documento = @Doc ORDER BY ID_Cliente DESC");

        return res.status(201).json({
          message: "Cliente creado desde API externa con puntos inicializados",
          cliente: mapToCliente(nuevo.recordset[0]),
        });

    } catch (errTrans) {
        await transaction.rollback();
        throw errTrans;
    }

  } catch (error) {
    console.error("Error buscarClientePorDocumento:", error.message);
    return res.status(500).json({ error: "Error interno" });
  }
};

// ==============================
// 🌟 Ver Puntos del Cliente (misPuntos)
// ==============================
exports.misPuntos = async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await getConnection();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        SELECT 
            c.ID_Cliente, 
            c.Nombre, 
            c.Apellido, 
            ISNULL(cp.Puntos_Acumulados, 0) AS Puntos
        FROM Cliente c
        LEFT JOIN Cliente_Puntos cp ON c.ID_Cliente = cp.ID_Cliente
        WHERE c.ID_Cliente = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    const data = result.recordset[0];

    return res.status(200).json({
      message: "Puntos obtenidos correctamente",
      ID_Cliente: data.ID_Cliente,
      Nombre_Completo: `${data.Nombre || ''} ${data.Apellido || ''}`.trim(),
      Puntos: data.Puntos
    });

  } catch (err) {
    console.error("misPuntos error:", err);
    return res.status(500).json({ error: "Error al obtener los puntos del cliente" });
  }
};