// SSO de Azure AD (Microsoft Entra) hecho a mano con @azure/msal-node -- la
// plantilla no trae esto (next-auth lo resolvía en la app original vía
// next-auth/providers/azure-ad, ver src/lib/auth.ts). Flujo de código de
// autorización estándar (authorization code + PKCE no requerido para un
// confidential client). Mismo comportamiento que el `signIn`/`jwt` callback
// original: sin usuario con ese correo -> OAuthAccountNotFound (el primer ingreso
// vincula la cuenta por correo, como SISGER), usuario inactivo -> OAuthAccountInactive, éxito -> mismas cookies de sesión
// que el login por contraseña.
const msal = require('@azure/msal-node');
const { Op } = require('sequelize');
const asyncHandler = require('../../utils/asyncHandler');
const { ACCESS_TOKEN_EXPIRE_HOURS, REFRESH_TOKEN_EXPIRE_DAYS, ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, MS_LINK_INTENT_COOKIE_NAME, createAccessToken, createRefreshToken } = require('../../utils/security');
const Usuario = require('../usuario/usuario.model');
const usuarioService = require('../usuario/usuario.service');

// `secure` solo si la app se sirve por HTTPS (FRONTEND_URL): con una URL http de pruebas el navegador descartaría la cookie.
const COOKIE_BASE = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production' && String(process.env.FRONTEND_URL || '').startsWith('https'),
};
const SCOPES = ['openid', 'profile', 'email', 'User.Read'];
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5193';
const REDIRECT_URI = process.env.AZURE_REDIRECT_URI || 'http://localhost:3021/api/auth/azure/callback';

const msalClient = new msal.ConfidentialClientApplication({
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
  },
});

function setSessionCookies(res, usuario) {
  const accessToken = createAccessToken(usuario.email, usuario.roles);
  const refreshToken = createRefreshToken(usuario.email);
  res.cookie(ACCESS_COOKIE_NAME, accessToken, { ...COOKIE_BASE, maxAge: ACCESS_TOKEN_EXPIRE_HOURS * 3600 * 1000 });
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, { ...COOKIE_BASE, maxAge: REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600 * 1000 });
}

// GET /auth/azure/login -- inicia un login normal.
const iniciarLogin = asyncHandler(async (req, res) => {
  const url = await msalClient.getAuthCodeUrl({ scopes: SCOPES, redirectUri: REDIRECT_URI });
  res.redirect(url);
});

// GET /auth/azure/link -- requireAuth: marca "el próximo callback es para
// VINCULAR la cuenta de req.usuario", vía una cookie de corta vida (5 min).
const iniciarVinculacion = asyncHandler(async (req, res) => {
  res.cookie(MS_LINK_INTENT_COOKIE_NAME, String(req.usuario.id), { ...COOKIE_BASE, maxAge: 5 * 60 * 1000 });
  const url = await msalClient.getAuthCodeUrl({ scopes: SCOPES, redirectUri: REDIRECT_URI });
  res.redirect(url);
});

// GET /auth/azure/callback -- Microsoft redirige acá con ?code=...
const callback = asyncHandler(async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) {
    return res.redirect(`${FRONTEND_URL}/login?error=OAuthError`);
  }

  let tokenResponse;
  try {
    tokenResponse = await msalClient.acquireTokenByCode({ code, scopes: SCOPES, redirectUri: REDIRECT_URI });
  } catch {
    return res.redirect(`${FRONTEND_URL}/login?error=OAuthError`);
  }

  const claims = tokenResponse.account?.idTokenClaims ?? {};
  const microsoftId = tokenResponse.uniqueId || claims.oid || claims.sub;
  const microsoftEmail = (tokenResponse.account?.username || claims.email || claims.preferred_username || '').toLowerCase() || null;
  if (!microsoftId) return res.redirect(`${FRONTEND_URL}/login?error=OAuthError`);

  const linkIntent = req.cookies?.[MS_LINK_INTENT_COOKIE_NAME];
  if (linkIntent) {
    res.clearCookie(MS_LINK_INTENT_COOKIE_NAME);
    try {
      await usuarioService.vincularMicrosoft(linkIntent, microsoftId, microsoftEmail);
      return res.redirect(`${FRONTEND_URL}/perfil?ms_linked=${encodeURIComponent(microsoftEmail ?? 'true')}`);
    } catch (err) {
      return res.redirect(`${FRONTEND_URL}/perfil?ms_error=${encodeURIComponent(err.message)}`);
    }
  }

  // Login normal. Primer ingreso (igual que SISGER): si el microsoftId todavía no está vinculado, se vincula solo por
  // el correo con el que el admin creó el usuario (email o microsoft_email). Sin usuario con ese correo -> NotFound.
  let usuario = await usuarioService.buscarPorMicrosoftId(microsoftId);
  if (!usuario && microsoftEmail) {
    usuario = await Usuario.findOne({ where: { [Op.or]: [{ email: microsoftEmail }, { microsoft_email: microsoftEmail }] } });
    if (usuario?.activo) await usuario.update({ microsoft_id: microsoftId, microsoft_email: microsoftEmail });
  }
  if (!usuario) return res.redirect(`${FRONTEND_URL}/login?error=OAuthAccountNotFound`);
  if (!usuario.activo) {
    return res.redirect(`${FRONTEND_URL}/login?error=OAuthAccountInactive`);
  }

  await usuarioService.registrarConexion(usuario);
  setSessionCookies(res, usuario);
  res.redirect(FRONTEND_URL);
});

// POST /auth/azure/unlink -- requireAuth.
const desvincular = asyncHandler(async (req, res) => {
  const { ok } = require('../../utils/ApiResponse');
  await usuarioService.desvincularMicrosoft(req.usuario.id);
  ok(res, { detail: 'Cuenta de Microsoft desvinculada' });
});

module.exports = { iniciarLogin, iniciarVinculacion, callback, desvincular };
