const { sql, getConnection } = require("./config/Connection");

// =========================================================
// 1. 🔧 FUNCIÓN: Inicializar Tipos de Venta
// =========================================================
async function asegurarTiposVenta() {
  const tipos = ["Boleta", "Factura", "Nota de Venta"];
  
  try {
    const pool = await getConnection();
    for (const tipo of tipos) {
      const check = await pool.request()
        .input("Nombre", sql.VarChar(50), tipo)
        .query("SELECT ID_Tipo_Venta FROM Tipo_Venta WHERE Nombre = @Nombre");

      if (check.recordset.length === 0) {
        await pool.request()
          .input("Nombre", sql.VarChar(50), tipo)
          .query("INSERT INTO Tipo_Venta (Nombre) VALUES (@Nombre)");
        console.log(`✅ Tipo de Venta creado: ${tipo}`);
      }
    }
    console.log("🏁 Verificación de Tipos de Venta completada.");
  } catch (error) {
    console.error("❌ Error inicializando Tipos de Venta:", error.message);
  }
}

// =========================================================
// 2. 🔧 FUNCIÓN: Inicializar Origen de Venta
// =========================================================
async function asegurarOrigenVenta() {
  const origenes = ["Mostrador", "Aplicativo Movil", "Kiosko"];
  try {
    const pool = await getConnection();
    for (const origen of origenes) {
      const check = await pool.request()
        .input("Nombre", sql.VarChar(50), origen)
        .query("SELECT ID_Origen_Venta FROM Origen_Venta WHERE Nombre = @Nombre");

      if (check.recordset.length === 0) {
        await pool.request()
          .input("Nombre", sql.VarChar(50), origen)
          .query("INSERT INTO Origen_Venta (Nombre) VALUES (@Nombre)");
        console.log(`✅ Origen de Venta creado: ${origen}`);
      }
    }
    console.log("🏁 Verificación de Orígenes de Venta completada.");
  } catch (error) {
    console.error("❌ Error inicializando Orígenes de Venta:", error.message);
  }
}

// =========================================================
// 3. 🔧 FUNCIÓN: Inicializar Tipos de Documento
// =========================================================
async function asegurarTiposDocumento() {
  const documentos = [
    { nombre: "Documento Nacional de Identidad", abrev: "DNI" },
    { nombre: "Registro Unico de Contribuyentes", abrev: "RUC" }
  ];
  try {
    const pool = await getConnection();
    for (const doc of documentos) {
      const check = await pool.request()
        .input("Abreviatura", sql.VarChar(10), doc.abrev)
        .query("SELECT ID_Tipo_Doc FROM Tipo_Documento WHERE Abreviatura = @Abreviatura");

      if (check.recordset.length === 0) {
        await pool.request()
          .input("Nombre", sql.VarChar(50), doc.nombre)
          .input("Abreviatura", sql.VarChar(10), doc.abrev)
          .query("INSERT INTO Tipo_Documento (Nombre, Abreviatura) VALUES (@Nombre, @Abreviatura)");
        console.log(`✅ Tipo de Documento creado: ${doc.abrev}`);
      }
    }
    console.log("🏁 Verificación de Tipos de Documento completada.");
  } catch (error) {
    console.error("❌ Error inicializando Tipos de Documento:", error.message);
  }
}

// =========================================================
// 4. 🔧 FUNCIÓN: Inicializar Tipos de Pago
// =========================================================
async function asegurarTiposPago() {
  const pagos = ["Efectivo", "Billetera Digital", "Tarjeta"];
  try {
    const pool = await getConnection();
    for (const pago of pagos) {
      const check = await pool.request()
        .input("Nombre", sql.VarChar(50), pago)
        .query("SELECT ID_Tipo_Pago FROM Tipo_Pago WHERE Nombre = @Nombre");

      if (check.recordset.length === 0) {
        await pool.request()
          .input("Nombre", sql.VarChar(50), pago)
          .query("INSERT INTO Tipo_Pago (Nombre) VALUES (@Nombre)");
        console.log(`✅ Tipo de Pago creado: ${pago}`);
      }
    }
    console.log("🏁 Verificación de Tipos de Pago completada.");
  } catch (error) {
    console.error("❌ Error inicializando Tipos de Pago:", error.message);
  }
}

// =========================================================
// 5. 🔧 FUNCIÓN: Asegurar Cliente Varios
// =========================================================
async function asegurarClienteVarios() {
  try {
    const pool = await getConnection();
    const checkCliente = await pool.request()
      .input("Nombre", sql.VarChar(100), "Clientes Varios")
      .query("SELECT ID_Cliente, Nombre FROM Cliente WHERE Nombre = @Nombre");

    if (checkCliente.recordset.length > 0) {
      console.log(`✅ Cliente 'Clientes Varios' ya existe con ID: ${checkCliente.recordset[0].ID_Cliente}`);
      return checkCliente.recordset[0].ID_Cliente;
    }

    const result = await pool.request()
      .input("Nombre", sql.VarChar(100), "Clientes Varios")
      .query(`
        INSERT INTO Cliente (Nombre, Apellido, Numero_Documento, Telefono, ID_Tipo_Doc)
        VALUES (@Nombre, NULL, NULL, NULL, NULL);
        SELECT SCOPE_IDENTITY() AS ID_Cliente;
      `);
    
    const clienteId = result.recordset[0].ID_Cliente;
    console.log(`✅ Cliente 'Clientes Varios' creado con ID: ${clienteId}`);
    return clienteId;
  } catch (error) {
    console.error("❌ Error asegurando cliente varios:", error.message);
    return null; 
  }
}

// =========================================================
// 6. 🔧 FUNCIÓN: Inicializar Proveedores
// =========================================================
async function asegurarProveedores() {
  const proveedores = [
    { 
      Nombre: 'Negociaciones y Servicios Silvia Aracely E.I.R.L', 
      Ruc: '20611820349', 
      Direccion: 'Jr. Antonio Maya de Brito Mza. A Lote. 7, Distrito Callería, Provincia Coronel Portillo, Departamento Ucayali, Perú', 
      Telefono: '912345678', 
      Email: 'contacto@dp.com', 
      Persona_Contacto: 'Silvia Aracely' 
    }
  ];

  try {
    const pool = await getConnection();

    for (const prov of proveedores) {
      const check = await pool.request()
        .input("Ruc", sql.VarChar(20), prov.Ruc)
        .query("SELECT ID_Proveedor FROM Proveedor WHERE Ruc = @Ruc");

      if (check.recordset.length === 0) {
        await pool.request()
          .input("Nombre", sql.VarChar(150), prov.Nombre)
          .input("Ruc", sql.VarChar(20), prov.Ruc)
          .input("Direccion", sql.VarChar(200), prov.Direccion)
          .input("Telefono", sql.VarChar(20), prov.Telefono)
          .input("Email", sql.VarChar(100), prov.Email)
          .input("Persona_Contacto", sql.VarChar(100), prov.Persona_Contacto)
          .query(`
             INSERT INTO Proveedor (Nombre, Ruc, Direccion, Telefono, Email, Persona_Contacto) 
             VALUES (@Nombre, @Ruc, @Direccion, @Telefono, @Email, @Persona_Contacto)
          `);
        
        console.log(`✅ Proveedor creado: ${prov.Nombre}`);
      }
    }
    console.log("🏁 Verificación de Proveedores completada.");

  } catch (error) {
    console.error("❌ Error inicializando Proveedores:", error.message);
  }
}

// =========================================================
// 7. 🔧 FUNCIÓN: Inicializar Tamaños
// =========================================================
async function asegurarTamanos() {
  // Nota: Ordené el array para que se inserten en orden lógico si la tabla está vacía
  const tamanos = ["Personal", "Pequeño", "Mediano", "Grande", "Familiar"];

  try {
    const pool = await getConnection();

    for (const t of tamanos) {
      // La columna en la BD se llama 'Tamano'
      const check = await pool.request()
        .input("Nombre", sql.VarChar(50), t)
        .query("SELECT ID_Tamano FROM Tamano WHERE Tamano = @Nombre");

      if (check.recordset.length === 0) {
        await pool.request()
          .input("Nombre", sql.VarChar(50), t)
          .query("INSERT INTO Tamano (Tamano) VALUES (@Nombre)");
        
        console.log(`✅ Tamaño creado: ${t}`);
      }
    }
    console.log("🏁 Verificación de Tamaños completada.");

  } catch (error) {
    console.error("❌ Error inicializando Tamaños:", error.message);
  }
}

// =========================================================
// 8. FUNCIÓN MAESTRA
// Ejecuta todo de una sola vez
// =========================================================
async function inicializarTodo() {
    console.log("--- INICIANDO CARGA DE DATOS MAESTROS ---");
    
    // 1. Catálogos base
    await asegurarTiposDocumento();
    await asegurarTiposVenta();
    await asegurarOrigenVenta();
    await asegurarTiposPago();
    await asegurarTamanos(); 
    
    // 2. Entidades
    await asegurarClienteVarios();
    await asegurarProveedores(); 

    console.log("--- CARGA DE DATOS COMPLETADA ---");
}

// Exportar las funciones
module.exports = {
  inicializarTodo
};