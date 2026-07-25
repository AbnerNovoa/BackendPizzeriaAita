const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ruta a la carpeta 'uploads' que está al mismo nivel que 'config'
const uploadDir = path.join(__dirname, '..', 'uploads');

// Crear carpeta uploads si no existe
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Configuración del almacenamiento
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// Filtro para solo aceptar imágenes JPG, JPEG, PNG
const fileFilter = (req, file, cb) => {
  const fileTypes = /jpeg|jpg|png/;
  const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
  const mimeType = fileTypes.test(file.mimetype);

  if (extname && mimeType) {
    cb(null, true);
  } else {
    cb(new Error("Solo se permiten archivos JPG, JPEG y PNG"), false);
  }
};

function deleteFileByName(filename) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(uploadDir, filename);

    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
        return reject(`El archivo "${filename}" no existe.`);
      }

      fs.unlink(filePath, (err) => {
        if (err) {
          return reject(`Error al eliminar el archivo "${filename}": ${err.message}`);
        }

        resolve(`Archivo "${filename}" eliminado correctamente.`);
      });
    });
  });
}


// Configuración Multer, máximo 3 archivos en campo 'referencia', pero opcional
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max por archivo
}).array("file", 3);

module.exports = upload, deleteFileByName;
