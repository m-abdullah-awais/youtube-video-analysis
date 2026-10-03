import type { Locale } from "./locale";

type Params = Record<string, string | number>;
type Message = string | ((p: Params) => string);

const en = {
  fileTooLarge: "This file is over 20 MB. Split it into smaller files.",
  noRows: "This file has no video rows under the header row.",
  tooManyRows: (p: Params) => `This file has ${p.rows} rows. Upload ${p.max} or fewer at a time.`,
  unsupportedFile: "Upload a CSV or Excel file (.csv, .xlsx or .xls).",
  unreadableFile: "This file could not be read. Check that it is a valid CSV or Excel file.",
  sheetNotFound: (p: Params) => `The sheet "${p.name}" was not found in this file.`,
  chooseFile: "Choose a CSV or Excel file to upload.",
  runNotFound: "This run no longer exists.",
  runStarted: "This run has already started. Upload the file again to change its settings.",
  runActive: "Pause this run before you delete it.",
  templateEmpty: "Write a summary template before starting.",
  templateTooLong: (p: Params) => `Keep the template under ${p.max} characters (it has ${p.length}).`,
  chooseVideoColumn: "Choose the column that holds the video links.",
  chooseDescriptionColumn: "Choose a Description column that is different from the video column.",
  settingsMissing: "Some settings are missing. Check the columns and template.",
  connectFirst: "Connect your vidIQ account first.",
  nothingToRun: "There are no videos waiting for a summary.",
  nothingToRetry: "There are no failed videos to retry.",
  rowNotFound: "That row could not be found.",
  rowNotEditable: "Only finished or failed rows can be edited.",
  rowBusy: "This row is being summarized right now. Try again when it finishes.",
  previewBusy: "A trial summary is already running.",
  nothingToPreview: "There is no video left to try the template on.",
  nameEmpty: "Give the run a name.",
  vidiqNoLink: "vidIQ did not return a sign-in link. Try again.",
  vidiqLinkExpired: "The sign-in link expired. Start the vidIQ connection again.",
  vidiqStaleLink: "This sign-in link is out of date. Start the vidIQ connection again from the app.",
  vidiqSessionExpired: "Your vidIQ sign-in expired. Connect vidIQ again to continue.",
  vidiqUnreachable: "Could not reach vidIQ. Check your internet connection and try again.",
  blocked: "Blocked a request that did not come from this app.",
  serverError: "Something went wrong on our side. Try again.",
} satisfies Record<string, Message>;

export type ErrorKey = keyof typeof en;

const es: Record<ErrorKey, Message> = {
  fileTooLarge: "Este archivo supera los 20 MB. Divídelo en archivos más pequeños.",
  noRows: "Este archivo no tiene filas de videos debajo de la fila de encabezados.",
  tooManyRows: (p) => `Este archivo tiene ${p.rows} filas. Sube ${p.max} o menos a la vez.`,
  unsupportedFile: "Sube un archivo CSV o Excel (.csv, .xlsx o .xls).",
  unreadableFile: "No se pudo leer este archivo. Comprueba que sea un CSV o Excel válido.",
  sheetNotFound: (p) => `No se encontró la hoja "${p.name}" en este archivo.`,
  chooseFile: "Elige un archivo CSV o Excel para subir.",
  runNotFound: "Esta ejecución ya no existe.",
  runStarted: "Esta ejecución ya comenzó. Vuelve a subir el archivo para cambiar su configuración.",
  runActive: "Pausa esta ejecución antes de eliminarla.",
  templateEmpty: "Escribe una plantilla de resumen antes de empezar.",
  templateTooLong: (p) => `La plantilla debe tener menos de ${p.max} caracteres (tiene ${p.length}).`,
  chooseVideoColumn: "Elige la columna que contiene los enlaces de los videos.",
  chooseDescriptionColumn: "Elige una columna de descripción distinta de la columna de videos.",
  settingsMissing: "Faltan algunos ajustes. Revisa las columnas y la plantilla.",
  connectFirst: "Primero conecta tu cuenta de vidIQ.",
  nothingToRun: "No hay videos esperando un resumen.",
  nothingToRetry: "No hay videos con error para reintentar.",
  rowNotFound: "No se encontró esa fila.",
  rowNotEditable: "Solo se pueden editar filas terminadas o con error.",
  rowBusy: "Esta fila se está resumiendo ahora. Inténtalo de nuevo cuando termine.",
  previewBusy: "Ya hay un resumen de prueba en curso.",
  nothingToPreview: "No queda ningún video para probar la plantilla.",
  nameEmpty: "Ponle un nombre a la ejecución.",
  vidiqNoLink: "vidIQ no devolvió un enlace de inicio de sesión. Inténtalo de nuevo.",
  vidiqLinkExpired: "El enlace de inicio de sesión caducó. Vuelve a conectar vidIQ.",
  vidiqStaleLink: "Este enlace de inicio de sesión ya no es válido. Vuelve a conectar vidIQ desde la aplicación.",
  vidiqSessionExpired: "Tu sesión de vidIQ caducó. Vuelve a conectar vidIQ para continuar.",
  vidiqUnreachable: "No se pudo contactar con vidIQ. Revisa tu conexión a internet e inténtalo de nuevo.",
  blocked: "Se bloqueó una solicitud que no provenía de esta aplicación.",
  serverError: "Algo salió mal por nuestra parte. Inténtalo de nuevo.",
};

const MESSAGES: Record<Locale, Record<ErrorKey, Message>> = { en, es };

export function errorText(locale: Locale, key: ErrorKey, params: Params = {}): string {
  const message = MESSAGES[locale][key];
  return typeof message === "function" ? message(params) : message;
}
