-- ===========================================
-- 1. CATEGORIA PRODUCTO
-- ===========================================
CREATE TABLE Categoria_Producto (
    ID_Categoria_P INT IDENTITY(1,1) PRIMARY KEY,
    Nombre VARCHAR(100) NOT NULL
);

-- ===========================================
-- 2. CATEGORIA INSUMOS
-- ===========================================
CREATE TABLE Categoria_Insumos (
    ID_Categoria_I INT IDENTITY(1,1) PRIMARY KEY,
    Nombre VARCHAR(100) NOT NULL
);

-- ===========================================
-- 3. TIPO DE DOCUMENTO
-- ===========================================
CREATE TABLE Tipo_Documento (
    ID_Tipo_Doc INT IDENTITY(1,1) PRIMARY KEY,
    Nombre VARCHAR(50) NOT NULL,  -- Ej: DNI, RUC, Pasaporte
    Abreviatura VARCHAR(10)       -- Ej: DNI, RUC
);

-- ===========================================
-- 4. TIPO DE VENTA
-- ===========================================
CREATE TABLE Tipo_Venta (
    ID_Tipo_Venta INT IDENTITY(1,1) PRIMARY KEY,
    Nombre VARCHAR(50) NOT NULL   -- Ej: Boleta, Factura, Nota de Venta
);

-- ===========================================
-- 5. ORIGEN DE VENTA
-- ===========================================
CREATE TABLE Origen_Venta (
    ID_Origen_Venta INT IDENTITY(1,1) PRIMARY KEY,
    Nombre VARCHAR(50) NOT NULL   -- Ej: Mostrador, Delivery, Web
);

-- ===========================================
-- 6. TIPO DE PAGO (NUEVA TABLA)
-- ===========================================
CREATE TABLE Tipo_Pago (
    ID_Tipo_Pago INT IDENTITY(1,1) PRIMARY KEY,
    Nombre VARCHAR(50) NOT NULL   -- Ej: Efectivo, Tarjeta, Yape/Plin
);

-- ===========================================
-- 7. PROVEEDOR
-- ===========================================
CREATE TABLE Proveedor (
    ID_Proveedor INT IDENTITY(1,1) PRIMARY KEY,
    Nombre VARCHAR(150),
    Ruc VARCHAR(20),
    Direccion VARCHAR(200),
    Telefono VARCHAR(20),
    Email VARCHAR(100),
    Persona_Contacto VARCHAR(100),
    Estado CHAR(1) DEFAULT 'A' CHECK (Estado IN ('A','I')),
    Fecha_Registro DATE DEFAULT GETDATE()
);

-- ===========================================
-- 8. INSUMOS
-- ===========================================
CREATE TABLE Insumos (
    ID_Insumo INT IDENTITY(1,1) PRIMARY KEY,
    Nombre VARCHAR(100),
    Descripcion TEXT,
    Unidad_Med VARCHAR(50),
    ID_Categoria_I INT NOT NULL,
    Stock_Min INT DEFAULT 0,
    Stock_Max INT DEFAULT 1000,
    Estado CHAR(1) DEFAULT 'D' CHECK (Estado IN ('D','A')),
    Fecha_Registro DATE DEFAULT GETDATE(),
    FOREIGN KEY (ID_Categoria_I) REFERENCES Categoria_Insumos(ID_Categoria_I)
);

-- ===========================================
-- 9. RECETA
-- ===========================================
CREATE TABLE Receta (
    ID_Receta INT IDENTITY(1,1) PRIMARY KEY,
    Nombre VARCHAR(100),
    Descripcion TEXT,
    Tiempo_Preparacion TIME
);

-- ===========================================
-- 10. RECETA DETALLE
-- ===========================================
CREATE TABLE Receta_Detalle (
    ID_Receta_D INT IDENTITY(1,1) PRIMARY KEY,
    ID_Receta INT NOT NULL,
    ID_Insumo INT NOT NULL,
    Cantidad INT DEFAULT 0,
    Uso TEXT,
    FOREIGN KEY (ID_Receta) REFERENCES Receta(ID_Receta),
    FOREIGN KEY (ID_Insumo) REFERENCES Insumos(ID_Insumo)
);

-- ===========================================
-- 11. PRODUCTO 
-- ===========================================
CREATE TABLE Producto (
    ID_Producto INT IDENTITY(1,1) PRIMARY KEY,
    Nombre VARCHAR(100),
    Descripcion TEXT,
    ID_Categoria_P INT NOT NULL,
    ID_Receta INT NULL,
    Cantidad_Disponible INT DEFAULT 0,
    Estado CHAR(1) DEFAULT 'A' CHECK (Estado IN ('A','I','G')),
    Fecha_Registro DATE DEFAULT GETDATE(),
    FOREIGN KEY (ID_Categoria_P) REFERENCES Categoria_Producto(ID_Categoria_P),
    FOREIGN KEY (ID_Receta) REFERENCES Receta(ID_Receta)
);

-- ===========================================
-- 12. TAMAÑO
-- ===========================================
CREATE TABLE Tamano (
    ID_Tamano INT IDENTITY(1,1) PRIMARY KEY,
    Tamano VARCHAR(50)
);

-- ===========================================
-- 13. PRODUCTO_TAMANO
-- ===========================================
CREATE TABLE Producto_Tamano (
    ID_Producto_T INT IDENTITY(1,1) PRIMARY KEY,
    ID_Producto INT NOT NULL,
    ID_Tamano INT NOT NULL,
    Precio DECIMAL(10,2) NOT NULL DEFAULT 0,
    Estado CHAR(1) DEFAULT 'A' CHECK (Estado IN ('A','I')),
    Fecha_Registro DATE DEFAULT GETDATE(),
    FOREIGN KEY (ID_Producto) REFERENCES Producto(ID_Producto),
    FOREIGN KEY (ID_Tamano) REFERENCES Tamano(ID_Tamano),
    CONSTRAINT UQ_Producto_Tamano UNIQUE (ID_Producto, ID_Tamano)
);

-- ===========================================
-- 14. STOCK
-- ===========================================
CREATE TABLE Stock (
    ID_Stock INT IDENTITY(1,1) PRIMARY KEY,
    ID_Insumo INT NOT NULL,
    ID_Proveedor INT NULL,
    Cantidad_Recibida INT DEFAULT 0,
    Costo_Unitario DECIMAL(10,2) DEFAULT 0,
    Costo_Total DECIMAL(10,2) DEFAULT 0,
    Fecha_Entrada DATE DEFAULT GETDATE(),
    Fecha_Vencimiento DATE,
    Estado CHAR(1) DEFAULT 'A' CHECK (Estado IN ('A','I','C')),
    FOREIGN KEY (ID_Insumo) REFERENCES Insumos(ID_Insumo),
    FOREIGN KEY (ID_Proveedor) REFERENCES Proveedor(ID_Proveedor)
);

-- ===========================================
-- 15. STOCK MOVIMIENTO
-- ===========================================
CREATE TABLE Stock_Movimiento (
    ID_Stock_M INT IDENTITY(1,1) PRIMARY KEY,
    ID_Stock INT NOT NULL,
    Tipo_Mov VARCHAR(50) DEFAULT 'Entrada' CHECK (Tipo_Mov IN ('Entrada','Salida','Ajuste')),
    Motivo VARCHAR(100),
    Cantidad INT DEFAULT 0,
    Stock_ACT INT DEFAULT 0,
    Usuario_ID INT,
    Fecha_Mov DATE DEFAULT GETDATE(),
    FOREIGN KEY (ID_Stock) REFERENCES Stock(ID_Stock)
);

-- ===========================================
-- 16. CUPONES
-- ===========================================
CREATE TABLE Cupones (
    ID_Cupon INT IDENTITY(1,1) PRIMARY KEY,
    Cod_Cupon VARCHAR(50),
    Descripcion TEXT,
    Tipo_Desc VARCHAR(50) DEFAULT 'Porcentaje' CHECK (Tipo_Desc IN ('Porcentaje','Monto')),
    Valor_Desc DECIMAL(10,2) DEFAULT 0,
    Monto_Max DECIMAL(10,2) DEFAULT 0,
    Usos_Max INT DEFAULT 1,
    Usos_Act INT DEFAULT 0,
    Fecha_INC DATE DEFAULT GETDATE(),
    Fecha_FIN DATE,
    Estado CHAR(1) DEFAULT 'A' CHECK (Estado IN ('A','I')),
    Fecha_Registro DATE DEFAULT GETDATE()
);

-- ===========================================
-- 17. CLIENTE
-- ===========================================
CREATE TABLE Cliente (
    ID_Cliente INT IDENTITY(1,1) PRIMARY KEY,
    ID_Tipo_Doc INT NULL,                     
    Numero_Documento VARCHAR(20),             
    Nombre VARCHAR(100),
    Apellido VARCHAR(100),
    Telefono VARCHAR(20),
    Fecha_Registro DATE DEFAULT GETDATE(),
    FOREIGN KEY (ID_Tipo_Doc) REFERENCES Tipo_Documento(ID_Tipo_Doc)
);

-- ===========================================
-- 18. CLIENTE PUNTOS (NUEVA TABLA)
-- ===========================================
CREATE TABLE Cliente_Puntos (
    ID_Puntos INT IDENTITY(1,1) PRIMARY KEY,
    ID_Cliente INT NOT NULL UNIQUE,
    Puntos_Acumulados INT DEFAULT 0,
    Fecha_Actualizacion DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (ID_Cliente) REFERENCES Cliente(ID_Cliente)
);

-- ===========================================
-- 19. USUARIO
-- ===========================================
CREATE TABLE Usuario (
    ID_Usuario INT IDENTITY(1,1) PRIMARY KEY,
    Perfil VARCHAR(50),
    Correo VARCHAR(100),
    Password VARCHAR(100),
    Roll CHAR(1) DEFAULT 'E' CHECK (Roll IN ('A','E')),
    Estado CHAR(1) DEFAULT 'A' CHECK (Estado IN ('A','I')),
    Fecha_Registro DATE DEFAULT GETDATE()
);

-- ===========================================
-- 20. PEDIDO
-- ===========================================
CREATE TABLE Pedido (
    ID_Pedido INT IDENTITY(1,1) PRIMARY KEY,
    ID_Cliente INT NOT NULL,
    ID_Usuario INT NULL,
    Notas TEXT,
    SubTotal DECIMAL(10,2) DEFAULT 0,
    Estado_P CHAR(1) DEFAULT 'P' CHECK (Estado_P IN ('P','C','E')),
    Fecha_Registro DATE DEFAULT GETDATE(),
    Hora_Pedido TIME,
    FOREIGN KEY (ID_Cliente) REFERENCES Cliente(ID_Cliente),
    FOREIGN KEY (ID_Usuario) REFERENCES Usuario(ID_Usuario)
);

-- ===========================================
-- 21. COMBOS
-- ===========================================
CREATE TABLE Combos (
    ID_Combo INT IDENTITY(1,1) PRIMARY KEY,
    Nombre VARCHAR(100),
    Descripcion TEXT,
    Precio DECIMAL(10,2) DEFAULT 0,
    Estado CHAR(1) DEFAULT 'A' CHECK (Estado IN ('A','I'))
);

-- ===========================================
-- 22. COMBOS DETALLE 
-- ===========================================
CREATE TABLE Combos_Detalle (
    ID_Combo_D INT IDENTITY(1,1) PRIMARY KEY,
    ID_Combo INT NOT NULL,
    ID_Producto_T INT NOT NULL,
    Cantidad INT DEFAULT 1,
    FOREIGN KEY (ID_Combo) REFERENCES Combos(ID_Combo),
    FOREIGN KEY (ID_Producto_T) REFERENCES Producto_Tamano(ID_Producto_T)
);

-- ===========================================
-- 23. PEDIDO DETALLE 
-- ===========================================
CREATE TABLE Pedido_Detalle (
    ID_Pedido_D INT IDENTITY(1,1) PRIMARY KEY,
    ID_Pedido INT NOT NULL,
    ID_Producto_T INT NULL,
    ID_Combo INT NULL,
    Cantidad INT DEFAULT 1,
    PrecioTotal DECIMAL(10,2) DEFAULT 0,
    FOREIGN KEY (ID_Pedido) REFERENCES Pedido(ID_Pedido),
    FOREIGN KEY (ID_Combo) REFERENCES Combos(ID_Combo),
    FOREIGN KEY (ID_Producto_T) REFERENCES Producto_Tamano(ID_Producto_T)
);

-- ===========================================
-- 24. USO CUPON
-- ===========================================
CREATE TABLE Uso_Cupon (
    ID_Uso_C INT IDENTITY(1,1) PRIMARY KEY,
    ID_Cupon INT NOT NULL,
    ID_Pedido INT NOT NULL,
    Descuento_Aplic DECIMAL(10,2) DEFAULT 0,
    Monto_Venta DECIMAL(10,2) DEFAULT 0,
    Fecha_Uso DATE DEFAULT GETDATE(),
    FOREIGN KEY (ID_Cupon) REFERENCES Cupones(ID_Cupon),
    FOREIGN KEY (ID_Pedido) REFERENCES Pedido(ID_Pedido)
);

-- ===========================================
-- 25. VENTAS (MODIFICADO POR TIPO PAGO)
-- ===========================================
CREATE TABLE Ventas (
    ID_Venta INT IDENTITY(1,1) PRIMARY KEY,
    ID_Pedido INT NOT NULL,
    
    -- Referencias normalizadas
    ID_Tipo_Venta INT NOT NULL, 
    ID_Origen_Venta INT NOT NULL, 
    
    -- NUEVA REFERENCIA: TIPO DE PAGO
    ID_Tipo_Pago INT NOT NULL,
    
    IGV DECIMAL(10,2) DEFAULT 0,
    Total DECIMAL(10,2) DEFAULT 0,
    Monto_Recibido DECIMAL(10,2) DEFAULT 0,
    Vuelto DECIMAL(10,2) DEFAULT 0,
    Fecha_Registro DATE DEFAULT GETDATE(),
    
    FOREIGN KEY (ID_Pedido) REFERENCES Pedido(ID_Pedido),
    FOREIGN KEY (ID_Tipo_Venta) REFERENCES Tipo_Venta(ID_Tipo_Venta),
    FOREIGN KEY (ID_Origen_Venta) REFERENCES Origen_Venta(ID_Origen_Venta),
    FOREIGN KEY (ID_Tipo_Pago) REFERENCES Tipo_Pago(ID_Tipo_Pago) -- Nueva FK
);

-- ===========================================
-- 26. DELIVERY
-- ===========================================
CREATE TABLE Delivery (
    ID_Delivery INT IDENTITY(1,1) PRIMARY KEY,
    ID_Pedido INT NOT NULL,
    Direccion TEXT,
    Estado_D CHAR(1) DEFAULT 'P' CHECK (Estado_D IN ('E','P','C')),
    FOREIGN KEY (ID_Pedido) REFERENCES Pedido(ID_Pedido)
);
