const { sql, getConnection } = require("../config/Connection");
const bdModel = require("../models/bd.models");
const {
  enviarMensajePedido,
  iniciarTemporizadorRespuesta,
} = require("../config/mensajes");

// ==============================
// 🔹 Mapper
// ==============================
function mapToVenta(row = {}) {
  const template = bdModel?.Venta || {};
  return {
    ...template,
    ID_Venta: row.ID_Venta ?? template.ID_Venta,
    ID_Pedido: row.ID_Pedido ?? template.ID_Pedido,
    ID_Tipo_Venta: row.ID_Tipo_Venta ?? template.ID_Tipo_Venta,
    ID_Origen_Venta: row.ID_Origen_Venta ?? template.ID_Origen_Venta,
    ID_Tipo_Pago: row.ID_Tipo_Pago ?? template.ID_Tipo_Pago,
    IGV: row.IGV ?? template.IGV,
    Total: row.Total ?? template.Total,
    Monto_Recibido: row.Monto_Recibido ?? template.Monto_Recibido,
    Vuelto: row.Vuelto ?? template.Vuelto,
    Fecha_Registro: row.Fecha_Registro ?? template.Fecha_Registro,
  };
}

// ==============================
// 🔹 Helper: Calcular Montos (SubTotal, Descuento, Total)
// ==============================
async function calcularMontos(pool, ID_Pedido) {
  const pedidoRes = await pool
    .request()
    .input("ID_Pedido", sql.Int, ID_Pedido)
    .query("SELECT SubTotal FROM Pedido WHERE ID_Pedido = @ID_Pedido");

  if (!pedidoRes.recordset.length) throw new Error("Pedido no encontrado");
  const pedidoSubTotal = Number(pedidoRes.recordset[0].SubTotal ?? 0);

  const usoRes = await pool.request().input("ID_Pedido", sql.Int, ID_Pedido)
    .query(`
      SELECT uc.*, c.Tipo_Desc, c.Valor_Desc, c.Monto_Max
      FROM Uso_Cupon uc
      LEFT JOIN Cupones c ON uc.ID_Cupon = c.ID_Cupon
      WHERE uc.ID_Pedido = @ID_Pedido
      ORDER BY uc.Fecha_Uso DESC
    `);

  let descuentoMonto = 0;
  let cuponAplicado = null;

  if (usoRes.recordset.length) {
    const uso = usoRes.recordset[0];
    cuponAplicado = {
      ...uso,
      Valor_Desc: Number(uso.Valor_Desc),
      Monto_Max: Number(uso.Monto_Max),
      Descuento_Aplic: Number(uso.Descuento_Aplic),
    };

    if (cuponAplicado.Descuento_Aplic > 0) {
      descuentoMonto = cuponAplicado.Descuento_Aplic;
    } else {
      if (String(cuponAplicado.Tipo_Desc).toLowerCase() === "porcentaje") {
        descuentoMonto = +(pedidoSubTotal * (cuponAplicado.Valor_Desc / 100));
      } else {
        descuentoMonto = cuponAplicado.Valor_Desc || 0;
      }
      if (
        cuponAplicado.Monto_Max > 0 &&
        descuentoMonto > cuponAplicado.Monto_Max
      ) {
        descuentoMonto = cuponAplicado.Monto_Max;
      }
      descuentoMonto = Number(descuentoMonto.toFixed(2));
    }
  }

  const subtotalConCupon = Math.max(0, pedidoSubTotal - descuentoMonto);
  const igvMonto = 0; // Si no hay lógica de IGV, se mantiene en 0
  const totalFinal = Number(subtotalConCupon.toFixed(2));

  return {
    pedidoSubTotal,
    descuentoMonto,
    subtotalConCupon,
    igvMonto,
    totalFinal,
    cuponAplicado,
  };
}

// ==============================
// 🔹 Helper: Sumar Puntos (10% del Total - Corregido SQL)
// ==============================
async function sumarPuntosCliente(transaction, ID_Cliente, Monto_Total) {
  try {
    // 🧪 Logging para verificar que la función se llama y recibe el monto
    console.log(
      `[PUNTOS] Procesando cliente ID: ${ID_Cliente}, Monto Total Recibido: S/ ${Monto_Total.toFixed(2)}`,
    );

    // Regla: 10% del total, redondeado hacia abajo (piso)
    const puntosGanados = Math.floor(Monto_Total * 0.1);

    console.log(`[PUNTOS] Puntos calculados: ${puntosGanados}`);

    if (puntosGanados <= 0) return 0;

    // Buscar si el cliente ya tiene registro de puntos
    const checkPuntos = await new sql.Request(transaction)
      .input("ID_Cliente", sql.Int, ID_Cliente)
      .query(
        "SELECT ID_Puntos FROM Cliente_Puntos WHERE ID_Cliente = @ID_Cliente",
      );

    if (checkPuntos.recordset.length > 0) {
      // Actualizar puntos existentes
      await new sql.Request(transaction)
        .input("Puntos", sql.Int, puntosGanados)
        .input("ID_Cliente", sql.Int, ID_Cliente)
        // ✅ CORRECCIÓN CRÍTICA: Se agrega el @ al parámetro SQL
        .query(
          "UPDATE Cliente_Puntos SET Puntos_Acumulados = Puntos_Acumulados + @Puntos, Fecha_Actualizacion = GETDATE() WHERE ID_Cliente = @ID_Cliente",
        );
    } else {
      // Insertar nuevo registro de puntos
      await new sql.Request(transaction)
        .input("ID_Cliente", sql.Int, ID_Cliente)
        .input("Puntos", sql.Int, puntosGanados)
        // ✅ CORRECCIÓN: Se usa @Puntos para el valor de inserción
        .query(
          "INSERT INTO Cliente_Puntos (ID_Cliente, Puntos_Acumulados, Fecha_Actualizacion) VALUES (@ID_Cliente, @Puntos, GETDATE())",
        );
    }
    return puntosGanados;
  } catch (error) {
    // ❌ Este log ayuda a diagnosticar si la tabla no existe o si hay un error SQL
    console.error(
      "❌ Error CRÍTICO al sumar puntos y actualizar DB (Revisar Cliente_Puntos):",
      error,
    );
    return 0;
  }
}

// ==============================
// 🔹 Listar ventas (Historial)
// ==============================
exports.getVentas = async (_req, res) => {
  try {
    const pool = await getConnection();
    const sqlQuery = `
            SELECT 
                v.*, 
                c.Nombre AS Cliente_Nombre, 
                tv.Nombre AS Tipo_Venta_Nombre,
                ov.Nombre AS Origen_Venta_Nombre,
                tp.Nombre AS Metodo_Pago_Nombre
            FROM Ventas v
            INNER JOIN Pedido p ON v.ID_Pedido = p.ID_Pedido
            LEFT JOIN Cliente c ON p.ID_Cliente = c.ID_Cliente
            LEFT JOIN Tipo_Venta tv ON v.ID_Tipo_Venta = tv.ID_Tipo_Venta
            LEFT JOIN Origen_Venta ov ON v.ID_Origen_Venta = ov.ID_Origen_Venta
            LEFT JOIN Tipo_Pago tp ON v.ID_Tipo_Pago = tp.ID_Tipo_Pago
            ORDER BY v.ID_Venta DESC
        `;
    const result = await pool.request().query(sqlQuery);
    return res.status(200).json(result.recordset);
  } catch (err) {
    console.error("getVentas error:", err);
    return res.status(500).json({ error: "Error al obtener las ventas" });
  }
};

// ==============================
// 🔹 Obtener venta por ID
// ==============================
exports.getVentaById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM Ventas WHERE ID_Venta = @id");
    if (!result.recordset.length)
      return res.status(404).json({ error: "Venta no encontrada" });
    return res.status(200).json(mapToVenta(result.recordset[0]));
  } catch (err) {
    return res.status(500).json({ error: "Error al obtener la venta" });
  }
};

// ==============================
// 🔹 Crear venta
// ==============================
exports.createVenta = async (req, res) => {
  const {
    ID_Pedido,
    ID_Tipo_Venta,
    ID_Origen_Venta,
    ID_Tipo_Pago,
    Monto_Recibido,
  } = req.body;

  if (!ID_Pedido || !ID_Tipo_Venta || !ID_Origen_Venta || !ID_Tipo_Pago) {
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }

  const pool = await getConnection();
  const transaction = new sql.Transaction(pool);

  try {
    // Mapeamos el nombre del método de pago de forma dinámica para el texto
    const metodoPagoTexto =
      ID_Tipo_Pago === 2
        ? "yape"
        : ID_Tipo_Pago === 3
          ? "plin"
          : "transferencia";

    // Preparamos la data estructurada para construir el mensaje de la pizza
    const pedidoDataSimulada = {
      id_pedido: ID_Pedido,
      monto: Monto_Recibido || "0.00",
      metodo_pago: metodoPagoTexto,
    };

    // Número de prueba destino fijo
    const numeroDestino = "51902997968";

    // A. Envía el mensaje interactivo con los botones "SI" y "NO"
    await enviarMensajePedido(numeroDestino, pedidoDataSimulada);

    // B. Pausa la ejecución aquí y espera los 20 segundos de la probabilidad (70/30)
    const esExitoso = await iniciarTemporizadorRespuesta(pedidoDataSimulada);

    // C. Si la simulación da falso (30%), frena el flujo y no altera la BD
    // C. Si la simulación da falso (30%), frena el flujo y cancela el pedido huérfano
    if (!esExitoso) {
      try {
        await pool
          .request()
          .input("ID_Pedido", sql.Int, ID_Pedido)
          .input("Estado_P", sql.Char(1), "C")
          .query(
            "UPDATE Pedido SET Estado_P = @Estado_P WHERE ID_Pedido = @ID_Pedido",
          );
        console.log(
          `Pedido #${ID_Pedido} cancelado automáticamente por fallo en validación de WhatsApp (simulación)`,
        );
      } catch (cancelErr) {
        console.error("No se pudo cancelar el pedido huérfano:", cancelErr);
      }

      return res.status(400).json({
        error: "Error: La transferencia no pudo ser validada. Venta cancelada.",
      });
    }

    // =========================================================================
    // SI ES EXITOSO (70%), SE CONTINÚA CON EL PROCESO ORIGINAL DE BASE DE DATOS
    // =========================================================================

    await transaction.begin();

    // 1. Calcular montos
    const montos = await calcularMontos(transaction, ID_Pedido);
    const montoRecibidoNum = Monto_Recibido ? Number(Monto_Recibido) : 0;
    const vuelto =
      montoRecibidoNum > 0
        ? Math.max(0, montoRecibidoNum - montos.totalFinal)
        : 0;

    // 2. Insertar la venta
    const insertRes = await new sql.Request(transaction)
      .input("ID_Pedido", sql.Int, ID_Pedido)
      .input("ID_Tipo_Venta", sql.Int, ID_Tipo_Venta)
      .input("ID_Origen_Venta", sql.Int, ID_Origen_Venta)
      .input("ID_Tipo_Pago", sql.Int, ID_Tipo_Pago)
      .input("IGV", sql.Decimal(10, 2), montos.igvMonto)
      .input("Total", sql.Decimal(10, 2), montos.totalFinal)
      .input("Monto_Recibido", sql.Decimal(10, 2), montoRecibidoNum)
      .input("Vuelto", sql.Decimal(10, 2), vuelto).query(`
                INSERT INTO Ventas (ID_Pedido, ID_Tipo_Venta, ID_Origen_Venta, ID_Tipo_Pago, IGV, Total, Monto_Recibido, Vuelto)
                OUTPUT INSERTED.ID_Venta
                VALUES (@ID_Pedido, @ID_Tipo_Venta, @ID_Origen_Venta, @ID_Tipo_Pago, @IGV, @Total, @Monto_Recibido, @Vuelto)
            `);

    const nuevoID_Venta = insertRes.recordset[0].ID_Venta;

    // 3. Actualizar el cupón si se aplicó un descuento por primera vez
    if (montos.cuponAplicado && montos.cuponAplicado.Descuento_Aplic === 0) {
      await new sql.Request(transaction)
        .input("ID_Uso_C", sql.Int, montos.cuponAplicado.ID_Uso_C)
        .input("Descuento_Aplic", sql.Decimal(10, 2), montos.descuentoMonto)
        .query(
          "UPDATE Uso_Cupon SET Descuento_Aplic=@Descuento_Aplic WHERE ID_Uso_C=@ID_Uso_C",
        );
    }

    // 4. Lógica de Puntos de Fidelidad (si el cliente no es el ID 1 "Clientes Varios")
    let puntosGanados = 0;
    const pedidoInfo = await new sql.Request(transaction)
      .input("ID_Pedido", sql.Int, ID_Pedido)
      .query("SELECT ID_Cliente FROM Pedido WHERE ID_Pedido = @ID_Pedido");

    const idCliente = pedidoInfo.recordset[0]?.ID_Cliente;
    // La suma solo ocurre si ID_Cliente es mayor que 1 (excluye el genérico)
    if (idCliente > 1) {
      puntosGanados = await sumarPuntosCliente(
        transaction,
        idCliente,
        montos.totalFinal,
      );
    }

    await transaction.commit();

    res.status(201).json({
      message: "Venta registrada correctamente",
      ID_Venta: nuevoID_Venta,
      Total: montos.totalFinal,
      Puntos_Ganados: puntosGanados,
      Vuelto: vuelto,
    });
  } catch (err) {
    if (transaction.isOpen) await transaction.rollback();
    console.error("createVenta error:", err);

    // 🔹 NUEVO: Cancelar automáticamente el pedido huérfano
    try {
      await pool
        .request()
        .input("ID_Pedido", sql.Int, ID_Pedido)
        .input("Estado_P", sql.Char(1), "C")
        .query(
          "UPDATE Pedido SET Estado_P = @Estado_P WHERE ID_Pedido = @ID_Pedido",
        );
      console.log(
        `Pedido #${ID_Pedido} cancelado automáticamente por fallo al registrar la venta`,
      );
    } catch (cancelErr) {
      console.error("No se pudo cancelar el pedido huérfano:", cancelErr);
    }

    res.status(500).json({ error: "Error al registrar venta" });
  }
};

// ==============================
// 🔹 Actualizar venta
// ==============================
exports.updateVenta = async (req, res) => {
  const { id } = req.params;
  const { Monto_Recibido, Vuelto } = req.body;
  try {
    const pool = await getConnection();
    const result = await pool
      .request()
      .input("ID_Venta", sql.Int, id)
      .input("Monto_Recibido", sql.Decimal(10, 2), Monto_Recibido || 0)
      .input("Vuelto", sql.Decimal(10, 2), Vuelto || 0)
      .query(
        `UPDATE Ventas SET Monto_Recibido = @Monto_Recibido, Vuelto = @Vuelto WHERE ID_Venta = @ID_Venta`,
      );

    if (result.rowsAffected[0] === 0)
      return res.status(404).json({ error: "Venta no encontrada" });
    res.status(200).json({ message: "Venta actualizada" });
  } catch (err) {
    res.status(500).json({ error: "Error al actualizar" });
  }
};

// ==============================
// 🔹 Datos de Boleta
// ==============================
exports.datosBoletaVenta = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getConnection();

    // Consulta de la venta con datos de cliente, tipo de comprobante y pago
    const ventaRes = await pool.request().input("id", sql.Int, id).query(`
            SELECT v.*, p.SubTotal AS Pedido_SubTotal, p.Notas, 
                   c.Nombre as Cliente_Nombre, c.Numero_Documento,
                   tv.Nombre as Tipo_Comprobante, tp.Nombre as Forma_Pago
            FROM Ventas v
            INNER JOIN Pedido p ON v.ID_Pedido = p.ID_Pedido
            INNER JOIN Cliente c ON p.ID_Cliente = c.ID_Cliente
            INNER JOIN Tipo_Venta tv ON v.ID_Tipo_Venta = tv.ID_Tipo_Venta
            INNER JOIN Tipo_Pago tp ON v.ID_Tipo_Pago = tp.ID_Tipo_Pago
            WHERE v.ID_Venta = @id
        `);

    if (!ventaRes.recordset.length)
      return res.status(404).json({ error: "Venta no encontrada" });
    const venta = ventaRes.recordset[0];

    // Obtener detalles del pedido (productos/combos)
    const detallesRes = await pool
      .request()
      .input("ID_Pedido", sql.Int, venta.ID_Pedido).query(`
            SELECT pd.Cantidad, pd.PrecioTotal, pd.Notas,
                   ISNULL(pr.Nombre, cm.Nombre) as Item_Nombre,
                   t.Tamano as Tamano_Nombre,
                   CASE WHEN pd.ID_Combo IS NOT NULL THEN 'Combo' ELSE 'Producto' END as Tipo
            FROM Pedido_Detalle pd
            LEFT JOIN Producto_Tamano pt ON pd.ID_Producto_T = pt.ID_Producto_T
            LEFT JOIN Producto pr ON pt.ID_Producto = pr.ID_Producto
            LEFT JOIN Tamano t ON pt.ID_Tamano = t.ID_Tamano
            LEFT JOIN Combos cm ON pd.ID_Combo = cm.ID_Combo
            WHERE pd.ID_Pedido = @ID_Pedido
        `);

    res.status(200).json({
      venta: venta,
      detalles: detallesRes.recordset,
    });
  } catch (err) {
    console.error("datosBoletaVenta error:", err);
    res.status(500).json({ error: "Error obteniendo datos de boleta" });
  }
};

// ==============================
// 🔹 Detalles de Venta (Estructurado)
// ==============================
exports.detallesVenta = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getConnection();

    const sqlQuery = `
            SELECT
                v.ID_Venta, v.ID_Pedido, v.Fecha_Registro,
                tv.Nombre as Tipo_Venta, tp.Nombre as Metodo_Pago, ov.Nombre as Lugar_Emision,
                v.IGV, v.Total, v.Monto_Recibido, v.Vuelto,
                p.ID_Cliente, p.ID_Usuario, p.SubTotal, p.Notas,
                
                pd.ID_Pedido_D, pd.ID_Producto_T, pd.ID_Combo, pd.Cantidad, pd.PrecioTotal,
                
                c.Nombre AS Nombre_Cliente, c.Numero_Documento,
                u.Perfil AS Perfil_Usuario,
                
                CASE WHEN pd.ID_Combo IS NOT NULL THEN cm.Nombre ELSE pr.Nombre END AS Nombre_Producto,
                CASE WHEN pd.ID_Combo IS NOT NULL THEN 'Combo' ELSE t.Tamano END AS Tamano_Nombre
            FROM Ventas v
            JOIN Pedido p ON v.ID_Pedido = p.ID_Pedido
            JOIN Pedido_Detalle pd ON p.ID_Pedido = pd.ID_Pedido
            JOIN Cliente c ON p.ID_Cliente = c.ID_Cliente
            JOIN Usuario u ON p.ID_Usuario = u.ID_Usuario
            JOIN Tipo_Venta tv ON v.ID_Tipo_Venta = tv.ID_Tipo_Venta
            JOIN Tipo_Pago tp ON v.ID_Tipo_Pago = tp.ID_Tipo_Pago
            JOIN Origen_Venta ov ON v.ID_Origen_Venta = ov.ID_Origen_Venta
            LEFT JOIN Producto_Tamano pt ON pd.ID_Producto_T = pt.ID_Producto_T
            LEFT JOIN Producto pr ON pt.ID_Producto = pr.ID_Producto
            LEFT JOIN Tamano t ON pt.ID_Tamano = t.ID_Tamano
            LEFT JOIN Combos cm ON pd.ID_Combo = cm.ID_Combo
            WHERE v.ID_Venta = @id
        `;

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .query(sqlQuery);

    if (!result.recordset.length)
      return res.status(404).json({ error: "Venta no encontrada" });

    // Agrupar información principal de la venta
    const row = result.recordset[0];
    const venta = {
      ID_Venta: row.ID_Venta,
      ID_Pedido: row.ID_Pedido,
      Tipo_Venta: row.Tipo_Venta,
      Metodo_Pago: row.Metodo_Pago,
      Lugar_Emision: row.Lugar_Emision,
      Total: row.Total,
      Fecha: row.Fecha_Registro,
      Cliente: row.Nombre_Cliente,
      DNI: row.Numero_Documento,
      SubTotal_Pedido: row.SubTotal,
      Notas_Pedido: row.Notas,
    };

    // Mapear detalles
    const detalles = result.recordset.map((r) => ({
      Producto: r.Nombre_Producto,
      Tamano: r.Tamano_Nombre,
      Cantidad: r.Cantidad,
      Precio: r.PrecioTotal, // Precio total por línea de detalle
    }));

    res.status(200).json({ venta, detalles });
  } catch (err) {
    res.status(500).json({ error: "Error al obtener detalles" });
  }
};

// ==============================
// 🔹 Ventas de Hoy
// ==============================
exports.getVentasHoy = async (_req, res) => {
  try {
    const pool = await getConnection();
    // La consulta agrupa los detalles de los productos/combos en una sola columna 'Detalles'
    const sqlQuery = `
            SELECT 
                v.ID_Venta, v.Total, v.Fecha_Registro,
                c.Nombre AS Cliente_Nombre,
                tv.Nombre AS Tipo_Venta,
                tp.Nombre AS Metodo_Pago,
                STRING_AGG(ISNULL(pr.Nombre, cm.Nombre) + ' x ' + CAST(pd.Cantidad AS VARCHAR), ', ') 
                WITHIN GROUP (ORDER BY pd.ID_Pedido_D) AS Detalles
            FROM Ventas v
            JOIN Pedido p ON v.ID_Pedido = p.ID_Pedido
            JOIN Cliente c ON p.ID_Cliente = c.ID_Cliente
            JOIN Tipo_Venta tv ON v.ID_Tipo_Venta = tv.ID_Tipo_Venta
            JOIN Tipo_Pago tp ON v.ID_Tipo_Pago = tp.ID_Tipo_Pago
            JOIN Pedido_Detalle pd ON p.ID_Pedido = pd.ID_Pedido
            LEFT JOIN Producto_Tamano pt ON pd.ID_Producto_T = pt.ID_Producto_T
            LEFT JOIN Producto pr ON pt.ID_Producto = pr.ID_Producto
            LEFT JOIN Combos cm ON pd.ID_Combo = cm.ID_Combo
            WHERE CAST(v.Fecha_Registro AS DATE) = CAST(GETDATE() AS DATE)
            GROUP BY v.ID_Venta, v.Total, v.Fecha_Registro, c.Nombre, tv.Nombre, tp.Nombre
            ORDER BY v.Fecha_Registro DESC
        `;

    const result = await pool.request().query(sqlQuery);

    // Calcular totales rápidos
    const totalVentas = result.recordset.length;
    const ingresos = result.recordset.reduce((sum, v) => sum + v.Total, 0);

    res.status(200).json({
      resumen: { totalVentas, ingresos },
      ventas: result.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: "Error obteniendo ventas de hoy" });
  }
};

// ==============================
// 🔹 Ventas Por Periodo
// ==============================
exports.getVentasPorPeriodo = async (req, res) => {
  try {
    const { periodo, fecha } = req.query; // dia, semana, mes + fecha de referencia opcional
    const pool = await getConnection();
    const request = pool.request();
    let filter = "";

    // Si mandan una fecha de referencia, la usamos como parámetro.
    // Si no, usamos la fecha/hora actual del servidor (GETDATE()).
    const fechaRefExpr = fecha ? "@fechaRef" : "GETDATE()";
    if (fecha) {
      request.input("fechaRef", sql.Date, fecha);
    }

    if (periodo === "dia")
      filter = `CAST(v.Fecha_Registro AS DATE) = CAST(${fechaRefExpr} AS DATE)`;
    else if (periodo === "semana")
      filter = `DATEPART(ISO_WEEK, v.Fecha_Registro) = DATEPART(ISO_WEEK, ${fechaRefExpr}) AND YEAR(v.Fecha_Registro) = YEAR(${fechaRefExpr})`;
    else if (periodo === "mes")
      filter = `MONTH(v.Fecha_Registro) = MONTH(${fechaRefExpr}) AND YEAR(v.Fecha_Registro) = YEAR(${fechaRefExpr})`;
    else return res.status(400).json({ error: "Periodo inválido" });

    const result = await request.query(`
            SELECT v.*, c.Nombre as Cliente FROM Ventas v
            JOIN Pedido p ON v.ID_Pedido = p.ID_Pedido
            JOIN Cliente c ON p.ID_Cliente = c.ID_Cliente
            WHERE ${filter}
            ORDER BY v.Fecha_Registro DESC
        `);

    res.status(200).json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: "Error al filtrar ventas" });
  }
};

// ==============================
// 🔹 Estadísticas
// ==============================
exports.getEstadisticasVentas = async (req, res) => {
  try {
    const pool = await getConnection();

    // 1. Totales Hoy
    const hoy = await pool.request().query(`
            SELECT COUNT(*) as total, ISNULL(SUM(Total),0) as ingresos 
            FROM Ventas WHERE CAST(Fecha_Registro AS DATE) = CAST(GETDATE() AS DATE)
        `);

    // 2. Totales Mes
    const mes = await pool.request().query(`
            SELECT COUNT(*) as total, ISNULL(SUM(Total),0) as ingresos 
            FROM Ventas WHERE MONTH(Fecha_Registro) = MONTH(GETDATE()) AND YEAR(Fecha_Registro) = YEAR(GETDATE())
        `);

    // 3. Métodos de Pago (Usando la tabla normalizada Tipo_Pago)
    const metodos = await pool.request().query(`
            SELECT tp.Nombre as Metodo, COUNT(*) as Cantidad, SUM(v.Total) as Total
            FROM Ventas v
            JOIN Tipo_Pago tp ON v.ID_Tipo_Pago = tp.ID_Tipo_Pago
            GROUP BY tp.Nombre
        `);

    res.status(200).json({
      hoy: hoy.recordset[0],
      mes: mes.recordset[0],
      metodos_pago: metodos.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: "Error en estadísticas" });
  }
};
