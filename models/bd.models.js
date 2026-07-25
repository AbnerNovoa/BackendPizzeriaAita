// ===============================
// 1. CATEGORÍA PRODUCTO
// ===============================
const CategoriaProducto = {
  ID_Categoria_P: 0,
  Nombre: ""
};

// ===============================
// 2. CATEGORÍA INSUMOS
// ===============================
const CategoriaInsumos = {
  ID_Categoria_I: 0,
  Nombre: ""
};

// ===============================
// 3. TIPO DE DOCUMENTO 
// ===============================
const TipoDocumento = {
  ID_Tipo_Doc: 0,
  Nombre: "",
  Abreviatura: ""
};

// ===============================
// 4. TIPO DE VENTA 
// ===============================
const TipoVenta = {
  ID_Tipo_Venta: 0,
  Nombre: ""
};

// ===============================
// 5. ORIGEN DE VENTA 
// ===============================
const OrigenVenta = {
  ID_Origen_Venta: 0,
  Nombre: ""
};

// ===============================
// 6. TIPO DE PAGO
// ===============================
const TipoPago = {
  ID_Tipo_Pago: 0,
  Nombre: ""
};

// ===============================
// 7. PROVEEDOR
// ===============================
const Proveedor = {
  ID_Proveedor: 0,
  Nombre: "",
  Ruc: "",
  Direccion: "",
  Telefono: "",
  Email: "",
  Persona_Contacto: "",
  Estado: "A", // A=Activo, I=Inactivo
  Fecha_Registro: ""
};

// ===============================
// 8. INSUMOS
// ===============================
const Insumo = {
  ID_Insumo: 0,
  Nombre: "",
  Descripcion: "",
  Unidad_Med: "",
  ID_Categoria_I: 0,
  Stock_Min: 0,
  Stock_Max: 1000,
  Estado: "D", // D=Disponible, A=Agotado
  Fecha_Registro: ""
};

// ===============================
// 9. RECETA
// ===============================
const Receta = {
  ID_Receta: 0,
  Nombre: "",
  Descripcion: "",
  Tiempo_Preparacion: "" // formato HH:MM:SS
};

// ===============================
// 10. RECETA DETALLE
// ===============================
const RecetaDetalle = {
  ID_Receta_D: 0,
  ID_Receta: 0,
  ID_Insumo: 0,
  Cantidad: 0,
  Uso: ""
};

// ===============================
// 11. PRODUCTO
// ===============================
const Producto = {
  ID_Producto: 0,
  Nombre: "",
  Descripcion: "",
  ID_Categoria_P: 0,
  ID_Receta: null,
  Cantidad_Disponible: 0,
  Estado: "A", // A=Activo, I=Inactivo, G=Agotado
  Fecha_Registro: ""
};

// ===============================
// 12. TAMAÑO
// ===============================
const Tamano = {
  ID_Tamano: 0,
  Tamano: ""
};

// ===============================
// 13. PRODUCTO_TAMANO
// ===============================
const ProductoTamano = {
  ID_Producto_T: 0,
  ID_Producto: 0,
  ID_Tamano: 0,
  Precio: 0.0,
  Estado: "A", // A=Activo, I=Inactivo
  Fecha_Registro: ""
};

// ===============================
// 14. STOCK
// ===============================
const Stock = {
  ID_Stock: 0,
  ID_Insumo: 0,
  ID_Proveedor: null,
  Cantidad_Recibida: 0,
  Costo_Unitario: 0.0,
  Costo_Total: 0.0,
  Fecha_Entrada: "",
  Fecha_Vencimiento: "",
  Estado: "A" // A=Activo, I=Inactivo, C=Caducado
};

// ===============================
// 15. STOCK MOVIMIENTO
// ===============================
const StockMovimiento = {
  ID_Stock_M: 0,
  ID_Stock: 0,
  Tipo_Mov: "Entrada", // Entrada | Salida | Ajuste
  Motivo: null,
  Cantidad: 0,
  Stock_ACT: 0,
  Usuario_ID: null,
  Fecha_Mov: ""
};

// ===============================
// 16. CUPONES
// ===============================
const Cupon = {
  ID_Cupon: 0,
  Cod_Cupon: "",
  Descripcion: "",
  Tipo_Desc: "Porcentaje", // Porcentaje | Monto
  Valor_Desc: 0.0,
  Monto_Max: 0.0,
  Usos_Max: 1,
  Usos_Act: 0,
  Fecha_INC: "",
  Fecha_FIN: "",
  Estado: "A", // A=Activo, I=Inactivo
  Fecha_Registro: ""
};

// ===============================
// 17. CLIENTE (MODIFICADO)
// ===============================
const Cliente = {
  ID_Cliente: 0,
  ID_Tipo_Doc: null,      
  Numero_Documento: "",   
  Nombre: "",
  Apellido: "",
  Telefono: "",
  Fecha_Registro: ""
};

// ===============================
// 18. CLIENTE PUNTOS
// ===============================
const ClientePuntos = {
  ID_Puntos: 0,
  ID_Cliente: 0,
  Puntos_Acumulados: 0,
  Fecha_Actualizacion: ""
};

// ===============================
// 19. USUARIO
// ===============================
const Usuario = {
  ID_Usuario: 0,
  Perfil: "",
  Correo: "",
  Password: "",
  Roll: "E", // A=Admin, E=Empleado
  Estado: "A", // A=Activo, I=Inactivo
  Fecha_Registro: ""
};

// ===============================
// 20. PEDIDO
// ===============================
const Pedido = {
  ID_Pedido: 0,
  ID_Cliente: 0,
  ID_Usuario: null,
  Notas: "",
  SubTotal: 0.0,
  Estado_P: "P", // P=Pendiente, C=Cancelado, E=Entregado
  Fecha_Registro: "",
  Hora_Pedido: ""
};

// ===============================
// 21. COMBOS
// ===============================
const Combo = {
  ID_Combo: 0,
  Nombre: "",
  Descripcion: "",
  Precio: 0.0,
  Estado: "A"
};

// ===============================
// 22. COMBOS DETALLE
// ===============================
const ComboDetalle = {
  ID_Combo_D: 0,
  ID_Combo: 0,
  ID_Producto_T: 0,
  Cantidad: 1
};

// ===============================
// 23. PEDIDO DETALLE
// ===============================
const PedidoDetalle = {
  ID_Pedido_D: 0,
  ID_Pedido: 0,
  ID_Producto_T: 0,
  ID_Combo: 0,
  Cantidad: 1,
  PrecioTotal: 0.0
};

// ===============================
// 24. USO CUPÓN
// ===============================
const UsoCupon = {
  ID_Uso_C: 0,
  ID_Cupon: 0,
  ID_Pedido: 0,
  Descuento_Aplic: 0.0,
  Monto_Venta: 0.0,
  Fecha_Uso: ""
};

// ===============================
// 25. VENTAS (MODIFICADO)
// ===============================
const Venta = {
  ID_Venta: 0,
  ID_Pedido: 0,
  ID_Tipo_Venta: 0,   
  ID_Origen_Venta: 0, 
  ID_Tipo_Pago: 0,    
  IGV: 0.0,
  Total: 0.0,
  Monto_Recibido: 0.0,
  Vuelto: 0.0,
  Fecha_Registro: ""
};

// ===============================
// 26. DELIVERY
// ===============================
const Delivery = {
  ID_Delivery: 0,
  ID_Pedido: 0,
  Direccion: "",
  Estado_D: "P" // E=Entregado, P=Pendiente, C=Cancelado
};

// ===============================
// EXPORTAR MODELOS
// ===============================
module.exports = {
  CategoriaProducto,
  CategoriaInsumos,
  TipoDocumento,  
  TipoVenta,      
  OrigenVenta,    
  TipoPago,       
  Proveedor,
  Insumo,
  Receta,
  RecetaDetalle,
  Producto,
  Tamano,
  ProductoTamano,
  Stock,
  StockMovimiento,
  Cupon,
  Cliente,
  ClientePuntos, 
  Usuario,
  Pedido,
  PedidoDetalle,
  UsoCupon,
  Venta,
  Delivery,
  Combo,
  ComboDetalle
};