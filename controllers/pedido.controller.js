const axios = require("axios");
const { sql, getConnection } = require("../config/Connection");
const bdModel = require("../models/bd.models");

// Mapper Pedido (usa los nombres exactos de bd.models.js)
function mapToPedido(row = {}) {
  const template = bdModel?.Pedido || {
    ID_Pedido: 0,
    ID_Cliente: 0,
    ID_Usuario: null,
    Hora_Pedido: "",
    Estado_P: "P",
    SubTotal: 0.0,
    Notas: "",
    Fecha_Registro: "",
  };

  return {
    ...template,
    ID_Pedido: row.ID_Pedido ?? template.ID_Pedido,
    ID_Cliente: row.ID_Cliente ?? template.ID_Cliente,
    ID_Usuario: row.ID_Usuario ?? template.ID_Usuario,
    Hora_Pedido: row.Hora_Pedido ?? template.Hora_Pedido,
    Estado_P: row.Estado_P ?? template.Estado_P,
    SubTotal: row.SubTotal ?? template.SubTotal,
    Notas: row.Notas ?? template.Notas,
    Fecha_Registro: row.Fecha_Registro ?? template.Fecha_Registro,
  };
}

// Mapper DetallePedido
function mapToDetallePedido(row = {}) {
  const template = bdModel?.PedidoDetalle || {
    ID_Pedido_D: 0,
    ID_Pedido: 0,
    ID_Producto_T: 0,
    ID_Combo: 0,
    Cantidad: 1,
    PrecioTotal: 0.0,
  };

  return {
    ...template,
    ID_Pedido_D: row.ID_Pedido_D ?? template.ID_Pedido_D,
    ID_Pedido: row.ID_Pedido ?? template.ID_Pedido,
    ID_Producto_T: row.ID_Producto_T ?? template.ID_Producto_T,
    ID_Combo: row.ID_Combo ?? template.ID_Combo, // 🔹 AGREGADO
    Cantidad: row.Cantidad ?? template.Cantidad,
    PrecioTotal: row.PrecioTotal ?? template.PrecioTotal,
  };
}

// ---------------------------------
// Helper: obtener precio unitario producto
// ---------------------------------
async function calcularPrecioUnitario(transaction, ID_Producto_T) {
  const req = new sql.Request(transaction);
  const result = await req.input("ID_Producto_T", sql.Int, ID_Producto_T)
    .query(`
      SELECT Precio
      FROM Producto_Tamano
      WHERE ID_Producto_T = @ID_Producto_T
        AND Estado = 'A'
    `);

  if (result.recordset.length === 0) {
    throw new Error(
      "No existe el producto/tamaño seleccionado o está inactivo.",
    );
  }

  return Number(result.recordset[0].Precio);
}

// ---------------------------------
// Helper: obtener precio del combo
// ---------------------------------
async function calcularPrecioCombo(transaction, ID_Combo) {
  const req = new sql.Request(transaction);

  const result = await req.input("ID_Combo", sql.Int, ID_Combo).query(`
      SELECT Precio
      FROM Combos
      WHERE ID_Combo = @ID_Combo
        AND Estado = 'A'
    `);

  if (result.recordset.length === 0) {
    throw new Error("El combo no existe o está inactivo.");
  }

  return Number(result.recordset[0].Precio);
}

// ---------------------------------
// Helper: Restar stock de Producto
// ---------------------------------
async function descontarStock(transaction, ID_Producto_T, Cantidad) {
  const reqData = new sql.Request(transaction);

  const data = await reqData.input("ID_Producto_T", sql.Int, ID_Producto_T)
    .query(`
      SELECT p.ID_Producto, p.Cantidad_Disponible
      FROM Producto_Tamano pt
      INNER JOIN Producto p ON pt.ID_Producto = p.ID_Producto
      WHERE pt.ID_Producto_T = @ID_Producto_T
    `);

  if (!data.recordset.length) {
    throw new Error("No se encontró el producto para descontar stock.");
  }

  const prod = data.recordset[0];
  const stockActual = prod.Cantidad_Disponible;

  if (stockActual < Cantidad) {
    throw new Error("Stock insuficiente.");
  }

  // Restar
  const reqUpdate = new sql.Request(transaction);
  await reqUpdate
    .input("ID_Producto", sql.Int, prod.ID_Producto)
    .input("NuevoStock", sql.Int, stockActual - Cantidad).query(`
      UPDATE Producto
      SET Cantidad_Disponible = @NuevoStock
      WHERE ID_Producto = @ID_Producto
    `);
}

async function obtenerProductosDeCombo(transaction, ID_Combo) {
  const req = new sql.Request(transaction);

  const result = await req.input("ID_Combo", sql.Int, ID_Combo).query(`
      SELECT 
        ID_Producto_T,
        Cantidad AS Cantidad_Requerida
      FROM Combos_Detalle
      WHERE ID_Combo = @ID_Combo
    `);

  return result.recordset;
}

// ==============================================================
//            CREAR PEDIDO CON DETALLE (PRODUCTO Y/O COMBO)
// ==============================================================
exports.createPedidoConDetalle = async (req, res) => {
  const { ID_Cliente, ID_Usuario, Hora_Pedido, Estado_P, Notas, detalles } =
    req.body;

  try {
    if (!detalles || !Array.isArray(detalles) || detalles.length === 0) {
      return res
        .status(400)
        .json({ error: "Debe enviar al menos un detalle." });
    }

    let clienteIdFinal;

    if (ID_Cliente && ID_Cliente !== "") {
      clienteIdFinal = ID_Cliente;
    } else {
      const poolCheck = await getConnection();
      const clienteVarios = await poolCheck
        .request()
        .input("Nombre", sql.VarChar(100), "Clientes Varios")
        .query("SELECT ID_Cliente FROM Cliente WHERE Nombre = @Nombre");

      clienteIdFinal = clienteVarios.recordset.length
        ? clienteVarios.recordset[0].ID_Cliente
        : 1;
    }

    const usuarioIdFinal = ID_Usuario && ID_Usuario !== "" ? ID_Usuario : null;

    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      // Validar cliente
      const checkClienteReq = new sql.Request(transaction);
      const clienteExists = await checkClienteReq
        .input("ID_Cliente", sql.Int, clienteIdFinal)
        .query("SELECT ID_Cliente FROM Cliente WHERE ID_Cliente = @ID_Cliente");

      if (!clienteExists.recordset.length) {
        await transaction.rollback();
        return res
          .status(400)
          .json({ error: `El cliente con ID ${clienteIdFinal} no existe` });
      }

      // ============================================
      // INSERTAR PEDIDO
      // ============================================
      const requestPedido = new sql.Request(transaction);
      const insertPedidoQuery = `
        INSERT INTO Pedido (
          ID_Cliente, ID_Usuario, Hora_Pedido,
          Estado_P, SubTotal, Notas, Fecha_Registro
        ) VALUES (
          @ID_Cliente, @ID_Usuario, @Hora_Pedido,
          @Estado_P, @SubTotal, @Notas, @Fecha_Registro
        );
        SELECT SCOPE_IDENTITY() AS ID_Pedido;
      `;

      const resultInsertPedido = await requestPedido
        .input("ID_Cliente", sql.Int, clienteIdFinal)
        .input("ID_Usuario", sql.Int, usuarioIdFinal)
        .input(
          "Hora_Pedido",
          sql.VarChar(20),
          Hora_Pedido || new Date().toLocaleTimeString(),
        )
        .input("Estado_P", sql.Char(1), Estado_P || "P")
        .input("SubTotal", sql.Decimal(10, 2), 0.0)
        .input("Notas", sql.VarChar(255), Notas || "")
        .input("Fecha_Registro", sql.DateTime, new Date())
        .query(insertPedidoQuery);

      const pedido_id = resultInsertPedido.recordset?.[0]?.ID_Pedido;
      if (!pedido_id) throw new Error("No se obtuvo ID del pedido");

      let subTotalAcumulado = 0.0;

      // ============================================================
      // INSERTAR DETALLES + RESTAR STOCK
      // ============================================================
      for (const d of detalles) {
        const {
          ID_Producto_T,
          ID_Combo,
          Cantidad,
          Precio,
          Complementos,
          Notas,
        } = d;

        if (!Cantidad || Cantidad <= 0)
          throw new Error("Cantidad inválida en un detalle");

        const precioUnitario = Precio ?? 0;
        const subtotalLinea = Number((precioUnitario * Cantidad).toFixed(2));
        subTotalAcumulado += subtotalLinea;

        // Insertar detalle principal
        await new sql.Request(transaction)
          .input("ID_Pedido", sql.Int, pedido_id)
          .input("ID_Producto_T", sql.Int, ID_Producto_T || null)
          .input("ID_Combo", sql.Int, ID_Combo || null)
          .input("Cantidad", sql.Int, Cantidad)
          .input("PrecioTotal", sql.Decimal(10, 2), subtotalLinea)
          .input("Notas", sql.NVarChar(150), Notas || null) // 🔹 AGREGAR ESTA LÍNEA
          .query(`
            INSERT INTO Pedido_Detalle (
              ID_Pedido, ID_Producto_T, ID_Combo,
              Cantidad, PrecioTotal, Notas
            )
            VALUES (
              @ID_Pedido, @ID_Producto_T, @ID_Combo,
              @Cantidad, @PrecioTotal, @Notas
            )
          `);

        // ====================================================
        // RESTAR STOCK — PRODUCTO NORMAL
        // ====================================================
        if (ID_Producto_T) {
          await descontarStock(transaction, ID_Producto_T, Cantidad);
        }

        // ====================================================
        // RESTAR STOCK — COMBO (LO IMPORTANTE!)
        // ====================================================
        if (ID_Combo) {
          const productosDelCombo = await obtenerProductosDeCombo(
            transaction,
            ID_Combo,
          );

          for (const prod of productosDelCombo) {
            const cantidadFinal = prod.Cantidad_Requerida * Cantidad;
            await descontarStock(
              transaction,
              prod.ID_Producto_T,
              cantidadFinal,
            );
          }
        }

        // Complementos (sin cambios)
        if (ID_Combo && Complementos && Array.isArray(Complementos)) {
          for (const c of Complementos) {
            const compSubtotal = c.Precio ? Number(c.Precio) : 0;
            subTotalAcumulado += compSubtotal;

            await new sql.Request(transaction)
              .input("ID_Pedido", sql.Int, pedido_id)
              .input("ID_Producto_T", sql.Int, c.ID_Producto_T)
              .input("ID_Combo", sql.Int, ID_Combo)
              .input("Cantidad", sql.Int, 1)
              .input("PrecioTotal", sql.Decimal(10, 2), compSubtotal).query(`
                INSERT INTO Pedido_Detalle (
                  ID_Pedido, ID_Producto_T, ID_Combo,
                  Cantidad, PrecioTotal
                )
                VALUES (
                  @ID_Pedido, @ID_Producto_T, @ID_Combo,
                  @Cantidad, @PrecioTotal
                )
              `);
          }
        }
      }

      // ============================================
      // ACTUALIZAR SUBTOTAL DEL PEDIDO
      // ============================================
      await new sql.Request(transaction)
        .input("SubTotal", sql.Decimal(10, 2), subTotalAcumulado)
        .input("ID_Pedido", sql.Int, pedido_id)
        .query(
          "UPDATE Pedido SET SubTotal = @SubTotal WHERE ID_Pedido = @ID_Pedido",
        );

      await transaction.commit();

      return res.status(201).json({
        message: "Pedido y detalles registrados correctamente",
        ID_Pedido: pedido_id,
        SubTotal: subTotalAcumulado,
      });
    } catch (err) {
      await transaction.rollback();
      return res.status(500).json({ error: err.message });
    }
  } catch (err) {
    return res.status(500).json({ error: "Error al registrar el pedido" });
  }
};

// Listar pedidos FIFO (por Fecha_Registro ASC, Hora_Pedido ASC)
exports.getPedidos = async (_req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool
      .request()
      .query(
        "SELECT * FROM Pedido ORDER BY Fecha_Registro ASC, Hora_Pedido ASC",
      );
    const pedidos = (result.recordset || []).map(mapToPedido);
    return res.status(200).json(pedidos);
  } catch (err) {
    console.error("getPedidos error:", err);
    return res.status(500).json({ error: "Error al obtener los pedidos" });
  }
};

// Obtener detalles concatenados + notas generales
exports.getDetallesConNotas = async (req, res) => {
  const { pedido_id } = req.params;

  try {
    const pool = await getConnection();

    const result = await pool.request().input("ID_Pedido", sql.Int, pedido_id)
      .query(`
        SELECT 
          d.Cantidad,
          -- Información de producto
          p.Nombre AS nombre_producto,
          t.Tamano AS nombre_tamano,
          -- Información de combo
          c.Nombre AS nombre_combo
        FROM Pedido_Detalle d
        LEFT JOIN Producto_Tamano pt ON d.ID_Producto_T = pt.ID_Producto_T
        LEFT JOIN Producto p ON pt.ID_Producto = p.ID_Producto
        LEFT JOIN Tamano t ON pt.ID_Tamano = t.ID_Tamano
        LEFT JOIN Combos c ON d.ID_Combo = c.ID_Combo
        WHERE d.ID_Pedido = @ID_Pedido
      `);

    if (!result.recordset.length) {
      return res
        .status(404)
        .json({ error: "No hay detalles para este pedido" });
    }

    const detallesTexto = result.recordset
      .map((d) => {
        if (d.nombre_producto) {
          return `${d.nombre_producto} (${d.nombre_tamano}) x ${d.Cantidad}`;
        } else if (d.nombre_combo) {
          return `${d.nombre_combo} (Combo) x ${d.Cantidad}`;
        }
        return `Item x ${d.Cantidad}`;
      })
      .join(", ");

    return res.status(200).json({ detalle: detallesTexto });
  } catch (err) {
    console.error("getDetallesConNotas error:", err);
    return res
      .status(500)
      .json({ error: "Error al obtener los detalles del pedido" });
  }
};

// Actualizar pedido y detalles (transaccional, parcial)
exports.updatePedidoConDetalle = async (req, res) => {
  const { id } = req.params; // ID_Pedido
  const { ID_Cliente, ID_Usuario, Estado_P, Notas, detalles } = req.body;

  // ⚠️ Importante: Monto_Descuento y Total ELIMINADOS del cuerpo de la función ⚠️

  try {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Actualizar Pedido (campos parciales)
      const updateFields = [];
      const reqPedido = new sql.Request(transaction);
      reqPedido.input("ID_Pedido", sql.Int, id);

      if (ID_Cliente !== undefined) {
        updateFields.push("ID_Cliente = @ID_Cliente");
        reqPedido.input("ID_Cliente", sql.Int, ID_Cliente);
      }
      if (ID_Usuario !== undefined) {
        updateFields.push("ID_Usuario = @ID_Usuario");
        reqPedido.input("ID_Usuario", sql.Int, ID_Usuario || null);
      }
      if (Estado_P !== undefined) {
        updateFields.push("Estado_P = @Estado_P");
        reqPedido.input("Estado_P", sql.Char(1), Estado_P);
      }
      if (Notas !== undefined) {
        updateFields.push("Notas = @Notas");
        reqPedido.input("Notas", sql.VarChar(255), Notas);
      }
      // ⚠️ Monto_Descuento eliminado de la actualización ⚠️

      if (updateFields.length > 0) {
        const queryUpdatePedido = `UPDATE Pedido SET ${updateFields.join(", ")} WHERE ID_Pedido = @ID_Pedido`;
        const resUpdPedido = await reqPedido.query(queryUpdatePedido);
        if (resUpdPedido.rowsAffected[0] === 0) {
          await transaction.rollback();
          return res.status(404).json({ error: "Pedido no encontrado" });
        }
      }

      // Actualizar detalles si vienen
      if (detalles && Array.isArray(detalles)) {
        for (const det of detalles) {
          const { ID_Pedido_D, ID_Producto_T, ID_Combo, Cantidad } = det;
          if (!ID_Pedido_D) {
            await transaction.rollback();
            return res
              .status(400)
              .json({ error: "Falta ID_Pedido_D en detalles" });
          }

          const fieldsDetalle = [];
          const reqDet = new sql.Request(transaction);
          reqDet.input("ID_Pedido_D", sql.Int, ID_Pedido_D);

          let recalcularPrecio = false;
          let precioUnitario = null;

          if (ID_Producto_T !== undefined) {
            fieldsDetalle.push("ID_Producto_T = @ID_Producto_T");
            reqDet.input("ID_Producto_T", sql.Int, ID_Producto_T);
            recalcularPrecio = true;
          }

          if (ID_Combo !== undefined) {
            fieldsDetalle.push("ID_Combo = @ID_Combo");
            reqDet.input("ID_Combo", sql.Int, ID_Combo);
            recalcularPrecio = true;
          }

          if (Cantidad !== undefined) {
            if (Cantidad <= 0) {
              await transaction.rollback();
              return res
                .status(400)
                .json({ error: "La cantidad debe ser mayor a 0" });
            }
            fieldsDetalle.push("Cantidad = @Cantidad");
            reqDet.input("Cantidad", sql.Int, Cantidad);
            recalcularPrecio = true;
          }

          if (recalcularPrecio) {
            // Obtener valores actuales si faltan campos
            const curDetRes = await new sql.Request(transaction)
              .input("ID_Pedido_D_TMP", sql.Int, ID_Pedido_D)
              .query(
                "SELECT ID_Producto_T, ID_Combo, Cantidad FROM Pedido_Detalle WHERE ID_Pedido_D = @ID_Pedido_D_TMP",
              );

            if (!curDetRes.recordset.length) {
              await transaction.rollback();
              return res
                .status(404)
                .json({ error: `Detalle no encontrado: ${ID_Pedido_D}` });
            }

            const cur = curDetRes.recordset[0];
            const finalProducto =
              ID_Producto_T !== undefined ? ID_Producto_T : cur.ID_Producto_T;
            const finalCombo = ID_Combo !== undefined ? ID_Combo : cur.ID_Combo;
            const finalCantidad =
              Cantidad !== undefined ? Cantidad : cur.Cantidad;

            // Calcular precio unitario según si es producto o combo
            try {
              if (finalProducto) {
                precioUnitario = await calcularPrecioUnitario(
                  transaction,
                  finalProducto,
                );
              } else if (finalCombo) {
                precioUnitario = await calcularPrecioCombo(
                  transaction,
                  finalCombo,
                );
              } else {
                await transaction.rollback();
                return res
                  .status(400)
                  .json({ error: "El detalle debe tener producto o combo" });
              }
            } catch (err) {
              await transaction.rollback();
              return res.status(400).json({ error: err.message });
            }

            const subtotalLinea = Number(
              (precioUnitario * Number(finalCantidad)).toFixed(2),
            );
            fieldsDetalle.push("PrecioTotal = @PrecioTotal");
            reqDet.input("PrecioTotal", sql.Decimal(10, 2), subtotalLinea);
          }

          if (fieldsDetalle.length > 0) {
            const queryUpdateDetalle = `UPDATE Pedido_Detalle SET ${fieldsDetalle.join(", ")} WHERE ID_Pedido_D = @ID_Pedido_D`;
            const resUpdDet = await reqDet.query(queryUpdateDetalle);
            if (resUpdDet.rowsAffected[0] === 0) {
              await transaction.rollback();
              return res
                .status(404)
                .json({ error: `Detalle no encontrado: ${ID_Pedido_D}` });
            }
          }
        }
      }

      // Recalcular SubTotal sumando todos los detalles actuales
      const sumRes = await new sql.Request(transaction)
        .input("ID_Pedido_SUM", sql.Int, id)
        .query(
          "SELECT ISNULL(SUM(PrecioTotal),0) AS SubTotalCalc FROM Pedido_Detalle WHERE ID_Pedido = @ID_Pedido_SUM",
        );

      const nuevoSubTotal = Number(sumRes.recordset[0].SubTotalCalc ?? 0);

      // ⚠️ Monto_Descuento y Total han sido eliminados del cálculo y la actualización.
      // Solo actualizamos SubTotal.
      await new sql.Request(transaction)
        .input("SubTotal", sql.Decimal(10, 2), nuevoSubTotal)
        .input("ID_Pedido", sql.Int, id)
        .query(
          "UPDATE Pedido SET SubTotal = @SubTotal WHERE ID_Pedido = @ID_Pedido",
        );

      await transaction.commit();
      return res.status(200).json({
        message: "Pedido y detalles actualizados correctamente",
        SubTotal: nuevoSubTotal,
      });
    } catch (err) {
      await transaction.rollback();
      console.error("updatePedidoConDetalle transaction error:", err);
      return res
        .status(500)
        .json({ error: "Error al actualizar el pedido con detalles" });
    }
  } catch (err) {
    console.error("updatePedidoConDetalle error:", err);
    return res.status(500).json({ error: "Error al actualizar el pedido" });
  }
};

// Obtener solo los detalles
exports.getPedidoDetalles = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getConnection();

    const result = await pool.request().input("ID_Pedido", sql.Int, id).query(`
        SELECT 
          d.ID_Pedido_D, 
          d.ID_Producto_T, 
          d.ID_Combo, 
          d.Cantidad, 
          d.PrecioTotal,
          d.Notas,
          p.Nombre AS nombre_producto,
          t.Tamano AS nombre_tamano,
          cp.Nombre AS nombre_categoria,
          c.Nombre AS nombre_combo,
          c.Descripcion AS descripcion_combo
        FROM Pedido_Detalle d
        LEFT JOIN Producto_Tamano pt ON d.ID_Producto_T = pt.ID_Producto_T
        LEFT JOIN Producto p ON pt.ID_Producto = p.ID_Producto
        LEFT JOIN Tamano t ON pt.ID_Tamano = t.ID_Tamano
        LEFT JOIN Categoria_Producto cp ON p.ID_Categoria_P = cp.ID_Categoria_P
        LEFT JOIN Combos c ON d.ID_Combo = c.ID_Combo
        WHERE d.ID_Pedido = @ID_Pedido
        ORDER BY d.ID_Pedido_D
      `);

    if (!result.recordset.length)
      return res
        .status(404)
        .json({ error: "No hay detalles para este pedido" });

    // Procesar los resultados para determinar tipo de item
    const detallesProcesados = result.recordset.map((detalle) => ({
      ...detalle,
      tipo: detalle.ID_Producto_T ? "producto" : "combo",
      nombre: detalle.ID_Producto_T
        ? detalle.nombre_producto
        : detalle.nombre_combo,
      descripcion: detalle.ID_Producto_T
        ? `${detalle.nombre_producto} (${detalle.nombre_tamano})`
        : detalle.descripcion_combo,
    }));

    return res.status(200).json(detallesProcesados);
  } catch (err) {
    console.error("❌ getPedidoDetalles error:", err.message);
    return res.status(500).json({ error: "Error al obtener los detalles" });
  }
};

// Obtener Pedido por ID + Detalles
exports.getPedidoById = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getConnection();

    const pedidoRes = await pool
      .request()
      .input("ID_Pedido", sql.Int, id)
      .query("SELECT * FROM Pedido WHERE ID_Pedido = @ID_Pedido");

    if (!pedidoRes.recordset.length)
      return res.status(404).json({ error: "Pedido no encontrado" });

    const pedido = pedidoRes.recordset[0];

    const detallesRes = await pool.request().input("ID_Pedido", sql.Int, id)
      .query(`
        SELECT
          d.ID_Pedido_D, 
          d.ID_Pedido, 
          d.ID_Producto_T, 
          d.ID_Combo, 
          d.Cantidad, 
          d.PrecioTotal,
          d.Notas,
          p.Nombre AS nombre_producto,
          t.Tamano AS nombre_tamano,
          c.Nombre AS nombre_combo
        FROM Pedido_Detalle d
        LEFT JOIN Producto_Tamano pt ON d.ID_Producto_T = pt.ID_Producto_T
        LEFT JOIN Producto p ON pt.ID_Producto = p.ID_Producto
        LEFT JOIN Tamano t ON pt.ID_Tamano = t.ID_Tamano
        LEFT JOIN Combos c ON d.ID_Combo = c.ID_Combo
        WHERE d.ID_Pedido = @ID_Pedido
        ORDER BY d.ID_Pedido_D
      `);

    // Procesar detalles para agregar información de tipo
    const detallesProcesados = detallesRes.recordset.map((detalle) => ({
      ...detalle,
      tipo: detalle.ID_Producto_T ? "producto" : "combo",
      nombre: detalle.ID_Producto_T
        ? `${detalle.nombre_producto} (${detalle.nombre_tamano})`
        : detalle.nombre_combo,
    }));

    return res.status(200).json({
      ...pedido,
      detalles: detallesProcesados,
    });
  } catch (err) {
    console.error("❌ getPedidoById error:", err.message);
    return res.status(500).json({ error: "Error al obtener el pedido" });
  }
};

// Actualizar estado del pedido
exports.statusPedido = async (req, res) => {
  const { id } = req.params; // ID_Pedido
  const { Estado_P } = req.body;

  try {
    // Validar que el estado sea válido
    const estadosValidos = ["E", "C"]; // Solo permitir cambiar a Entregado o Cancelado
    if (!Estado_P || !estadosValidos.includes(Estado_P)) {
      return res.status(400).json({
        error: "Estado inválido",
        estados_permitidos: estadosValidos,
        descripcion: {
          E: "Entregado",
          C: "Cancelado",
        },
      });
    }

    const pool = await getConnection();

    // Verificar que el pedido existe
    const pedidoCheck = await pool
      .request()
      .input("ID_Pedido", sql.Int, id)
      .query(
        "SELECT ID_Pedido, Estado_P FROM Pedido WHERE ID_Pedido = @ID_Pedido",
      );

    if (!pedidoCheck.recordset.length) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }

    const pedidoActual = pedidoCheck.recordset[0];

    // Solo permitir cambiar estado de pedidos pendientes
    if (pedidoActual.Estado_P !== "P") {
      return res.status(400).json({
        error: "Solo se puede modificar un pedido pendiente",
        estado_actual: pedidoActual.Estado_P,
      });
    }

    // Actualizar el estado del pedido
    const result = await pool
      .request()
      .input("Estado_P", sql.Char(1), Estado_P)
      .input("ID_Pedido", sql.Int, id)
      .query(
        "UPDATE Pedido SET Estado_P = @Estado_P WHERE ID_Pedido = @ID_Pedido",
      );

    if (result.rowsAffected[0] === 0) {
      return res
        .status(500)
        .json({ error: "No se pudo actualizar el estado del pedido" });
    }

    return res.status(200).json({
      message: "Estado del pedido actualizado correctamente",
      ID_Pedido: parseInt(id),
      estado_anterior: pedidoActual.Estado_P,
      estado_nuevo: Estado_P,
      descripcion_estado: {
        E: "Entregado",
        C: "Cancelado",
      }[Estado_P],
    });
  } catch (err) {
    console.error("❌ statusPedido error:", err.message);
    return res
      .status(500)
      .json({ error: "Error al actualizar el estado del pedido" });
  }
};

// ==============================
// 🔹 Obtener pedidos del día de hoy (todos los estados)
// ==============================
exports.getPedidosHoy = async (_req, res) => {
  try {
    const pool = await getConnection();

    // Primero obtener los pedidos del día
    const pedidosQuery = `
      SELECT 
        p.ID_Pedido,
        p.ID_Cliente,
        p.ID_Usuario,
        p.Hora_Pedido,
        p.Estado_P,
        p.SubTotal,
        p.Notas,
        p.Fecha_Registro,
        c.Nombre AS Cliente_Nombre,
        u.Perfil AS Usuario_Perfil
      FROM Pedido p
      LEFT JOIN Cliente c ON p.ID_Cliente = c.ID_Cliente
      LEFT JOIN Usuario u ON p.ID_Usuario = u.ID_Usuario
      WHERE CAST(p.Fecha_Registro AS DATE) = CAST(GETDATE() AS DATE)
      ORDER BY p.Fecha_Registro DESC, p.Hora_Pedido ASC
    `;

    const pedidosResult = await pool.request().query(pedidosQuery);
    const pedidos = pedidosResult.recordset || [];

    // Para cada pedido, obtener sus detalles por separado
    const pedidosConDetalles = await Promise.all(
      pedidos.map(async (pedido) => {
        const detallesQuery = `
  SELECT 
    pd.Cantidad,
    pd.Notas,
    -- Información de producto
    pr.Nombre AS nombre_producto,
    t.Tamano AS nombre_tamano,
    -- Información de combo
    c.Nombre AS nombre_combo
  FROM Pedido_Detalle pd
  LEFT JOIN Producto_Tamano pt ON pd.ID_Producto_T = pt.ID_Producto_T
  LEFT JOIN Producto pr ON pt.ID_Producto = pr.ID_Producto
  LEFT JOIN Tamano t ON pt.ID_Tamano = t.ID_Tamano
  LEFT JOIN Combos c ON pd.ID_Combo = c.ID_Combo
  WHERE pd.ID_Pedido = @ID_Pedido
  ORDER BY pd.ID_Pedido_D
`;

        const detallesResult = await pool
          .request()
          .input("ID_Pedido", sql.Int, pedido.ID_Pedido)
          .query(detallesQuery);

        const detallesTexto = detallesResult.recordset
          .map((d) => {
            const nota = d.Notas ? ` [${d.Notas}]` : ""; // 🔹 AGREGAR: mostrar la nota entre corchetes
            if (d.nombre_producto) {
              return `${d.nombre_producto} (${d.nombre_tamano}) x ${d.Cantidad}${nota}`;
            } else if (d.nombre_combo) {
              return `${d.nombre_combo} (Combo) x ${d.Cantidad}${nota}`;
            }
            return `Item x ${d.Cantidad}${nota}`;
          })
          .join(", ");

        return {
          ID_Pedido: pedido.ID_Pedido,
          ID_Cliente: pedido.ID_Cliente,
          ID_Usuario: pedido.ID_Usuario,
          Hora_Pedido: pedido.Hora_Pedido,
          Estado_P: pedido.Estado_P,
          SubTotal: pedido.SubTotal,
          Notas: pedido.Notas,
          Fecha_Registro: pedido.Fecha_Registro,
          Cliente_Nombre: pedido.Cliente_Nombre || "Cliente Varios",
          Usuario_Perfil: pedido.Usuario_Perfil,
          Detalles_Pedido: detallesTexto || "",
          Descripcion_Estado: {
            P: "Pendiente",
            E: "Entregado",
            C: "Cancelado",
          }[pedido.Estado_P],
        };
      }),
    );

    // Calcular estadísticas del día
    const totalPedidos = pedidosConDetalles.length;
    const pedidosPendientes = pedidosConDetalles.filter(
      (p) => p.Estado_P === "P",
    ).length;
    const pedidosEntregados = pedidosConDetalles.filter(
      (p) => p.Estado_P === "E",
    ).length;
    const pedidosCancelados = pedidosConDetalles.filter(
      (p) => p.Estado_P === "C",
    ).length;
    const totalIngresos = pedidosConDetalles.reduce(
      (sum, pedido) => sum + (Number(pedido.SubTotal) || 0),
      0,
    );

    res.status(200).json({
      pedidos: pedidosConDetalles,
      estadisticas: {
        totalPedidos,
        pedidosPendientes,
        pedidosEntregados,
        pedidosCancelados,
        totalIngresos: Number(totalIngresos.toFixed(2)),
        fecha: new Date().toISOString().split("T")[0],
      },
    });
  } catch (err) {
    console.error("getPedidosHoy error:", err);
    return res
      .status(500)
      .json({ error: "Error al obtener los pedidos del día" });
  }
};
