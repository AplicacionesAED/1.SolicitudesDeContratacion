# Solicitudes de Contratación AED

Gestión de solicitudes de contratación **directa e indirecta** de Baía Kristal: contratos, órdenes de servicio y otrosís, con su flujo de aprobación por frente, cuadro comparativo, cronograma, terceros (debida diligencia) y documentos generados (.docx / .pdf / .xlsx).

- **Backend:** Node 20 + Express + Sequelize (PostgreSQL), en `backend/`.
- **Frontend:** React + Vite, en `frontend/`.
- **Producción:** un solo contenedor Docker. El proceso de Express sirve la API bajo `/api` y el build estático del frontend (mismo origen, sin nginx aparte).

## Desarrollo local

```bash
npm run install:all                      # instala backend y frontend
cp backend/.env.example backend/.env     # y completa los valores
npm run db:migrate                       # aplica migraciones
npm run dev                              # backend :3021 + frontend :5193
```

`npm run db:seed` solo para una base de desarrollo vacía (crea el administrador y los roles base); **nunca** en producción.

## Despliegue (Docker / Coolify)

La imagen se construye desde el `Dockerfile` de la raíz (3 etapas: build del frontend, dependencias de producción del backend, imagen final). Al arrancar, `entrypoint.sh` ejecuta `npm start`, que aplica las migraciones pendientes (`sequelize-cli db:migrate`) y levanta el servidor en el puerto **3021**.

### Build-arg (se incrusta en el frontend al COMPILAR, no al arrancar)

| Build-arg | Default | Para qué |
|---|---|---|
| `VITE_BASE_PATH` | *(vacío)* | Solo si la app vive bajo un prefijo detrás del gateway del portal: `/solicitudes/`. La API pasa a ser `/solicitudes/api` sola. Standalone, vacío. |
| `VITE_API_URL` | *(vacío)* | Normalmente no hace falta: en producción el frontend usa la ruta relativa `/api` (mismo origen que el backend). Solo se define si la API vive en otro dominio. |

```bash
docker build -t solicitudes-contratacion-aed .
```

### Variables de entorno (en tiempo de ejecución)

Mismas que `backend/.env.example`. Las imprescindibles en producción:

| Variable | Notas |
|---|---|
| `DATABASE_URL` | Enlace completo a PostgreSQL (`postgres://usuario:clave@host:5432/base`). En dev también sirven las sueltas `PGHOST` `PGPORT` `PGUSER` `PGPASSWORD` `PGDATABASE`. `PGSSL=true` si el servidor lo exige. |
| `JWT_SECRET` | Obligatorio y **distinto** al de cualquier otro proyecto. |
| `CORS_ORIGIN` `FRONTEND_URL` | Dominio de la aplicación (un solo origen). |
| `AZURE_TENANT_ID` `AZURE_CLIENT_ID` `AZURE_CLIENT_SECRET` | Login con Microsoft y sincronización de terceros con SharePoint. |
| `AZURE_REDIRECT_URI` | `https://<tu-dominio>/api/auth/azure/callback`, registrada como *Redirect URI* tipo "Web" en el App Registration de Azure. |
| `SHAREPOINT_FILE_ID` | Excel de terceros que se sincroniza. |
| `GOOGLE_DRIVE_CREDENTIALS_JSON` | Contenido completo del .json de la cuenta de servicio de Google (los archivos subidos viven en Drive). |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | Carpeta raíz de Drive (la cuenta de servicio debe ser editora). Carpeta `1. SOLICITUDES DE CONTRATACIÓN` (exclusiva de este proyecto); los archivos van a `Directas|Indirectas/<consecutivo>/`. |
| `UPLOADS_DIR` | Solo para archivos viejos en disco; se puede quitar tras correr `backend/scripts/migrarArchivosADrive.js`. |

`PORT` y `NODE_ENV=production` ya quedan definidos en la imagen. **No** configures `LEGACY_DATABASE_URL` en producción (es de un script de migración de un solo uso).

### Primer despliegue sobre una base nueva

1. Crea la base PostgreSQL vacía y configura las variables.
2. Despliega: las migraciones crean el esquema y los roles.
3. Crea el administrador **una sola vez** (el entrypoint nunca corre seeders):
   ```bash
   docker exec -it <contenedor> sh -c "cd /app/backend && npx sequelize-cli db:seed:all"
   ```
4. Entra con ese usuario y crea las demás cuentas desde *Configuración → Usuarios*.

Si despliegas sobre la base que ya tiene los datos reales, solo configura las variables: las migraciones se aplican solas.

## Estructura

```
backend/    API (módulos por dominio, migraciones en src/db/migrations, scripts/ de un solo uso)
frontend/   Aplicación React (features/ por pantalla, components/ui compartidos)
Dockerfile  Imagen de producción (un contenedor)
CLAUDE.md   Decisiones y estado del proyecto (para quien lo mantenga)
DESIGN.md   Sistema de diseño
```

## Login global del portal

Solicitudes puede aceptar la sesión del portal AED (`portal.aed-it.com`) en lugar de su login propio. Se controla con la variable `PORTAL_AUTH` del backend (el frontend lo lee de `GET /api/auth/modo`, sin recompilar): `off` (por defecto, solo el login propio con Microsoft), `optional` (acepta ambos; el login suma "Entrar con el portal AED") y `required` (solo el portal: el login propio, el refresh y la vinculación de Microsoft responden 410, y `/login` manda al del portal).

El portal solo dice **quién** es la persona y si le da acceso a Solicitudes; los roles, permisos, frentes y aprobadores siguen siendo de Solicitudes: la persona se busca por correo en `usuarios` y, si no existe, ve que debe pedir a un administrador que la cree. La verificación está en `backend/src/utils/portalAuth.js` (copia idéntica en todas las apps; la fuente y sus pruebas están en `0. PLATAFORMA AED/auth/cliente/`) y se aplica en `backend/src/middlewares/auth.js`. Plan completo: `0. PLATAFORMA AED/docs/PLAN-LOGIN-GLOBAL.md`.
