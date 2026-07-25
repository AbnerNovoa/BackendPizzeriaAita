const { sql, getConnection } = require("../config/Connection");
const bdModel = require("../models/bd.models");
const path = require("path");
const fs = require("fs").promises; 
const fsSync = require("fs"); 

// Carpeta de uploads
const uploadDir = path.join(__dirname, "..", "uploads");

// Asegurar que la carpeta exista
if (!fsSync.existsSync(uploadDir)) {
    fsSync.mkdirSync(uploadDir, { recursive: true });
}

// ==================================================
// 🕵️ FUNCIÓN CLAVE: Verificar Stock Matemático (Stock < Cantidad Requerida)
// ==================================================
async function actualizarDisponibilidadCombo(pool, idCombo) {
    try {
        // Verificamos si existe ALGÚN ítem en el combo cuyo stock sea menor al necesario
        const checkStock = await pool.request()
            .input("ID_Combo", sql.Int, idCombo)
            .query(`
                SELECT COUNT(*) as ProductosInsuficientes
                FROM Combos_Detalle cd
                INNER JOIN Producto_Tamano pt ON cd.ID_Producto_T = pt.ID_Producto_T
                INNER JOIN Producto p ON pt.ID_Producto = p.ID_Producto
                WHERE cd.ID_Combo = @ID_Combo 
                AND p.Cantidad_Disponible < cd.Cantidad -- <--- VALIDACIÓN EXACTA
            `);

        const hayFaltantes = checkStock.recordset[0].ProductosInsuficientes > 0;

        if (hayFaltantes) {
            // Si falta aunque sea 1 ingrediente, desactivamos
            await pool.request()
                .input("ID_Combo", sql.Int, idCombo)
                .query("UPDATE Combos SET Estado = 'I' WHERE ID_Combo = @ID_Combo AND Estado = 'A'");
        } else {
            // Si NO hay faltantes (todo alcanza), activamos
            await pool.request()
                .input("ID_Combo", sql.Int, idCombo)
                .query("UPDATE Combos SET Estado = 'A' WHERE ID_Combo = @ID_Combo AND Estado = 'I'");
        }
        
    } catch (err) {
        console.error(`Error verificando stock del combo ${idCombo}:`, err);
    }
}

// ==============================
// 🔄 Helper: Obtener URLs de imágenes
// ==============================
async function getImagenesCombo(idCombo) {
    try {
        const files = await fs.readdir(uploadDir);
        return files
            .filter(file => file.startsWith(`combo_${idCombo}_`))
            .map(file => `/uploads/${file}`); 
    } catch (err) {
        return [];
    }
}

// ==============================
// 🔄 Función para eliminar imágenes
// ==============================
async function eliminarImagenesCombo(idCombo) {
    try {
        const files = await fs.readdir(uploadDir);
        const deletePromises = files
            .filter(file => file.startsWith(`combo_${idCombo}_`))
            .map(file => fs.unlink(path.join(uploadDir, file)));
        await Promise.all(deletePromises);
    } catch (err) {
        console.error(`Error eliminando imágenes combo ${idCombo}:`, err);
    }
}

// ==============================
// 🔄 Mappers
// ==============================
function mapToCombo(row = {}) {
    return {
        ID_Combo: row.ID_Combo || 0,
        Nombre: row.Nombre || "",
        Descripcion: row.Descripcion || "",
        Precio: row.Precio || 0.0,
        Estado: row.Estado || "A"
    };
}

function mapToComboDetalle(row = {}) {
    return {
        ID_Combo_D: row.ID_Combo_D || 0,
        ID_Combo: row.ID_Combo || 0,
        ID_Producto_T: row.ID_Producto_T || 0,
        Cantidad: row.Cantidad ?? 1,
        Producto_Nombre: row.Producto_Nombre || null,
        Tamano_Nombre: row.Tamano_Nombre || null
    };
}

// ==================================================
// 📘 GET /combos - Obtener todos (Con Barrido Masivo de Stock)
// ==================================================
exports.getCombos = async (_req, res) => {
    try {
        const pool = await getConnection();

        // 1. DESACTIVAR MASIVAMENTE: Combos donde algún producto no alcance
        await pool.request().query(`
            UPDATE Combos
            SET Estado = 'I'
            WHERE ID_Combo IN (
                SELECT cd.ID_Combo
                FROM Combos_Detalle cd
                INNER JOIN Producto_Tamano pt ON cd.ID_Producto_T = pt.ID_Producto_T
                INNER JOIN Producto p ON pt.ID_Producto = p.ID_Producto
                WHERE p.Cantidad_Disponible < cd.Cantidad -- <--- SI STOCK < NECESARIO
            ) AND Estado = 'A'
        `);

        // 2. REACTIVAR MASIVAMENTE: Combos que estaban inactivos pero ya tienen stock
        await pool.request().query(`
            UPDATE Combos
            SET Estado = 'A'
            WHERE Estado = 'I' 
            AND ID_Combo NOT IN (
                SELECT cd.ID_Combo
                FROM Combos_Detalle cd
                INNER JOIN Producto_Tamano pt ON cd.ID_Producto_T = pt.ID_Producto_T
                INNER JOIN Producto p ON pt.ID_Producto = p.ID_Producto
                WHERE p.Cantidad_Disponible < cd.Cantidad
            )
        `);

        // 3. Obtener lista final
        const combosRes = await pool.request().query("SELECT * FROM Combos ORDER BY ID_Combo DESC");
        const combos = combosRes.recordset || [];

        if (combos.length === 0) return res.status(200).json([]);

        // 4. Obtener detalles
        const comboIds = combos.map(c => c.ID_Combo).join(",");
        const detallesQuery = `
            SELECT cd.ID_Combo_D, cd.ID_Combo, cd.ID_Producto_T, cd.Cantidad,
                   p.Nombre AS Producto_Nombre, t.Tamano AS Tamano_Nombre
            FROM Combos_Detalle cd
            INNER JOIN Producto_Tamano pt ON cd.ID_Producto_T = pt.ID_Producto_T
            INNER JOIN Producto p ON pt.ID_Producto = p.ID_Producto
            INNER JOIN Tamano t ON pt.ID_Tamano = t.ID_Tamano
            WHERE cd.ID_Combo IN (${comboIds})
            ORDER BY cd.ID_Combo, cd.ID_Combo_D
        `;

        const detallesRes = await pool.request().query(detallesQuery);
        const detallesPorCombo = detallesRes.recordset.reduce((acc, r) => {
            if (!acc[r.ID_Combo]) acc[r.ID_Combo] = [];
            acc[r.ID_Combo].push(mapToComboDetalle(r));
            return acc;
        }, {});

        // 5. Respuesta con imágenes
        const resultado = await Promise.all(combos.map(async (c) => {
            const imgs = await getImagenesCombo(c.ID_Combo);
            return {
                ...mapToCombo(c),
                detalles: detallesPorCombo[c.ID_Combo] || [],
                imagenes: imgs
            };
        }));

        return res.status(200).json(resultado);
    } catch (err) {
        console.error("getCombos error:", err);
        return res.status(500).json({ error: "Error al obtener los combos" });
    }
};

// ==================================================
// 📘 GET /combos/:id - Obtener uno (Verificación Individual)
// ==================================================
exports.getComboById = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await getConnection();

        // Verificar stock antes de responder
        await actualizarDisponibilidadCombo(pool, id);

        const comboRes = await pool.request()
            .input("id", sql.Int, id)
            .query("SELECT * FROM Combos WHERE ID_Combo = @id");

        if (!comboRes.recordset.length) return res.status(404).json({ error: "Combo no encontrado" });

        const combo = mapToCombo(comboRes.recordset[0]);
        const detalles = await obtenerDetallesCompletos(id, pool);
        const imagenes = await getImagenesCombo(id);

        return res.status(200).json({ ...combo, detalles, imagenes });

    } catch (err) {
        console.error("getComboById error:", err);
        return res.status(500).json({ error: "Error al obtener el combo" });
    }
};

// ==================================================
// 📗 POST /combos
// ==================================================
exports.createCombo = async (req, res) => {
    let { Nombre, Descripcion, Precio, Estado, detalles } = req.body;

    if (detalles && typeof detalles === 'string') {
        try { detalles = JSON.parse(detalles); } catch (e) { return res.status(400).json({ error: "JSON inválido" }); }
    }

    if (!Nombre || !Precio || !Array.isArray(detalles) || detalles.length === 0) {
        return res.status(400).json({ error: "Faltan datos o detalles" });
    }

    let transaction;
    try {
        const pool = await getConnection();
        transaction = new sql.Transaction(pool);
        await transaction.begin();

        // 1. Insertar Combo
        const comboResult = await new sql.Request(transaction)
            .input("Nombre", sql.VarChar, Nombre)
            .input("Descripcion", sql.VarChar, Descripcion || "")
            .input("Precio", sql.Decimal(10, 2), Precio)
            .input("Estado", sql.Char(1), Estado || "A")
            .query(`
                INSERT INTO Combos (Nombre, Descripcion, Precio, Estado)
                OUTPUT INSERTED.ID_Combo
                VALUES (@Nombre, @Descripcion, @Precio, @Estado)
            `);
        const ID_Combo = comboResult.recordset[0].ID_Combo;

        // 2. Insertar Detalles
        for (const d of detalles) {
            await new sql.Request(transaction)
                .input("ID_Combo", sql.Int, ID_Combo)
                .input("ID_Producto_T", sql.Int, d.ID_Producto_T)
                .input("Cantidad", sql.Int, d.Cantidad)
                .query("INSERT INTO Combos_Detalle (ID_Combo, ID_Producto_T, Cantidad) VALUES (@ID_Combo, @ID_Producto_T, @Cantidad)");
        }

        // 3. Imágenes
        if (req.files && req.files.length > 0) {
            const movePromises = req.files.map(async (file, i) => {
                const ext = path.extname(file.originalname);
                const nuevoNombre = `combo_${ID_Combo}_${i + 1}${ext}`;
                await fs.rename(file.path, path.join(uploadDir, nuevoNombre));
            });
            await Promise.all(movePromises);
        }

        await transaction.commit();

        // 4. Verificar disponibilidad inmediata
        await actualizarDisponibilidadCombo(pool, ID_Combo);

        // 5. Respuesta
        const comboFinal = await pool.request().input("id", sql.Int, ID_Combo).query("SELECT * FROM Combos WHERE ID_Combo = @id");
        const fullDetails = await obtenerDetallesCompletos(ID_Combo, pool);
        const imagenesUrls = await getImagenesCombo(ID_Combo);

        return res.status(201).json({
            message: "Combo creado correctamente",
            combo: { ...mapToCombo(comboFinal.recordset[0]), detalles: fullDetails, imagenes: imagenesUrls }
        });

    } catch (err) {
        if (transaction) await transaction.rollback();
        console.error("createCombo error:", err);
        return res.status(500).json({ error: "Error creando combo" });
    }
};

// ==================================================
// 📙 PUT /combos/:id
// ==================================================
exports.updateCombo = async (req, res) => {
    const { id } = req.params;
    let { Nombre, Descripcion, Precio, Estado, detalles } = req.body;

    if (detalles && typeof detalles === 'string') {
        try { detalles = JSON.parse(detalles); } catch (e) { }
    }

    let transaction;
    try {
        const pool = await getConnection();
        
        const check = await pool.request().input("id", sql.Int, id).query("SELECT ID_Combo FROM Combos WHERE ID_Combo = @id");
        if (!check.recordset.length) return res.status(404).json({ error: "Combo no encontrado" });

        transaction = new sql.Transaction(pool);
        await transaction.begin();

        // 1. Update Combo
        const request = transaction.request().input("id", sql.Int, id);
        let updates = [];
        if (Nombre !== undefined) { updates.push("Nombre=@Nombre"); request.input("Nombre", sql.VarChar, Nombre); }
        if (Descripcion !== undefined) { updates.push("Descripcion=@Descripcion"); request.input("Descripcion", sql.VarChar, Descripcion); }
        if (Precio !== undefined) { updates.push("Precio=@Precio"); request.input("Precio", sql.Decimal(10,2), Precio); }
        if (Estado !== undefined) { updates.push("Estado=@Estado"); request.input("Estado", sql.Char(1), Estado); }

        if (updates.length > 0) await request.query(`UPDATE Combos SET ${updates.join(",")} WHERE ID_Combo = @id`);

        // 2. Update Detalles
        if (Array.isArray(detalles) && detalles.length > 0) {
            await transaction.request().input("id", sql.Int, id).query("DELETE FROM Combos_Detalle WHERE ID_Combo = @id");
            for (const d of detalles) {
                await transaction.request()
                    .input("ID_Combo", sql.Int, id)
                    .input("ID_Producto_T", sql.Int, d.ID_Producto_T)
                    .input("Cantidad", sql.Int, d.Cantidad)
                    .query("INSERT INTO Combos_Detalle (ID_Combo, ID_Producto_T, Cantidad) VALUES (@ID_Combo, @ID_Producto_T, @Cantidad)");
            }
        }

        // 3. Update Imágenes
        if (req.files && req.files.length > 0) {
            await eliminarImagenesCombo(id);
            const movePromises = req.files.map(async (file, i) => {
                const ext = path.extname(file.originalname);
                const nuevoNombre = `combo_${id}_${i + 1}${ext}`;
                await fs.rename(file.path, path.join(uploadDir, nuevoNombre));
            });
            await Promise.all(movePromises);
        }

        await transaction.commit();

        // 4. Verificar disponibilidad
        await actualizarDisponibilidadCombo(pool, id);

        const comboFinal = await pool.request().input("id", sql.Int, id).query("SELECT * FROM Combos WHERE ID_Combo = @id");
        return res.status(200).json({ 
            message: "Combo actualizado correctamente",
            combo: mapToCombo(comboFinal.recordset[0]),
            imagenes: await getImagenesCombo(id)
        });

    } catch (err) {
        if (transaction) await transaction.rollback();
        console.error("updateCombo error:", err);
        return res.status(500).json({ error: "Error actualizando combo" });
    }
};

// ==================================================
// 📕 DELETE /combos/:id
// ==================================================
exports.deleteCombo = async (req, res) => {
    const { id } = req.params;
    let transaction;
    try {
        const pool = await getConnection();
        transaction = new sql.Transaction(pool);
        await transaction.begin();

        await transaction.request().input("id", sql.Int, id).query("DELETE FROM Combos_Detalle WHERE ID_Combo = @id");
        const resDb = await transaction.request().input("id", sql.Int, id).query("DELETE FROM Combos WHERE ID_Combo = @id");

        if (resDb.rowsAffected[0] === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: "Combo no encontrado" });
        }

        await transaction.commit();
        await eliminarImagenesCombo(id);

        return res.status(200).json({ message: "Combo eliminado" });

    } catch (err) {
        if (transaction) await transaction.rollback();
        console.error("deleteCombo error:", err);
        return res.status(500).json({ error: "Error eliminando combo" });
    }
};

// ==================================================
// 🔧 Auxiliares
// ==================================================
async function obtenerDetallesCompletos(ID_Combo, pool) {
    const res = await pool.request().input("ID_Combo", sql.Int, ID_Combo).query(`
        SELECT cd.*, p.Nombre as Producto_Nombre, t.Tamano as Tamano_Nombre
        FROM Combos_Detalle cd
        JOIN Producto_Tamano pt ON cd.ID_Producto_T = pt.ID_Producto_T
        JOIN Producto p ON pt.ID_Producto = p.ID_Producto
        JOIN Tamano t ON pt.ID_Tamano = t.ID_Tamano
        WHERE cd.ID_Combo = @ID_Combo
    `);
    return res.recordset.map(mapToComboDetalle);
}

exports.statusCombo = async (req, res) => {
    const { id } = req.params;
    const { Estado } = req.body;
    try {
        const pool = await getConnection();
        
        await pool.request().input("id", sql.Int, id).input("Estado", sql.Char(1), Estado)
            .query("UPDATE Combos SET Estado = @Estado WHERE ID_Combo = @id");
        
        // Si intentan activar, verificamos el stock matemático
        if (Estado === 'A') {
            await actualizarDisponibilidadCombo(pool, id);
        }

        // Devolvemos el estado REAL (puede haber cambiado a 'I' si no había stock)
        const finalState = await pool.request().input("id", sql.Int, id).query("SELECT Estado FROM Combos WHERE ID_Combo = @id");
        
        return res.status(200).json({ 
            message: "Estado procesado",
            Estado: finalState.recordset[0].Estado
        });

    } catch (e) { return res.status(500).json({ error: e.message }); }
};
// ==================================================

// 🔄 PATCH /combos/:id/status - CAMBIAR ESTADO DEL COMBO (A/I)

// ==================================================

exports.statusCombo = async (req, res) => {

  const { id } = req.params;

  const { Estado } = req.body;



  // Validar que el estado sea válido

  if (!Estado || (Estado !== 'A' && Estado !== 'I')) {

    return res.status(400).json({ 

      error: "Estado inválido. Debe ser 'A' (Activo) o 'I' (Inactivo)" 

    });

  }



  try {

    const pool = await getConnection();



    // Verificar que el combo existe

    const comboExistente = await pool.request()

      .input("id", sql.Int, id)

      .query("SELECT ID_Combo, Estado FROM Combos WHERE ID_Combo = @id");



    if (!comboExistente.recordset.length) {

      return res.status(404).json({ error: "Combo no encontrado" });

    }



    // Actualizar solo el estado

    await pool.request()

      .input("id", sql.Int, id)

      .input("Estado", sql.Char(1), Estado)

      .query("UPDATE Combos SET Estado = @Estado WHERE ID_Combo = @id");



    const estadoTexto = Estado === 'A' ? 'activado' : 'desactivado';

    

    return res.status(200).json({ 

      message: `Combo ${estadoTexto} correctamente`,

      ID_Combo: parseInt(id),

      Estado: Estado,

      Estado_Texto: Estado === 'A' ? 'Activo' : 'Inactivo'

    });



  } catch (err) {

    console.error("statusCombo error:", err);

    return res.status(500).json({ 

      error: "Error al cambiar el estado del combo",

      details: err.message 

    });

  }

};