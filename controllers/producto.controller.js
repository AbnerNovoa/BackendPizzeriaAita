const { sql, getConnection } = require("../config/Connection");
const bdModel = require("../models/bd.models");
const path = require("path");
const fs = require("fs").promises; // ⚡ Async
const fsSync = require("fs");

// Carpeta de uploads
const uploadDir = path.join(__dirname, "..", "uploads");

// Asegurar carpeta
if (!fsSync.existsSync(uploadDir)) {
  fsSync.mkdirSync(uploadDir, { recursive: true });
}

// ==============================
// 🔄 Helper: Obtener URLs de imágenes
// ==============================
async function getImagenesProducto(idProducto) {
  try {
    const files = await fs.readdir(uploadDir);
    return files
      .filter((file) => file.startsWith(`producto_${idProducto}_`))
      .map((file) => `/uploads/${file}`);
  } catch (err) {
    return [];
  }
}

// ==============================
// 🔄 Función para eliminar imágenes (Async)
// ==============================
async function eliminarImagenesProducto(idProducto) {
  try {
    const files = await fs.readdir(uploadDir);
    const deletePromises = files
      .filter((file) => file.startsWith(`producto_${idProducto}_`))
      .map((file) => fs.unlink(path.join(uploadDir, file)));
    await Promise.all(deletePromises);
  } catch (err) {
    console.error(`Error eliminando imágenes producto ${idProducto}:`, err);
  }
}

// ==============================
// 🔄 Mapper: adapta una fila SQL al modelo Producto
// ==============================
function mapToProducto(row = {}) {
  const template = bdModel?.Producto || {}; // Usamos el modelo como base

  return {
    ...template,
    ID_Producto: row.ID_Producto ?? template.ID_Producto,
    Nombre: row.Nombre ?? template.Nombre,
    Descripcion: row.Descripcion ?? template.Descripcion,
    ID_Categoria_P: row.ID_Categoria_P ?? template.ID_Categoria_P,
    ID_Receta: row.ID_Receta ?? template.ID_Receta,
    Cantidad_Disponible:
      row.Cantidad_Disponible ?? template.Cantidad_Disponible,
    Estado: row.Estado ?? template.Estado,
    Fecha_Registro: row.Fecha_Registro ?? template.Fecha_Registro,
  };
}

// ==============================
// 🔄 Helper: Actualizar estado según stock
// ==============================
async function actualizarEstadoProducto(pool, idProducto) {
  try {
    const result = await pool
      .request()
      .input("ID_Producto", sql.Int, idProducto)
      .query(
        "SELECT Cantidad_Disponible, Estado FROM Producto WHERE ID_Producto = @ID_Producto",
      );

    if (!result.recordset.length) return;

    const prod = result.recordset[0];
    const cantidad = Number(prod.Cantidad_Disponible ?? 0);
    const nuevoEstado = cantidad <= 0 ? "I" : "A";

    // Solo actualizar si el estado cambia y no es 'G' (Agotado manual)
    if (prod.Estado !== nuevoEstado && prod.Estado !== "G") {
      await pool
        .request()
        .input("ID_Producto", sql.Int, idProducto)
        .input("Estado", sql.Char(1), nuevoEstado)
        .query(
          "UPDATE Producto SET Estado = @Estado WHERE ID_Producto = @ID_Producto",
        );
    }
  } catch (err) {
    console.error(`Error actualizando estado producto ${idProducto}:`, err);
  }
}

// ==============================
// 📘 Obtener todos los productos CON SUS TAMAÑOS E IMÁGENES
// ==============================
exports.getProductos = async (_req, res) => {
  try {
    const pool = await getConnection();

    // 1. 🟢 MODIFICAR AQUÍ: Filtrar solo productos activos
    const resultProductos = await pool
      .request()
      .query(
        "SELECT * FROM Producto WHERE Estado = 'A' ORDER BY ID_Producto DESC",
      );
    let productos = resultProductos.recordset.map(mapToProducto);

    // 2. Actualizar estados (en paralelo para velocidad)
    await Promise.all(
      productos.map((p) => actualizarEstadoProducto(pool, p.ID_Producto)),
    );

    // 3. 🟢 MODIFICAR AQUÍ TAMBIÉN: Re-consultar aplicando el filtro de activos
    const resultUpdate = await pool
      .request()
      .query(
        "SELECT * FROM Producto WHERE Estado = 'A' ORDER BY ID_Producto DESC",
      );
    productos = resultUpdate.recordset.map(mapToProducto);

    // 4. Obtener tamaños (Tu código sigue exactamente igual de aquí en adelante...)
    const resultTamanos = await pool.request().query(`
        SELECT pt.ID_Producto_T, pt.ID_Producto, pt.ID_Tamano, pt.Precio, pt.Estado, 
               t.Tamano as nombre_tamano
        FROM Producto_Tamano pt
        INNER JOIN Tamano t ON pt.ID_Tamano = t.ID_Tamano
        WHERE pt.Estado = 'A'
        ORDER BY pt.ID_Producto, t.ID_Tamano
    `);

    // 5. Mapear tamaños
    const tamanosPorProducto = {};
    resultTamanos.recordset.forEach((t) => {
      if (!tamanosPorProducto[t.ID_Producto])
        tamanosPorProducto[t.ID_Producto] = [];
      tamanosPorProducto[t.ID_Producto].push(t);
    });

    // 6. Unir todo (imágenes + tamaños)
    const resultadoFinal = await Promise.all(
      productos.map(async (p) => {
        const imgs = await getImagenesProducto(p.ID_Producto);
        return {
          ...p,
          tamanos: tamanosPorProducto[p.ID_Producto] || [],
          imagenes: imgs,
        };
      }),
    );

    return res.status(200).json(resultadoFinal);
  } catch (err) {
    console.error("getProductos error:", err);
    return res.status(500).json({ error: "Error al obtener los productos" });
  }
};

// ==============================
// 📘 Obtener un producto por ID
// ==============================
exports.getProductoById = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getConnection();

    await actualizarEstadoProducto(pool, id);

    const resultProducto = await pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM Producto WHERE ID_Producto = @id");

    if (!resultProducto.recordset.length)
      return res.status(404).json({ error: "Producto no encontrado" });

    const producto = mapToProducto(resultProducto.recordset[0]);

    const resultTamanos = await pool.request().input("id", sql.Int, id).query(`
        SELECT pt.ID_Producto_T, pt.ID_Producto, pt.ID_Tamano, pt.Precio, pt.Estado, 
               t.Tamano as nombre_tamano
        FROM Producto_Tamano pt
        INNER JOIN Tamano t ON pt.ID_Tamano = t.ID_Tamano
        WHERE pt.ID_Producto = @id AND pt.Estado = 'A'
        ORDER BY t.ID_Tamano
    `);

    producto.tamanos = resultTamanos.recordset || [];
    producto.imagenes = await getImagenesProducto(id);

    return res.status(200).json(producto);
  } catch (err) {
    console.error("getProductoById error:", err);
    return res.status(500).json({ error: "Error al obtener el producto" });
  }
};

// ==============================
// 📗 Crear Producto
// ==============================
exports.createProducto = async (req, res) => {
  const {
    Nombre,
    Descripcion,
    ID_Categoria_P,
    ID_Receta,
    Cantidad_Disponible,
    Estado,
  } = req.body;
  let Producto_Tamano = [];

  if (req.body.Producto_Tamano) {
    try {
      Producto_Tamano =
        typeof req.body.Producto_Tamano === "string"
          ? JSON.parse(req.body.Producto_Tamano)
          : req.body.Producto_Tamano;
    } catch (e) {}
  }

  if (!Nombre || ID_Categoria_P == null)
    return res.status(400).json({ error: "Faltan campos obligatorios" });

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // 1. Insertar Producto
    const result = await new sql.Request(transaction)
      .input("Nombre", sql.VarChar(100), Nombre)
      .input("Descripcion", sql.VarChar(8000), Descripcion || "")
      .input("ID_Categoria_P", sql.Int, Number(ID_Categoria_P))
      .input("ID_Receta", sql.Int, ID_Receta ? Number(ID_Receta) : null)
      .input("Cantidad_Disponible", sql.Int, Cantidad_Disponible || 0)
      .input("Estado", sql.Char(1), Estado || "A")
      .input("Fecha_Registro", sql.DateTime, new Date()).query(`
        INSERT INTO Producto (Nombre, Descripcion, ID_Categoria_P, ID_Receta, Cantidad_Disponible, Estado, Fecha_Registro)
        OUTPUT INSERTED.ID_Producto
        VALUES (@Nombre, @Descripcion, @ID_Categoria_P, @ID_Receta, @Cantidad_Disponible, @Estado, @Fecha_Registro);
      `);

    const idProducto = result.recordset[0].ID_Producto;

    // 2. Insertar Tamaños
    for (const t of Producto_Tamano) {
      await new sql.Request(transaction)
        .input("ID_Producto", sql.Int, idProducto)
        .input("ID_Tamano", sql.Int, t.ID_Tamano)
        .input("Precio", sql.Decimal(10, 2), t.Precio)
        .input("Estado", sql.Char(1), "A")
        .input("Fecha_Registro", sql.DateTime, new Date())
        .query(
          "INSERT INTO Producto_Tamano (ID_Producto, ID_Tamano, Precio, Estado, Fecha_Registro) VALUES (@ID_Producto, @ID_Tamano, @Precio, @Estado, @Fecha_Registro)",
        );
    }

    // 3. Guardar Imágenes (Async pero esperamos a que terminen de moverse)
    const archivosRenombrados = [];
    if (req.files && req.files.length > 0) {
      const movePromises = req.files.map(async (file, i) => {
        const ext = path.extname(file.originalname);
        const nuevoNombre = `producto_${idProducto}_${i + 1}${ext}`;
        await fs.rename(file.path, path.join(uploadDir, nuevoNombre));
        archivosRenombrados.push(nuevoNombre);
      });
      await Promise.all(movePromises);
    }

    await transaction.commit();

    // 4. Respuesta final con imágenes URLs
    const imgs = await getImagenesProducto(idProducto);

    return res.status(201).json({
      message: "Producto creado correctamente",
      ID_Producto: idProducto,
      imagenes: imgs,
    });
  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error("createProducto error:", err);
    return res.status(500).json({ error: "Error al crear producto" });
  }
};

// ==============================
// 📙 Actualizar Producto
// ==============================
exports.updateProducto = async (req, res) => {
  const { id } = req.params;
  const {
    Nombre,
    Descripcion,
    ID_Categoria_P,
    ID_Receta,
    Cantidad_Disponible,
    Estado,
  } = req.body;
  let Producto_Tamano = [];

  if (req.body.Producto_Tamano) {
    try {
      Producto_Tamano =
        typeof req.body.Producto_Tamano === "string"
          ? JSON.parse(req.body.Producto_Tamano)
          : req.body.Producto_Tamano;
    } catch (e) {}
  }

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // 1. Update Producto Base
    const request = new sql.Request(transaction);
    request.input("ID", sql.Int, id);

    let updates = [];
    if (Nombre) {
      updates.push("Nombre=@Nombre");
      request.input("Nombre", sql.VarChar, Nombre);
    }
    if (Descripcion !== undefined) {
      updates.push("Descripcion=@Desc");
      request.input("Desc", sql.VarChar, Descripcion);
    }
    if (ID_Categoria_P) {
      updates.push("ID_Categoria_P=@Cat");
      request.input("Cat", sql.Int, ID_Categoria_P);
    }
    if (ID_Receta !== undefined) {
      updates.push("ID_Receta=@Rec");
      request.input("Rec", sql.Int, ID_Receta);
    }
    if (Cantidad_Disponible !== undefined) {
      updates.push("Cantidad_Disponible=@Cant");
      request.input("Cant", sql.Int, Cantidad_Disponible);
    }
    if (Estado) {
      updates.push("Estado=@Est");
      request.input("Est", sql.Char(1), Estado);
    }

    if (updates.length > 0) {
      await request.query(
        `UPDATE Producto SET ${updates.join(",")} WHERE ID_Producto=@ID`,
      );
    }

    // 2. Update Tamaños (Lógica inteligente: Update, Insert o Soft-Delete)
    if (Producto_Tamano.length > 0 || req.body.Producto_Tamano) {
      // Solo si enviaron el array
      // Obtener actuales
      const currentSizes = await new sql.Request(transaction)
        .input("ID", sql.Int, id)
        .query(
          "SELECT ID_Producto_T, ID_Tamano FROM Producto_Tamano WHERE ID_Producto = @ID",
        );

      const currentMap = new Map(
        currentSizes.recordset.map((t) => [t.ID_Tamano, t.ID_Producto_T]),
      );
      const newSizesIds = new Set(Producto_Tamano.map((t) => t.ID_Tamano));

      // A. Insertar o Actualizar
      for (const t of Producto_Tamano) {
        if (currentMap.has(t.ID_Tamano)) {
          // Update Precio y Reactivar si estaba inactivo
          await new sql.Request(transaction)
            .input("ID_PT", sql.Int, currentMap.get(t.ID_Tamano))
            .input("Precio", sql.Decimal(10, 2), t.Precio)
            .query(
              "UPDATE Producto_Tamano SET Precio=@Precio, Estado='A' WHERE ID_Producto_T=@ID_PT",
            );
        } else {
          // Insert Nuevo
          await new sql.Request(transaction)
            .input("ID_P", sql.Int, id)
            .input("ID_T", sql.Int, t.ID_Tamano)
            .input("Precio", sql.Decimal(10, 2), t.Precio)
            .query(
              "INSERT INTO Producto_Tamano (ID_Producto, ID_Tamano, Precio, Estado, Fecha_Registro) VALUES (@ID_P, @ID_T, @Precio, 'A', GETDATE())",
            );
        }
      }

      // B. Desactivar los que ya no vienen (Soft Delete)
      for (const [idTamano, idPT] of currentMap) {
        if (!newSizesIds.has(idTamano)) {
          await new sql.Request(transaction)
            .input("ID_PT", sql.Int, idPT)
            .query(
              "UPDATE Producto_Tamano SET Estado='I' WHERE ID_Producto_T=@ID_PT",
            );
        }
      }
    }

    // 3. Update Imágenes
    if (req.files && req.files.length > 0) {
      await eliminarImagenesProducto(id); // Borrar viejas
      const movePromises = req.files.map(async (file, i) => {
        const ext = path.extname(file.originalname);
        const nuevoNombre = `producto_${id}_${i + 1}${ext}`;
        await fs.rename(file.path, path.join(uploadDir, nuevoNombre));
      });
      await Promise.all(movePromises);
    }

    await transaction.commit();

    // 4. Actualizar estado stock post-update
    await actualizarEstadoProducto(pool, id);

    return res.status(200).json({
      message: "Producto actualizado correctamente",
      imagenes: await getImagenesProducto(id),
    });
  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error("updateProducto error:", err);
    return res.status(500).json({ error: "Error al actualizar producto" });
  }
};

// ==============================
// 📕 Eliminar Producto (Borrado Lógico)
// ==============================
exports.deleteProducto = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getConnection();

    // 1. Verificar si el producto realmente existe en la BD
    const verif = await pool
      .request()
      .input("ID", sql.Int, id)
      .query("SELECT Estado FROM Producto WHERE ID_Producto = @ID");

    if (!verif.recordset.length) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    // 2. CAMBIO CLAVE: Hacemos un UPDATE en vez de un DELETE.
    // Esto cambia el Estado a 'I' (Inactivo) y soluciona el error 409 para siempre.
    await pool
      .request()
      .input("ID", sql.Int, id)
      .query("UPDATE Producto SET Estado = 'I' WHERE ID_Producto = @ID");

    // 3. Desactivamos también los tamaños de este producto para limpiar el catálogo
    await pool
      .request()
      .input("ID", sql.Int, id)
      .query("UPDATE Producto_Tamano SET Estado = 'I' WHERE ID_Producto = @ID");

    return res
      .status(200)
      .json({ message: "Producto inactivado correctamente" });
  } catch (err) {
    console.error("deleteProducto error:", err);
    return res
      .status(500)
      .json({ error: "Error al intentar eliminar el producto" });
  }
};
