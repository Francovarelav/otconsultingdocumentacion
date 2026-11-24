// Acceso local (emulador y MCP) con la sesión de gcloud del operador: la organización bloquea llaves
// de cuentas de servicio y la credencial ADC caduca. Cada librería de Google trae su propia copia de
// google-auth-library, así que el cliente OAuth se crea con la copia de cada una.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { Firestore } from "@google-cloud/firestore";
import { Storage } from "@google-cloud/storage";

const requerir = createRequire(import.meta.url);

export function hayGcloud() {
  try { execFileSync("gcloud", ["--version"], { stdio: "ignore" }); return true; } catch { return false; }
}

function clienteOAuth(ruta) {
  const { OAuth2Client } = requerir(ruta);
  const auth = new OAuth2Client();
  auth.refreshHandler = async () => ({
    access_token: execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim(),
    expiry_date: Date.now() + 45 * 60 * 1000,
  });
  return auth;
}

export function firestoreGcloud(projectId) {
  return new Firestore({ projectId, authClient: clienteOAuth("google-gax/node_modules/google-auth-library") });
}

export function bucketGcloud(projectId, nombre) {
  return new Storage({ projectId, authClient: clienteOAuth("@google-cloud/storage/node_modules/google-auth-library") }).bucket(nombre);
}
