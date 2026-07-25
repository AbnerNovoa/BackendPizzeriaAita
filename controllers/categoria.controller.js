const { sql, getConnection } = require("../config/Connection");
const bdModel = require("../models/bd.models");
const path = require("path");
// =========================================
// 🧩 Configuración: Solo Categorías (Producto e Insumo)
// =========================================
function getCategoriaConfig(tipo) {
  const lower = tipo?.toLowerCase();

  if (lower === "producto" || lower === "productos") {
    return {
      table: "Categoria_Producto",
      idCol: "ID_Categoria_P",    // Nombre columna ID
      nameCol: "Nombre",          // Nombre columna Texto
      checkTable: "Producto",     // Tabla para verificar dependencias
      checkRef: "ID_Categoria_P", // Columna foránea para verificar
      model: bdModel.CategoriaProducto
    };
  } else if (lower === "insumo" || lower === "insumos") {
    return {
      table: "Categoria_Insumos",
      idCol: "ID_Categoria_I",
      nameCol: "Nombre",
      checkTable: "Insumos",
      checkRef: "ID_Categoria_I",
      model: bdModel.CategoriaInsumos
    };
  } else {
    throw new Error("Tipo inválido. Solo se permite: 'producto' o 'insumo'.");
  }
}

// =========================================
// 📘 Obtener categorías
// =========================================
exports.getCategorias = async (req, res) => {
  const { tipo } = req.params; // 'producto' o 'insumo'
  try {
    const config = getCategoriaConfig(tipo);
    const pool = await getConnection();
    
    // Ordenado por nombre (A-Z)
    const result = await pool.request()
        .query(`SELECT * FROM ${config.table} ORDER BY ${config.nameCol} ASC`);
    
    // Mapeamos al modelo (opcional, si quieres asegurar la estructura)
    const data = result.recordset.map(row => ({ ...config.model, ...row }));
    
    return res.status(200).json(data);
  } catch (err) {
    console.error(`getCategorias [${tipo}] error:`, err);
    return res.status(500).json({ error: err.message });
  }
};

// =========================================
// 📘 Obtener por ID
// =========================================
exports.getCategoriaById = async (req, res) => {
  const { tipo, id } = req.params;
  try {
    const config = getCategoriaConfig(tipo);
    const pool = await getConnection();
    
    const result = await pool.request()
      .input("id", sql.Int, id)
      .query(`SELECT * FROM ${config.table} WHERE ${config.idCol} = @id`);

    if (!result.recordset.length) {
      return res.status(404).json({ error: "Categoría no encontrada" });
    }

    return res.status(200).json({ ...config.model, ...result.recordset[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// =========================================
// 📗 Crear Categoría (MEJORADO: Devuelve ID)
// =========================================
exports.createCategoria = async (req, res) => {
  const { tipo } = req.params;
  const { Nombre } = req.body;

  try {
    if (!Nombre) return res.status(400).json({ error: "El campo Nombre es obligatorio" });

    const config = getCategoriaConfig(tipo);
    const pool = await getConnection();

    // 1. Validar duplicado
    const check = await pool.request()
        .input("Nombre", sql.VarChar(100), Nombre)
        .query(`SELECT TOP 1 1 FROM ${config.table} WHERE ${config.nameCol} = @Nombre`);
    
    if (check.recordset.length > 0) {
        return res.status(409).json({ error: `La categoría '${Nombre}' ya existe.` });
    }

    // 2. Insertar y obtener ID
    const query = `
      INSERT INTO ${config.table} (${config.nameCol}) 
      OUTPUT INSERTED.${config.idCol} AS ID
      VALUES (@Nombre)
    `;

    const result = await pool.request()
      .input("Nombre", sql.VarChar(100), Nombre)
      .query(query);

    return res.status(201).json({
      message: `Categoría de ${tipo} creada`,
      id: result.recordset[0].ID, // <-- Importante para el Frontend
      nombre: Nombre
    });

  } catch (err) {
    console.error("createCategoria error:", err);
    return res.status(500).json({ error: err.message });
  }
};

// =========================================
// 📙 Actualizar Categoría
// =========================================
exports.updateCategoria = async (req, res) => {
  const { tipo, id } = req.params;
  const { Nombre } = req.body;

  try {
    const config = getCategoriaConfig(tipo);
    const pool = await getConnection();

    await pool.request()
      .input("id", sql.Int, id)
      .input("Nombre", sql.VarChar(100), Nombre)
      .query(`UPDATE ${config.table} SET ${config.nameCol} = @Nombre WHERE ${config.idCol} = @id`);

    return res.status(200).json({ message: "Categoría actualizada correctamente" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// =========================================
// 📕 Eliminar Categoría (MEJORADO: Valida uso)
// =========================================
exports.deleteCategoria = async (req, res) => {
  const { tipo, id } = req.params;
  try {
    const config = getCategoriaConfig(tipo);
    const pool = await getConnection();

    // 1. Verificar si hay productos/insumos usando esta categoría
    const depCheck = await pool.request()
      .input("id", sql.Int, id)
      .query(`SELECT COUNT(*) as count FROM ${config.checkTable} WHERE ${config.checkRef} = @id`);

    if (depCheck.recordset[0].count > 0) {
      return res.status(400).json({ 
        error: `No se puede eliminar: Hay registros en ${config.checkTable} usando esta categoría.` 
      });
    }

    // 2. Eliminar
    const result = await pool.request()
      .input("id", sql.Int, id)
      .query(`DELETE FROM ${config.table} WHERE ${config.idCol} = @id`);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: "Categoría no encontrada" });
    }

    return res.status(200).json({ message: "Categoría eliminada correctamente" });
  } catch (err) {
    console.error("deleteCategoria error:", err);
    return res.status(500).json({ error: err.message });
  }
};