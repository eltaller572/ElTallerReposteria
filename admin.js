/* El Taller Repostería — Panel de Empleados y Administrador
   Conectado a Supabase. La seguridad real vive en la base de datos (RLS y
   funciones): esta pantalla solo muestra lo que cada rol tiene permitido. */
(function(){
'use strict';

/* ================= Configuración ================= */
var CFG = window.ET_CONFIG || {};
var SB_URL = CFG.url || 'https://kizywhlnahblwhapfznt.supabase.co';
var SB_KEY = CFG.key || 'sb_publishable_U1Ym5aJHk9akwOd4JTn2ZQ_z4T06bKB';
var BUCKET = 'productos';
var TZ = 'America/Mexico_City';

var sb = window.supabase.createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

/* ================= Estado ================= */
var S = {
  user: null, perfil: null, admin: false, tab: null,
  modo: 'login',          // login | alta | olvido | nueva
  msg: null,              // {t:'ok'|'err'|'info', x:'texto'}
  hoy: null,
  // datos
  dia: [], menu: [], opc: [], ajustes: {}, costosOk: {},
  // formularios abiertos
  abierto: null,          // clave del formulario/fila abierta
  filtroDia: 'todos', filtroCaja: 'dia', buscaCaja: '',
  ticket: [], pago: 'efectivo',
  ultimo: null,           // resultado de la última venta
  periodo: 'hoy', desde: '', hasta: '',
  ses: [], inv: [], perfiles: [], nom: {}, rv: [], rc: [], costos: [], hist: [], ventas: [], pedidos: [], saldoPend: 0,
  // sucursales
  suc: null,              // sucursal en la que se está trabajando
  sucs: [], misSucs: [],  // todas las sucursales / las que puede usar esta persona
  rsuc: 'todas',          // filtro del Resumen
  pedl: [], nuevosEnLinea: 0, actEnLinea: null
};

/* ================= Utilidades ================= */
function $(id){ return document.getElementById(id); }
function esc(v){
  return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function fm(n){
  if(n == null || n === '' || isNaN(n)) return '—';
  return '$' + Number(n).toLocaleString('es-MX', {minimumFractionDigits:0, maximumFractionDigits:2});
}
function num(v){
  if(v == null) return NaN;
  var s = String(v).replace(/[$,\s]/g,'');
  if(s === '') return NaN;
  var n = Number(s);
  return isFinite(n) ? Math.round(n*100)/100 : NaN;
}
function fechaMX(d){
  return new Intl.DateTimeFormat('en-CA', {timeZone:TZ, year:'numeric', month:'2-digit', day:'2-digit'}).format(d || new Date());
}
function sumarDias(iso, n){
  var p = iso.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1]-1, p[2] + n));
  return d.toISOString().slice(0,10);
}
function fechaLarga(iso){
  var p = iso.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1]-1, p[2], 12)).toLocaleDateString('es-MX', {weekday:'long', day:'numeric', month:'long', timeZone:'UTC'});
}
function horaMX(ts){
  return new Date(ts).toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit', timeZone:TZ});
}
function fechaHoraMX(ts){
  return new Date(ts).toLocaleString('es-MX', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', timeZone:TZ});
}
var FOTO_OK = /^(dia|menu)\/[A-Za-z0-9._\/-]+\.(jpg|jpeg|png|webp)$/;
function fotoUrl(path){
  if(!path || !FOTO_OK.test(path)) return '';
  return SB_URL + '/storage/v1/object/public/' + BUCKET + '/' + path;
}
function phHTML(nombre, path){
  var u = fotoUrl(path);
  return u ? '<div class="ph" style="background-image:url(\'' + u + '\')" aria-hidden="true"></div>'
           : '<div class="ph" aria-hidden="true">' + esc(String(nombre || '?').charAt(0).toUpperCase()) + '</div>';
}
function amigable(e){
  var m = (e && (e.message || e.msg || e.error_description)) || String(e || '');
  if(/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if(/Email not confirmed/i.test(m)) return 'Falta confirmar tu correo. Revisa tu bandeja de entrada.';
  if(/Database error saving new user/i.test(m)) return 'El código de invitación no es válido o ya venció.';
  if(/already registered|already exists/i.test(m)) return 'Ese correo ya tiene una cuenta. Inicia sesión.';
  if(/Password should be/i.test(m)) return 'La contraseña es muy corta (mínimo 8 caracteres).';
  if(/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera unos minutos.';
  if(/row-level security|permission denied|Sin permiso/i.test(m)) return 'No tienes permiso para hacer eso.';
  if(/Failed to fetch|NetworkError|network/i.test(m)) return 'Sin conexión. Revisa el internet e intenta otra vez.';
  if(/JWT|session/i.test(m)) return 'Tu sesión venció. Vuelve a iniciar sesión.';
  return m.replace(/^.*?ERROR:\s*/,'');
}
function ok(t){ S.msg = {t:'ok', x:t}; }
function fallo(e){ S.msg = {t:'err', x:amigable(e)}; }
function msgHTML(){
  if(!S.msg) return '';
  var h = '<div class="msg ' + S.msg.t + '" role="status">' + esc(S.msg.x) + '</div>';
  return h;
}
function val(id){ var e = $(id); return e ? e.value : ''; }
function checked(id){ var e = $(id); return !!(e && e.checked); }

/* Reduce la foto en el teléfono antes de subirla (máx. 1000 px, JPG) */
function reducirFoto(file){
  return new Promise(function(res, rej){
    if(!file || !/^image\//.test(file.type)) return rej(new Error('El archivo no es una imagen.'));
    if(file.size > 15 * 1024 * 1024) return rej(new Error('La foto es demasiado grande.'));
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onerror = function(){ URL.revokeObjectURL(url); rej(new Error('No se pudo leer la foto.')); };
    img.onload = function(){
      var max = 1000, w = img.naturalWidth, h = img.naturalHeight;
      var k = Math.min(1, max / Math.max(w, h));
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w*k)); c.height = Math.max(1, Math.round(h*k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(function(b){ b ? res(b) : rej(new Error('No se pudo procesar la foto.')); }, 'image/jpeg', 0.8);
    };
    img.src = url;
  });
}
function uid(){
  if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
async function subirFoto(inputId, carpeta){
  var inp = $(inputId);
  if(!inp || !inp.files || !inp.files[0]) return null;
  var blob = await reducirFoto(inp.files[0]);
  var path = carpeta + '/' + uid() + '.jpg';
  var r = await sb.storage.from(BUCKET).upload(path, blob, {contentType:'image/jpeg', upsert:false});
  if(r.error) throw r.error;
  return path;
}

/* ================= Promociones ================= */
function promoTexto(x){
  if(!x || !x.promo_tipo) return '';
  if(x.promo_tipo === 'nxm') return x.promo_n + 'x' + x.promo_m;
  if(x.promo_tipo === 'porcentaje') return Number(x.promo_valor) + '% de descuento';
  if(x.promo_tipo === 'precio') return 'Precio especial ' + fm(x.promo_valor);
  return '';
}
/* Descuento de un renglón (igual que en la base de datos, solo para mostrar) */
function promoDescuento(x, pu, q, tam){
  if(!x || !x.promo_tipo) return 0;
  if(x.promo_tipo === 'nxm' && q >= x.promo_n) return pu * (Math.floor(q / x.promo_n) * (x.promo_n - x.promo_m));
  if(x.promo_tipo === 'porcentaje') return Math.round(pu * q * x.promo_valor) / 100;
  if(x.promo_tipo === 'precio' && tam !== 'g' && x.promo_valor < pu) return (pu - x.promo_valor) * q;
  return 0;
}
function promoCampos(e){
  e = e || {};
  var sel = !e.promo_tipo ? '' : (e.promo_tipo === 'nxm' ? (e.promo_n === 2 && e.promo_m === 1 ? '2x1' : (e.promo_n === 3 && e.promo_m === 2 ? '3x2' : 'nxm')) : e.promo_tipo);
  var op = [['','Sin promoción'],['2x1','2x1'],['3x2','3x2'],['nxm','Otra: lleva / paga'],['porcentaje','% de descuento'],['precio','Precio especial']];
  return '<div class="fld"><label for="prT">Promoción</label><select id="prT" data-a="prTipo">' + op.map(function(o){ return '<option value="' + o[0] + '"' + (sel === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
    '<div class="note">La caja la aplica sola al cobrar. Aparece anunciada en el sitio.</div></div>' +
    '<div class="grid2' + (sel === 'nxm' ? '' : ' hidden') + '" id="prNxm"><div class="fld"><label for="prN">Lleva</label><input id="prN" type="number" min="2" max="10" value="' + esc(e.promo_n || 4) + '"></div><div class="fld"><label for="prM">Paga</label><input id="prM" type="number" min="1" max="9" value="' + esc(e.promo_m || 3) + '"></div></div>' +
    '<div class="fld' + (sel === 'porcentaje' || sel === 'precio' ? '' : ' hidden') + '" id="prVal"><label for="prV" id="prVl">' + (sel === 'precio' ? 'Precio especial' : 'Porcentaje de descuento') + '</label><input id="prV" type="text" inputmode="decimal" value="' + esc(e.promo_valor) + '"></div>';
}
function promoTipoCambio(){
  var v = val('prT'), n = $('prNxm'), w = $('prVal'), l = $('prVl');
  if(n) n.classList.toggle('hidden', v !== 'nxm');
  if(w) w.classList.toggle('hidden', !(v === 'porcentaje' || v === 'precio'));
  if(l) l.textContent = v === 'precio' ? 'Precio especial' : 'Porcentaje de descuento';
}
function leerPromo(precio){
  var v = val('prT');
  var r = {promo_tipo:null, promo_n:null, promo_m:null, promo_valor:null};
  if(!v) return r;
  if(v === '2x1'){ r.promo_tipo = 'nxm'; r.promo_n = 2; r.promo_m = 1; return r; }
  if(v === '3x2'){ r.promo_tipo = 'nxm'; r.promo_n = 3; r.promo_m = 2; return r; }
  if(v === 'nxm'){
    var n = parseInt(val('prN'), 10), m = parseInt(val('prM'), 10);
    if(!(n >= 2 && n <= 10) || !(m >= 1 && m < n)) throw new Error('En la promoción, "lleva" debe ser mayor que "paga" (por ejemplo, lleva 4 y paga 3).');
    r.promo_tipo = 'nxm'; r.promo_n = n; r.promo_m = m; return r;
  }
  var x = num(val('prV'));
  if(v === 'porcentaje'){ if(!(x > 0 && x < 100)) throw new Error('El descuento debe ser entre 1 y 99%.'); }
  if(v === 'precio'){ if(!(x > 0)) throw new Error('Escribe el precio especial.'); if(precio && x >= precio) throw new Error('El precio especial debe ser menor que el precio normal.'); }
  r.promo_tipo = v; r.promo_valor = x; return r;
}
function promoTag(x){
  var t = promoTexto(x); if(!t) return '';
  var quien = (S.admin && x.promo_por && S.nom && S.nom[x.promo_por]) ? ' · puesta por ' + S.nom[x.promo_por] : '';
  return '<span class="tag r">Promo ' + esc(t) + '</span>' + (quien ? ' <span style="font-size:12px">' + esc(quien.slice(3)) + '</span>' : '');
}
/* ================= Sucursales ================= */
function sucNombre(id){ var s = S.sucs.filter(function(x){ return x.id === id; })[0]; return s ? s.nombre : (id || ''); }
function sucActual(){ return S.sucs.filter(function(x){ return x.id === S.suc; })[0] || null; }
async function cargarSucursales(){
  var r = await sb.from('sucursales').select('*').order('orden');
  if(r.error) throw new Error('Falta actualizar la base de datos (sucursales). Avisa al desarrollador.');
  S.sucs = r.data || [];
  var mia = S.perfil && S.perfil.sucursal;
  S.misSucs = (S.admin || !mia) ? S.sucs.map(function(s){ return s.id; }) : [mia];
  if(S.misSucs.indexOf(S.suc) < 0){
    var g = null; try{ g = localStorage.getItem('et_panel_suc'); }catch(e){}
    S.suc = S.misSucs.indexOf(g) >= 0 ? g : S.misSucs[0];
  }
}
function cambiarSucursal(id){
  if(S.misSucs.indexOf(id) < 0) return;
  S.suc = id; S.ticket = []; S.abierto = null; S.ultimo = null; S.msg = null; S.nuevosEnLinea = 0;
  try{ localStorage.setItem('et_panel_suc', id); }catch(e){}
}

async function cargarNombres(){
  if(!S.admin) return;
  var r = await sb.from('perfiles').select('id,nombre');
  if(!r.error){ S.nom = {}; (r.data || []).forEach(function(p){ S.nom[p.id] = p.nombre; }); }
}

/* ================= Sesión ================= */
async function iniciar(){
  S.hoy = fechaMX();
  $('hoyTxt').textContent = fechaLarga(S.hoy).replace(/^./, function(c){ return c.toUpperCase(); });
  sb.auth.onAuthStateChange(function(ev, session){
    if(ev === 'PASSWORD_RECOVERY'){ S.modo = 'nueva'; S.user = null; pintar(); return; }
    if(ev === 'SIGNED_OUT'){ S.user = null; S.perfil = null; S.tab = null; S.modo = 'login'; pintar(); }
  });
  var r = await sb.auth.getSession();
  if(r.data && r.data.session && S.modo !== 'nueva'){ await entrar(); }
  else pintar();
  // Si el administrador cerró esta sesión, se detecta aquí
  setInterval(async function(){
    if(!S.user) return;
    var u = await sb.auth.getUser();
    if(u.error || !u.data.user){ await salir('Tu sesión fue cerrada. Vuelve a iniciar sesión.'); }
  }, 5 * 60 * 1000);
}

async function entrar(){
  var u = await sb.auth.getUser();
  if(u.error || !u.data.user){ await sb.auth.signOut(); S.modo = 'login'; pintar(); return; }
  S.user = u.data.user;
  var p = await sb.from('perfiles').select('id,nombre,rol,activo,sucursal').eq('id', S.user.id).maybeSingle();
  if(p.error){ fallo(p.error); S.perfil = null; pintar(); return; }
  S.perfil = p.data;
  if(!S.perfil || !S.perfil.activo){ pintar(); return; }
  S.admin = (S.perfil.rol === 'dueno' || S.perfil.rol === 'developer');
  if(S.admin && inactivoDemasiado()){ await salir(MSG_INACT); return; }
  marcarActividad();
  try{ await cargarSucursales(); }catch(e){ fallo(e); }
  S.tab = S.tab || (S.admin ? 'resumen' : 'dia');
  await cargarTab();
}

/* Administrador: la sesión se cierra sola tras 30 minutos sin usar el panel
   (en cualquier pestaña). Los empleados en caja no se ven afectados. */
var INACT_MS = 30 * 60 * 1000;
var MSG_INACT = 'Por seguridad cerramos tu sesión después de 30 minutos sin actividad.';
function marcarActividad(){ try{ localStorage.setItem('et_act', String(Date.now())); }catch(e){} }
function ultimaActividad(){ try{ return Number(localStorage.getItem('et_act')) || 0; }catch(e){ return 0; } }
function inactivoDemasiado(){ var u = ultimaActividad(); return !!u && Date.now() - u > INACT_MS; }
(function(){
  var ult = 0;
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function(ev){
    document.addEventListener(ev, function(){ var n = Date.now(); if(S.user && n - ult > 15000){ ult = n; marcarActividad(); } }, {passive:true});
  });
  setInterval(function(){ if(S.user && S.admin && inactivoDemasiado()) salir(MSG_INACT); }, 60 * 1000);
})();

async function salir(motivo){
  await sb.auth.signOut();
  S.user = null; S.perfil = null; S.tab = null; S.modo = 'login';
  S.msg = motivo ? {t:'info', x:motivo} : null;
  pintar();
}

function loginHTML(){
  var h = '<div class="login">' + msgHTML();
  if(S.modo === 'login'){
    h += '<h2>Entrar al panel</h2><p>Solo para el equipo de El Taller.</p>' +
      '<div class="fld"><label for="lgE">Correo</label><input id="lgE" type="email" autocomplete="username" inputmode="email"></div>' +
      '<div class="fld"><label for="lgP">Contraseña</label><input id="lgP" type="password" autocomplete="current-password"></div>' +
      '<div class="acts"><button class="btn-r" data-a="login">Entrar</button></div>' +
      '<div class="links"><button data-a="modo" data-m="alta">Soy nuevo: tengo un código</button><button data-a="modo" data-m="olvido">Olvidé mi contraseña</button></div>';
  } else if(S.modo === 'alta'){
    h += '<h2>Crear mi cuenta</h2><p>Pide el código de invitación al Administrador.</p>' +
      '<div class="fld"><label for="alN">Tu nombre</label><input id="alN" type="text" maxlength="60" autocomplete="name"></div>' +
      '<div class="fld"><label for="alE">Correo</label><input id="alE" type="email" autocomplete="username"></div>' +
      '<div class="fld"><label for="alP">Contraseña (mínimo 8)</label><input id="alP" type="password" autocomplete="new-password"></div>' +
      '<div class="fld"><label for="alC">Código de invitación</label><input id="alC" type="text" maxlength="12" autocapitalize="characters" autocomplete="off"></div>' +
      '<div class="acts"><button class="btn-r" data-a="alta">Crear cuenta</button></div>' +
      '<div class="links"><button data-a="modo" data-m="login">Ya tengo cuenta</button></div>';
  } else if(S.modo === 'olvido'){
    h += '<h2>Recuperar contraseña</h2><p>Te mandamos un enlace a tu correo.</p>' +
      '<div class="fld"><label for="olE">Correo</label><input id="olE" type="email" autocomplete="username"></div>' +
      '<div class="acts"><button class="btn-r" data-a="olvido">Enviar enlace</button></div>' +
      '<div class="links"><button data-a="modo" data-m="login">Volver</button></div>';
  } else if(S.modo === 'nueva'){
    h += '<h2>Nueva contraseña</h2>' +
      '<div class="fld"><label for="nvP">Nueva contraseña (mínimo 8)</label><input id="nvP" type="password" autocomplete="new-password"></div>' +
      '<div class="acts"><button class="btn-r" data-a="nueva">Guardar</button></div>';
  }
  return h + '</div>';
}

async function accionLogin(a){
  S.msg = null;
  try{
    if(a === 'login'){
      var e = val('lgE').trim(), p = val('lgP');
      if(!e || !p){ S.msg = {t:'err', x:'Escribe tu correo y contraseña.'}; return pintar(); }
      var r = await sb.auth.signInWithPassword({email:e, password:p});
      if(r.error) throw r.error;
      marcarActividad();
      await entrar(); return;
    }
    if(a === 'alta'){
      var n = val('alN').trim(), em = val('alE').trim(), pw = val('alP'), c = val('alC').trim().toUpperCase();
      if(n.length < 2) throw new Error('Escribe tu nombre.');
      if(!/^\S+@\S+\.\S+$/.test(em)) throw new Error('Escribe un correo válido.');
      if(pw.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
      if(c.length < 6) throw new Error('Escribe el código de invitación.');
      var s = await sb.auth.signUp({email:em, password:pw, options:{data:{nombre:n, codigo:c}}});
      if(s.error) throw s.error;
      if(s.data && s.data.session){ await entrar(); return; }
      S.modo = 'login'; ok('Cuenta creada. Revisa tu correo para confirmarla y después inicia sesión.');
      return pintar();
    }
    if(a === 'olvido'){
      var eo = val('olE').trim();
      if(!/^\S+@\S+\.\S+$/.test(eo)) throw new Error('Escribe un correo válido.');
      var ro = await sb.auth.resetPasswordForEmail(eo, {redirectTo: location.origin + location.pathname});
      if(ro.error) throw ro.error;
      S.modo = 'login'; ok('Si el correo existe, te llegará un enlace para cambiar la contraseña.');
      return pintar();
    }
    if(a === 'nueva'){
      var np = val('nvP');
      if(np.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
      var rn = await sb.auth.updateUser({password:np});
      if(rn.error) throw rn.error;
      S.modo = 'login'; ok('Contraseña actualizada.');
      await entrar(); return;
    }
  }catch(err){ fallo(err); pintar(); }
}

/* ================= Pestañas ================= */
var TABS_EMP = [['dia','Menú del día'],['bebidas','Bebidas y desayunos'],['enlinea','Pedidos en línea'],['pasteles','Pasteles'],['caja','Caja'],['pedidos','Pedidos de pastel'],['ventas','Ventas de hoy'],['corte','Corte']];
var TABS_ADM = [['resumen','Resumen']].concat(TABS_EMP).concat([['costos','Costos'],['historial','Historial'],['equipo','Equipo'],['sucursales','Sucursales']]);

function pintarBarra(){
  var who = $('who'), tabs = $('tabs'), tin = $('tabsIn');
  if(!S.user || !S.perfil || !S.perfil.activo){
    who.innerHTML = S.user ? '<button data-a="salir">Salir</button>' : '';
    tabs.classList.add('hidden'); return;
  }
  var selSuc = S.misSucs.length > 1
    ? '<label class="suc-sel"><span>Sucursal</span><select id="sucSel" aria-label="Sucursal en la que trabajas">' + S.misSucs.map(function(id){ return '<option value="' + esc(id) + '"' + (id === S.suc ? ' selected' : '') + '>' + esc(sucNombre(id)) + '</option>'; }).join('') + '</select></label>'
    : (S.suc ? '<span class="suc-fija">' + esc(sucNombre(S.suc)) + '</span>' : '');
  who.innerHTML = selSuc + '<span>' + esc(S.perfil.nombre || '') + ' · <b>' + (S.admin ? 'Administrador' : 'Empleado') + '</b></span><button data-a="salir">Salir</button>';
  var lista = S.admin ? TABS_ADM : TABS_EMP;
  tin.innerHTML = lista.map(function(t){
    var badge = (t[0] === 'enlinea' && S.nuevosEnLinea) ? ' <span class="nbadge" aria-label="' + S.nuevosEnLinea + ' nuevos">' + S.nuevosEnLinea + '</span>' : '';
    return '<button data-a="tab" data-t="' + t[0] + '" data-l="' + esc(t[1]) + '" class="' + (S.tab === t[0] ? 'on' : '') + '">' + t[1] + badge + '</button>'; }).join('');
  document.title = (S.nuevosEnLinea ? '(' + S.nuevosEnLinea + ') ' : '') + 'Panel · El Taller Repostería';
  tabs.classList.remove('hidden');
}

function pintar(){
  pintarBarra();
  var app = $('app');
  app.removeAttribute('aria-busy');
  if(!S.user){ app.innerHTML = loginHTML(); return; }
  if(!S.perfil || !S.perfil.activo){
    app.innerHTML = '<div class="login">' + msgHTML() + '<h2>Sin acceso</h2><p>Tu cuenta no está activa en el panel. Pide al Administrador que la revise.</p><div class="acts"><button class="btn-o" data-a="salir">Salir</button></div></div>';
    return;
  }
  var v = VISTAS[S.tab];
  // Si hubo un error, se conservan los datos que la persona ya escribió
  var prev = null;
  if(S.msg && S.msg.t === 'err'){
    prev = {};
    app.querySelectorAll('input[id],select[id],textarea[id]').forEach(function(el){
      if(el.type === 'file') return;
      prev[el.id] = (el.type === 'checkbox') ? el.checked : el.value;
    });
  }
  app.innerHTML = msgHTML() + (v ? v() : '');
  if(prev) Object.keys(prev).forEach(function(id){
    var el = document.getElementById(id); if(!el) return;
    if(el.type === 'checkbox') el.checked = prev[id]; else el.value = prev[id];
  });
}

async function cargarTab(){
  S.hoy = fechaMX();
  var f = CARGAS[S.tab];
  try{ if(f) await f(); }catch(e){ fallo(e); }
  pintar();
}

async function cargarCostosOk(){
  var r = await sb.rpc('et_costos_capturados');
  S.costosOk = {};
  if(!r.error) (r.data || []).forEach(function(c){ S.costosOk[c.clave] = c.tiene_costo; });
}
function claveDia(nombre){ return 'dia:' + String(nombre).trim().toLowerCase(); }
function costoTag(clave){
  return S.costosOk[clave] ? '<span class="tag y">Costo capturado</span>' : '<span class="tag g">Sin costo</span>';
}
function costoForm(clave, nombre, conGrande){
  return '<div class="inline"><b>Costo de materiales de ' + esc(nombre) + '</b>' +
    '<div class="' + (conGrande ? 'grid2' : '') + '">' +
    '<div class="fld"><label for="csC">' + (conGrande ? 'Costo chico' : 'Costo por pieza') + '</label><input id="csC" type="text" inputmode="decimal" placeholder="0.00"></div>' +
    (conGrande ? '<div class="fld"><label for="csG">Costo grande</label><input id="csG" type="text" inputmode="decimal" placeholder="0.00"></div>' : '') +
    '</div><div class="fld"><div class="note">Solo el Administrador ve este dato. Si ya había uno, se reemplaza.</div></div>' +
    '<div class="acts"><button class="btn-o" data-a="cerrar">Cancelar</button><button class="btn-r" data-a="costoSave" data-k="' + esc(clave) + '" data-n="' + esc(nombre) + '" data-g="' + (conGrande ? 1 : 0) + '">Guardar costo</button></div></div>';
}
async function guardarCosto(clave, nombre, conGrande){
  var c = num(val('csC')), g = conGrande ? num(val('csG')) : NaN;
  if(isNaN(c) || c < 0) throw new Error('Escribe un costo válido (0 o más).');
  if(conGrande && val('csG') !== '' && (isNaN(g) || g < 0)) throw new Error('Costo grande inválido.');
  var r = await sb.rpc('et_capturar_costo', {p_clave: clave, p_nombre: nombre, p_costo: c, p_costo_grande: isNaN(g) ? null : g});
  if(r.error) throw r.error;
  S.costosOk[clave] = true; S.abierto = null;
  ok('Costo guardado para ' + nombre + '.');
}

/* ================= Menú del día ================= */
var CAT_DIA = [['pan','Pan'],['galletas','Galletas'],['especiales','Especiales']];
function catNombre(c){ var x = CAT_DIA.filter(function(z){ return z[0] === c; })[0]; return x ? x[1] : c; }

async function cargarDia(){
  var r = await sb.from('productos_dia').select('*').eq('fecha', S.hoy).eq('sucursal', S.suc).order('categoria').order('creado');
  if(r.error) throw r.error;
  S.dia = r.data || [];
  await cargarCostosOk();
  await cargarNombres();
}

function diaForm(p){
  var e = p || {};
  var k = p ? 'edDia' : 'nuevoDia';
  return '<div class="' + (p ? 'inline' : 'form') + '">' + (p ? '' : '<h3>Agregar producto de hoy</h3>') +
    '<div class="grid2">' +
    '<div class="fld"><label for="dCat">Categoría</label><select id="dCat">' + CAT_DIA.map(function(c){ return '<option value="' + c[0] + '"' + (e.categoria === c[0] ? ' selected' : '') + '>' + c[1] + '</option>'; }).join('') + '</select></div>' +
    '<div class="fld"><label for="dNom">Nombre</label><input id="dNom" type="text" maxlength="80" value="' + esc(e.nombre) + '"></div>' +
    '<div class="fld"><label for="dPre">Precio</label><input id="dPre" type="text" inputmode="decimal" value="' + esc(e.precio) + '"></div>' +
    (p ? '' : '<div class="fld"><label for="dCan">Piezas de hoy</label><input id="dCan" type="number" min="0" step="1" inputmode="numeric" value=""></div>') +
    '</div>' +
    '<div class="fld"><label for="dDes">Descripción (opcional)</label><input id="dDes" type="text" maxlength="300" value="' + esc(e.descripcion) + '"></div>' +
    '<div class="fld"><label for="dFoto">' + (p && p.foto_path ? 'Cambiar foto' : 'Foto') + ' (opcional)</label><input id="dFoto" type="file" accept="image/*" capture="environment"><div class="note">Se reduce sola antes de subirla. Las fotos del día se borran a los 2 días.</div></div>' +
    (p ? '' : '<div class="fld"><label for="dCos">Costo de materiales por pieza (opcional)</label><input id="dCos" type="text" inputmode="decimal" placeholder="Solo lo ve el Administrador"></div>') +
    promoCampos(e) +
    '<div class="err-t" id="fErr"></div>' +
    '<div class="acts"><button class="btn-o" data-a="cerrar">Cancelar</button><button class="btn-r" data-a="' + (p ? 'diaEdit' : 'diaNuevo') + '"' + (p ? ' data-id="' + p.id + '"' : '') + '>Guardar</button></div></div>';
}

function vistaDia(){
  var h = '<h2 style="margin-bottom:12px">Menú del día</h2>';
  h += '<div class="chips">' + [['todos','Todos']].concat(CAT_DIA).map(function(c){
    var n = c[0] === 'todos' ? S.dia.length : S.dia.filter(function(p){ return p.categoria === c[0]; }).length;
    return '<button data-a="fDia" data-c="' + c[0] + '" class="' + (S.filtroDia === c[0] ? 'on' : '') + '">' + c[1] + ' (' + n + ')</button>';
  }).join('') + '</div>';
  h += '<div class="ctl" style="margin-bottom:14px"><button class="btn-y" data-a="abrir" data-k="nuevoDia">+ Agregar producto</button><button class="btn-p" data-a="copiarAyer">Traer productos de ayer</button></div>';
  if(S.abierto === 'nuevoDia') h += diaForm(null);
  var items = S.dia.filter(function(p){ return S.filtroDia === 'todos' || p.categoria === S.filtroDia; });
  h += '<div class="box">';
  if(!items.length) h += '<div class="empty">Todavía no hay productos de hoy en esta categoría. Agrega el primero con su foto y cantidad.</div>';
  items.forEach(function(p){
    var ago = p.cantidad === 0;
    h += '<div class="row' + (p.disponible ? '' : ' off') + '">' + phHTML(p.nombre, p.foto_path) +
      '<div class="nm"><b>' + esc(p.nombre) + '</b><small>' + catNombre(p.categoria) + ' · ' + fm(p.precio) + '</small><small>' + costoTag(claveDia(p.nombre)) + ' ' + promoTag(p) + '</small></div>' +
      '<div class="ctl">' +
      '<button class="' + (p.disponible ? 'btn-r' : 'btn-o') + '" data-a="diaTog" data-id="' + p.id + '">' + (p.disponible ? 'Disponible' : 'No disponible') + '</button>';
    if(p.disponible){
      h += '<button class="st" data-a="diaMenos" data-id="' + p.id + '" aria-label="Quitar una pieza">−</button>' +
        '<input class="qty" type="number" min="0" step="1" inputmode="numeric" value="' + p.cantidad + '" data-a="diaQty" data-id="' + p.id + '" aria-label="Piezas de ' + esc(p.nombre) + '">' +
        '<button class="st" data-a="diaMas" data-id="' + p.id + '" aria-label="Agregar una pieza">+</button>' +
        (ago ? '<span class="tag r">Agotado</span>' : '<button class="btn-y" data-a="diaAgo" data-id="' + p.id + '">Agotado</button>');
    }
    if(p.promo_tipo) h += '<button class="btn-o btn-s" data-a="promoOff" data-t="productos_dia" data-id="' + p.id + '">Quitar promo</button>';
    h += '<button class="btn-p btn-s" data-a="abrir" data-k="ed:' + p.id + '">Editar</button>' +
      '<button class="btn-p btn-s" data-a="abrir" data-k="co:' + p.id + '">Costo</button>' +
      '<button class="btn-o btn-s" data-a="abrir" data-k="bo:' + p.id + '">Borrar</button></div>';
    if(S.abierto === 'ed:' + p.id) h += diaForm(p);
    if(S.abierto === 'co:' + p.id) h += costoForm(claveDia(p.nombre), p.nombre, false);
    if(S.abierto === 'bo:' + p.id) h += '<div class="inline">¿Borrar <b>' + esc(p.nombre) + '</b> del menú de hoy?<div class="acts"><button class="btn-o" data-a="cerrar">No</button><button class="btn-r" data-a="diaBorrar" data-id="' + p.id + '">Sí, borrar</button></div></div>';
    h += '</div>';
  });
  return h + '</div>';
}

function diaPorId(id){ return S.dia.filter(function(p){ return String(p.id) === String(id); })[0]; }
async function diaUpdate(id, cambios){
  var r = await sb.from('productos_dia').update(cambios).eq('id', id).select().single();
  if(r.error) throw r.error;
  var i = S.dia.findIndex(function(p){ return String(p.id) === String(id); });
  if(i >= 0) S.dia[i] = r.data;
}
async function diaNuevo(){
  var nombre = val('dNom').replace(/\s+/g,' ').trim(), precio = num(val('dPre')), cant = parseInt(val('dCan'), 10);
  var costo = val('dCos').trim() === '' ? null : num(val('dCos'));
  if(!nombre) throw new Error('Escribe el nombre.');
  if(!(precio > 0)) throw new Error('Escribe un precio mayor a cero.');
  if(!(cant >= 0)) throw new Error('Escribe cuántas piezas hay hoy.');
  if(costo !== null && (isNaN(costo) || costo < 0)) throw new Error('Costo inválido.');
  var promo = leerPromo(precio);
  var foto = await subirFoto('dFoto', 'dia/' + S.hoy);
  var r = await sb.from('productos_dia').insert(Object.assign({fecha:S.hoy, sucursal:S.suc, categoria:val('dCat'), nombre:nombre, precio:precio, cantidad:cant,
    descripcion: val('dDes').trim() || null, foto_path: foto, disponible:true}, promo)).select().single();
  if(r.error) throw r.error;
  S.dia.push(r.data);
  if(costo !== null){
    var c = await sb.rpc('et_capturar_costo', {p_clave:claveDia(nombre), p_nombre:nombre, p_costo:costo, p_costo_grande:null});
    if(c.error) throw c.error;
    S.costosOk[claveDia(nombre)] = true;
  }
  S.abierto = null; ok(nombre + ' ya aparece en el menú del día.');
}
async function diaEdit(id){
  var nombre = val('dNom').replace(/\s+/g,' ').trim(), precio = num(val('dPre'));
  if(!nombre) throw new Error('Escribe el nombre.');
  if(!(precio > 0)) throw new Error('Escribe un precio mayor a cero.');
  var cambios = Object.assign({categoria:val('dCat'), nombre:nombre, precio:precio, descripcion: val('dDes').trim() || null}, leerPromo(precio));
  var foto = await subirFoto('dFoto', 'dia/' + S.hoy);
  if(foto) cambios.foto_path = foto;
  await diaUpdate(id, cambios);
  S.abierto = null; ok('Cambios guardados.');
}
async function copiarAyer(){
  var ayer = sumarDias(S.hoy, -1);
  var r = await sb.from('productos_dia').select('categoria,nombre,descripcion,precio').eq('fecha', ayer).eq('sucursal', S.suc);
  if(r.error) throw r.error;
  var hoyN = {}; S.dia.forEach(function(p){ hoyN[p.nombre.toLowerCase()] = 1; });
  var nuevos = (r.data || []).filter(function(p){ return !hoyN[p.nombre.toLowerCase()]; })
    .map(function(p){ return {fecha:S.hoy, sucursal:S.suc, categoria:p.categoria, nombre:p.nombre, descripcion:p.descripcion, precio:p.precio, cantidad:0, disponible:false}; });
  if(!nuevos.length){ ok('No hay productos de ayer para traer (o ya están todos).'); return; }
  var ins = await sb.from('productos_dia').insert(nuevos).select();
  if(ins.error) throw ins.error;
  S.dia = S.dia.concat(ins.data || []);
  ok('Se trajeron ' + nuevos.length + ' productos de ayer como "No disponible". Pon la cantidad y actívalos.');
}

/* Exponer para los demás bloques */
window.__ET = { sb:sb, S:S, $:$, esc:esc, fm:fm, num:num, val:val, checked:checked, fechaMX:fechaMX, sumarDias:sumarDias,
  fechaLarga:fechaLarga, horaMX:horaMX, fechaHoraMX:fechaHoraMX, fotoUrl:fotoUrl, phHTML:phHTML, amigable:amigable,
  ok:ok, fallo:fallo, subirFoto:subirFoto, costoTag:costoTag, costoForm:costoForm, guardarCosto:guardarCosto,
  cargarCostosOk:cargarCostosOk, claveDia:claveDia, catNombre:catNombre, CAT_DIA:CAT_DIA, pintar:pintar, cargarTab:cargarTab,
  pintarBarra:pintarBarra, cargarDia:cargarDia, diaPorId:diaPorId, diaUpdate:diaUpdate, diaNuevo:diaNuevo, diaEdit:diaEdit, copiarAyer:copiarAyer,
  accionLogin:accionLogin, salir:salir, iniciar:iniciar, vistaDia:vistaDia,
  sucNombre:sucNombre, sucActual:sucActual, cargarSucursales:cargarSucursales, cambiarSucursal:cambiarSucursal,
  promoTexto:promoTexto, promoDescuento:promoDescuento, promoCampos:promoCampos, promoTipoCambio:promoTipoCambio, leerPromo:leerPromo, promoTag:promoTag, cargarNombres:cargarNombres };
var VISTAS = {}, CARGAS = {};
window.__ET.VISTAS = VISTAS; window.__ET.CARGAS = CARGAS;
VISTAS.dia = vistaDia; CARGAS.dia = cargarDia;
})();

/* ================= Bloque 2: bebidas, pasteles, caja, pedidos, ventas y corte ================= */
(function(){
'use strict';
var E = window.__ET, sb = E.sb, S = E.S, esc = E.esc, fm = E.fm, num = E.num, val = E.val;

/* ---------- Menú de bebidas ---------- */
async function cargarMenu(){
  var r = await sb.from('menu_items').select('*').eq('sucursal', S.suc).order('orden').order('id');
  if(r.error) throw r.error;
  S.menu = r.data || [];
  await E.cargarCostosOk();
  await E.cargarNombres();
}
function secciones(){
  var s = []; S.menu.forEach(function(m){ if(s.indexOf(m.seccion) < 0) s.push(m.seccion); }); return s;
}
function menuForm(m){
  var e = m || {};
  return '<div class="' + (m ? 'inline' : 'form') + '">' + (m ? '' : '<h3>Agregar al menú de bebidas</h3>') +
    '<div class="grid2">' +
    '<div class="fld"><label for="mSec">Sección</label><input id="mSec" type="text" list="mSecL" maxlength="40" value="' + esc(e.seccion) + '"><datalist id="mSecL">' + secciones().map(function(s){ return '<option value="' + esc(s) + '">'; }).join('') + '</datalist></div>' +
    '<div class="fld"><label for="mNom">Nombre</label><input id="mNom" type="text" maxlength="80" value="' + esc(e.nombre) + '"></div>' +
    '<div class="fld"><label for="mPre">Precio (chico o único)</label><input id="mPre" type="text" inputmode="decimal" value="' + esc(e.precio) + '"></div>' +
    '<div class="fld"><label for="mPg">Precio grande (opcional)</label><input id="mPg" type="text" inputmode="decimal" value="' + esc(e.precio_grande) + '"></div>' +
    '<div class="fld"><label for="mTip">Tipo</label><select id="mTip"><option value="bebida"' + (e.tipo !== 'bowl' && e.tipo !== 'comida' ? ' selected' : '') + '>Bebida</option><option value="bowl"' + (e.tipo === 'bowl' ? ' selected' : '') + '>Bowl</option><option value="comida"' + (e.tipo === 'comida' ? ' selected' : '') + '>Desayuno / comida</option></select></div>' +
    '</div>' +
    '<div class="fld"><label for="mDes">Descripción (opcional)</label><input id="mDes" type="text" maxlength="300" value="' + esc(e.descripcion) + '"></div>' +
    '<div class="fld"><label for="mFoto">' + (m && m.foto_path ? 'Cambiar foto' : 'Foto') + ' (opcional)</label><input id="mFoto" type="file" accept="image/*"></div>' +
    E.promoCampos(e) + '<div class="fld"><div class="note">Con "Precio especial", el precio grande no cambia.</div></div>' +
    '<div class="acts"><button class="btn-o" data-a="cerrar">Cancelar</button><button class="btn-r" data-a="' + (m ? 'menuEdit' : 'menuNuevo') + '"' + (m ? ' data-id="' + m.id + '"' : '') + '>Guardar</button></div></div>';
}
function vistaBebidas(){
  var h = '<h2 style="margin-bottom:6px">Bebidas y desayunos</h2><p style="margin:0 0 14px;color:#5c4f4c">Los productos de la sección "Desayunos" aparecen en "Nuestra selección de hoy" del sitio (los que tienen foto). Los demás, en el Menú de bebidas.</p>' +
    '<div class="ctl" style="margin-bottom:14px"><button class="btn-y" data-a="abrir" data-k="nuevoMenu">+ Agregar producto</button></div>';
  if(S.abierto === 'nuevoMenu') h += menuForm(null);
  secciones().forEach(function(sec){
    h += '<div class="box"><h3>' + esc(sec) + '</h3>';
    S.menu.filter(function(m){ return m.seccion === sec; }).forEach(function(m){
      var k = 'menu:' + m.id;
      h += '<div class="row' + (m.activo ? '' : ' off') + '">' + E.phHTML(m.nombre, m.foto_path) +
        '<div class="nm"><b>' + esc(m.nombre) + '</b><small>' + fm(m.precio) + (m.precio_grande ? ' · grande ' + fm(m.precio_grande) : '') + '</small><small>' + E.costoTag(k) + ' ' + E.promoTag(m) + '</small></div>' +
        '<div class="ctl"><button class="' + (m.activo ? 'btn-r' : 'btn-o') + ' btn-s" data-a="menuTog" data-id="' + m.id + '">' + (m.activo ? 'En el menú' : 'Oculto') + '</button>' +
        (m.promo_tipo ? '<button class="btn-o btn-s" data-a="promoOff" data-t="menu_items" data-id="' + m.id + '">Quitar promo</button>' : '') +
        '<button class="btn-p btn-s" data-a="abrir" data-k="me:' + m.id + '">Editar</button>' +
        '<button class="btn-p btn-s" data-a="abrir" data-k="mc:' + m.id + '">Costo</button></div>';
      if(S.abierto === 'me:' + m.id) h += menuForm(m);
      if(S.abierto === 'mc:' + m.id) h += E.costoForm(k, m.nombre, !!m.precio_grande);
      h += '</div>';
    });
    h += '</div>';
  });
  if(!S.menu.length) h += '<div class="box"><div class="empty">El menú de ' + esc(E.sucNombre(S.suc)) + ' está vacío.' + (S.admin ? ' En la pestaña Sucursales puedes copiar el menú de otra sucursal.' : ' Pide al Administrador que lo copie de otra sucursal, o agrega los productos.') + '</div></div>';
  return h;
}
function menuDatos(){
  var sec = val('mSec').replace(/\s+/g,' ').trim(), nom = val('mNom').replace(/\s+/g,' ').trim();
  var p = num(val('mPre')), g = val('mPg').trim() === '' ? null : num(val('mPg'));
  if(!sec) throw new Error('Escribe la sección (por ejemplo: Café caliente o Desayunos).');
  if(!nom) throw new Error('Escribe el nombre.');
  if(!(p > 0)) throw new Error('Escribe un precio mayor a cero.');
  if(g !== null && !(g > 0)) throw new Error('El precio grande debe ser mayor a cero o quedar vacío.');
  return Object.assign({seccion:sec, nombre:nom, precio:p, precio_grande:g, tipo:val('mTip'), descripcion: val('mDes').trim() || null}, E.leerPromo(p));
}
async function menuNuevo(){
  var d = menuDatos();
  var foto = await E.subirFoto('mFoto', 'menu/items');
  if(foto) d.foto_path = foto;
  d.orden = S.menu.length + 1; d.sucursal = S.suc;
  var r = await sb.from('menu_items').insert(d).select().single();
  if(r.error) throw (/duplicate/i.test(r.error.message) ? new Error('Ya existe ' + d.nombre + ' en ' + d.seccion + '.') : r.error);
  S.menu.push(r.data); S.abierto = null; E.ok(d.nombre + ' agregado al menú.');
}
async function menuEdit(id){
  var d = menuDatos();
  var foto = await E.subirFoto('mFoto', 'menu/items');
  if(foto) d.foto_path = foto;
  var r = await sb.from('menu_items').update(d).eq('id', id).select().single();
  if(r.error) throw r.error;
  S.menu = S.menu.map(function(m){ return m.id === r.data.id ? r.data : m; });
  S.abierto = null; E.ok('Cambios guardados.');
}
async function menuTog(id){
  var m = S.menu.filter(function(x){ return String(x.id) === String(id); })[0]; if(!m) return;
  var r = await sb.from('menu_items').update({activo: !m.activo}).eq('id', id).select().single();
  if(r.error) throw r.error;
  S.menu = S.menu.map(function(x){ return x.id === r.data.id ? r.data : x; });
}

/* ---------- Pasteles (personalizador) ---------- */
var PASOS = [['base','Bizcochos'],['relleno','Rellenos'],['cobertura','Coberturas'],['tamano','Tamaños'],['decoracion','Decoración'],['color','Colores'],['extras','Extras y toppings']];
async function cargarPasteles(){
  var r = await sb.from('pastel_opciones').select('*').order('paso').order('orden').order('id');
  if(r.error) throw r.error;
  S.opc = r.data || [];
  var a = await sb.from('ajustes').select('clave,valor');
  if(a.error) throw a.error;
  S.ajustes = {}; (a.data || []).forEach(function(x){ S.ajustes[x.clave] = x.valor; });
  await E.cargarCostosOk();
}
function opcForm(o, paso){
  var e = o || {};
  return '<div class="' + (o ? 'inline' : 'form') + '">' + (o ? '' : '<h3>Agregar a ' + esc(PASOS.filter(function(p){ return p[0] === paso; })[0][1]) + '</h3>') +
    '<div class="grid2">' +
    '<div class="fld"><label for="oNom">Nombre</label><input id="oNom" type="text" maxlength="80" value="' + esc(e.nombre) + '"></div>' +
    '<div class="fld"><label for="oPre">Precio que se suma (vacío = a cotizar)</label><input id="oPre" type="text" inputmode="decimal" value="' + esc(e.precio) + '"></div>' +
    '</div>' +
    '<div class="fld"><label for="oDes">Descripción (opcional)</label><input id="oDes" type="text" maxlength="300" value="' + esc(e.descripcion) + '"></div>' +
    '<div class="fld"><label><input id="oTem" type="checkbox"' + (e.temporada ? ' checked' : '') + '> De temporada</label></div>' +
    '<div class="fld"><label for="oFoto">' + (o && o.foto_path ? 'Cambiar foto' : 'Foto') + ' (opcional)</label><input id="oFoto" type="file" accept="image/*"></div>' +
    (o ? '' : '<div class="fld"><label for="oCos">Costo de materiales (opcional)</label><input id="oCos" type="text" inputmode="decimal" placeholder="Solo lo ve el Administrador"></div>') +
    '<div class="acts"><button class="btn-o" data-a="cerrar">Cancelar</button><button class="btn-r" data-a="' + (o ? 'opcEdit' : 'opcNuevo') + '" ' + (o ? 'data-id="' + o.id + '"' : 'data-p="' + paso + '"') + '>Guardar</button></div></div>';
}
function vistaPasteles(){
  var base = S.ajustes.pastel_base;
  var h = '<h2 style="margin-bottom:6px">Pasteles</h2><p style="margin:0 0 14px;color:#5c4f4c">Estas opciones arman el personalizador del sitio. El precio de un pastel = precio base + lo que suma cada opción elegida. Si falta algún precio, el sitio pide cotizar por WhatsApp.</p>';
  h += '<div class="box"><div class="row"><div class="nm"><b>Precio base del pastel</b><small>Se suma siempre</small></div><span class="money">' + (base == null ? 'Sin precio' : fm(base)) + '</span>' +
    '<button class="btn-p btn-s" data-a="abrir" data-k="base">Cambiar</button></div>';
  if(S.abierto === 'base') h += '<div class="inline"><div class="fld"><label for="bPre">Precio base</label><input id="bPre" type="text" inputmode="decimal" value="' + esc(base) + '"></div><div class="acts"><button class="btn-o" data-a="cerrar">Cancelar</button><button class="btn-r" data-a="baseSave">Guardar</button></div></div>';
  h += '</div>';
  PASOS.forEach(function(p){
    var ops = S.opc.filter(function(o){ return o.paso === p[0]; });
    h += '<div class="box"><h3>' + p[1] + ' <span class="tag">' + ops.length + '</span></h3>' +
      '<div class="in" style="padding-top:6px"><button class="btn-y btn-s" data-a="abrir" data-k="no:' + p[0] + '">+ Agregar</button></div>';
    if(S.abierto === 'no:' + p[0]) h += '<div style="padding:0 16px 12px">' + opcForm(null, p[0]) + '</div>';
    ops.forEach(function(o){
      var k = 'opcion:' + o.id;
      h += '<div class="row' + (o.activo ? '' : ' off') + '">' + E.phHTML(o.nombre, o.foto_path) +
        '<div class="nm"><b>' + esc(o.nombre) + (o.temporada ? ' <span class="tag y">De temporada</span>' : '') + '</b><small>' + (o.precio == null ? 'Sin precio' : '+' + fm(o.precio)) + '</small><small>' + E.costoTag(k) + '</small></div>' +
        '<div class="ctl"><button class="' + (o.activo ? 'btn-r' : 'btn-o') + ' btn-s" data-a="opcTog" data-id="' + o.id + '">' + (o.activo ? 'Visible' : 'Apagado') + '</button>' +
        '<button class="btn-p btn-s" data-a="abrir" data-k="oe:' + o.id + '">Editar</button>' +
        '<button class="btn-p btn-s" data-a="abrir" data-k="oc:' + o.id + '">Costo</button></div>';
      if(S.abierto === 'oe:' + o.id) h += opcForm(o);
      if(S.abierto === 'oc:' + o.id) h += E.costoForm(k, o.nombre, false);
      h += '</div>';
    });
    h += '</div>';
  });
  return h;
}
function opcDatos(){
  var nom = val('oNom').replace(/\s+/g,' ').trim();
  var p = val('oPre').trim() === '' ? null : num(val('oPre'));
  if(!nom) throw new Error('Escribe el nombre.');
  if(p !== null && (isNaN(p) || p < 0)) throw new Error('El precio debe ser 0 o más, o quedar vacío.');
  return {nombre:nom, precio:p, descripcion: val('oDes').trim() || null, temporada: E.checked('oTem')};
}
async function opcNuevo(paso){
  var d = opcDatos(); d.paso = paso;
  var costo = val('oCos').trim() === '' ? null : num(val('oCos'));
  if(costo !== null && (isNaN(costo) || costo < 0)) throw new Error('Costo inválido.');
  var foto = await E.subirFoto('oFoto', 'menu/opciones'); if(foto) d.foto_path = foto;
  d.orden = S.opc.filter(function(o){ return o.paso === paso; }).length + 1;
  var r = await sb.from('pastel_opciones').insert(d).select().single();
  if(r.error) throw (/duplicate/i.test(r.error.message) ? new Error('Ya existe "' + d.nombre + '" en ese paso.') : r.error);
  S.opc.push(r.data);
  if(costo !== null){
    var c = await sb.rpc('et_capturar_costo', {p_clave:'opcion:' + r.data.id, p_nombre:d.nombre, p_costo:costo, p_costo_grande:null});
    if(c.error) throw c.error; S.costosOk['opcion:' + r.data.id] = true;
  }
  S.abierto = null; E.ok(d.nombre + ' agregado al personalizador.');
}
async function opcEdit(id){
  var d = opcDatos();
  var foto = await E.subirFoto('oFoto', 'menu/opciones'); if(foto) d.foto_path = foto;
  var r = await sb.from('pastel_opciones').update(d).eq('id', id).select().single();
  if(r.error) throw r.error;
  S.opc = S.opc.map(function(o){ return o.id === r.data.id ? r.data : o; });
  S.abierto = null; E.ok('Cambios guardados.');
}
async function opcTog(id){
  var o = S.opc.filter(function(x){ return String(x.id) === String(id); })[0]; if(!o) return;
  var r = await sb.from('pastel_opciones').update({activo: !o.activo}).eq('id', id).select().single();
  if(r.error) throw r.error;
  S.opc = S.opc.map(function(x){ return x.id === r.data.id ? r.data : x; });
}
async function baseSave(){
  var v = val('bPre').trim() === '' ? null : num(val('bPre'));
  if(v !== null && !(v >= 0)) throw new Error('Precio inválido.');
  var r = await sb.from('ajustes').update({valor:v}).eq('clave','pastel_base').select();
  if(r.error) throw r.error;
  if(!r.data || !r.data.length) throw new Error('No tienes permiso para cambiarlo.');
  S.ajustes.pastel_base = v; S.abierto = null; E.ok('Precio base guardado.');
}

/* ---------- Caja ---------- */
async function cargarCaja(){
  var a = await sb.from('productos_dia').select('*').eq('fecha', S.hoy).eq('sucursal', S.suc).eq('disponible', true).order('categoria').order('nombre');
  if(a.error) throw a.error;
  var b = await sb.from('menu_items').select('*').eq('sucursal', S.suc).eq('activo', true).order('orden');
  if(b.error) throw b.error;
  var c = await sb.rpc('et_dia_cerrado', {p_fecha: S.hoy, p_suc: S.suc});
  S.dia = a.data || []; S.menu = b.data || []; S.cerrado = !c.error && c.data === true;
}
function precioLinea(l){
  if(l.origen === 'dia'){ var d = E.diaPorId(l.id); return d ? d.precio : 0; }
  var m = S.menu.filter(function(x){ return x.id === l.id; })[0];
  if(!m) return 0;
  return l.tamano === 'g' && m.precio_grande ? m.precio_grande : m.precio;
}
function prodLinea(l){ return l.origen === 'dia' ? E.diaPorId(l.id) : S.menu.filter(function(x){ return x.id === l.id; })[0]; }
function subLinea(l){ var pu = precioLinea(l); return pu * l.cantidad - E.promoDescuento(prodLinea(l), pu, l.cantidad, l.tamano); }
function totalTicket(){ return S.ticket.reduce(function(s, l){ return s + subLinea(l); }, 0); }
function vistaCaja(){
  var h = '<h2 style="margin-bottom:12px">Caja</h2>';
  if(S.cerrado) h += '<div class="msg info">El día ya se cerró con el corte de caja. No se pueden registrar más ventas hoy.</div>';
  if(S.ultimo) h += '<div class="msg ok">Venta #' + S.ultimo.id + ' cobrada: <b>' + fm(S.ultimo.total) + '</b> en ' + esc(S.ultimo.metodo) + '.</div>';
  h += '<div class="caja"><div class="box">' +
    '<div class="in" style="padding-bottom:0"><div class="chips" style="margin-bottom:10px">' +
    '<button data-a="fCaja" data-c="dia" class="' + (S.filtroCaja === 'dia' ? 'on' : '') + '">Menú del día</button>' +
    '<button data-a="fCaja" data-c="menu" class="' + (S.filtroCaja === 'menu' ? 'on' : '') + '">Bebidas y bowls</button></div>' +
    '<div class="fld" style="margin-top:0"><input id="cBus" type="search" placeholder="Buscar producto" value="' + esc(S.buscaCaja) + '" aria-label="Buscar producto"></div></div>' +
    '<div class="prods" id="cProds">' + prodsHTML() + '</div></div>';
  h += '<div class="ticket" id="cTicket">' + ticketHTML() + '</div></div>';
  return h;
}
function prodsHTML(){
  var q = S.buscaCaja.trim().toLowerCase(), h = '';
  if(S.filtroCaja === 'dia'){
    var ds = S.dia.filter(function(p){ return !q || p.nombre.toLowerCase().indexOf(q) >= 0; });
    if(!ds.length) return '<div class="empty">No hay productos del día disponibles.</div>';
    ds.forEach(function(p){
      var z = p.cantidad === 0;
      h += '<button class="pb' + (z ? ' z' : '') + '" data-a="add" data-o="dia" data-id="' + p.id + '"' + (z || S.cerrado ? ' disabled' : '') + '><b>' + esc(p.nombre) + '</b><span class="p">' + fm(p.precio) + '</span>' + (p.promo_tipo ? '<span class="tag r">' + esc(E.promoTexto(p)) + '</span>' : '') + '<small>' + (z ? 'Agotado' : 'Quedan ' + p.cantidad) + '</small></button>';
    });
  } else {
    var ms = S.menu.filter(function(m){ return !q || m.nombre.toLowerCase().indexOf(q) >= 0 || m.seccion.toLowerCase().indexOf(q) >= 0; });
    if(!ms.length) return '<div class="empty">Sin resultados.</div>';
    ms.forEach(function(m){
      if(m.precio_grande){
        h += '<div class="pb"><b>' + esc(m.nombre) + '</b><small>' + esc(m.seccion) + '</small>' + (m.promo_tipo ? '<span class="tag r">' + esc(E.promoTexto(m)) + '</span>' : '') + '<div class="pb-sz">' +
          '<button data-a="add" data-o="menu" data-t="ch" data-id="' + m.id + '"' + (S.cerrado ? ' disabled' : '') + '>Ch ' + fm(m.precio) + '</button>' +
          '<button data-a="add" data-o="menu" data-t="g" data-id="' + m.id + '"' + (S.cerrado ? ' disabled' : '') + '>G ' + fm(m.precio_grande) + '</button></div></div>';
      } else {
        h += '<button class="pb" data-a="add" data-o="menu" data-id="' + m.id + '"' + (S.cerrado || m.precio == null ? ' disabled' : '') + '><b>' + esc(m.nombre) + '</b><span class="p">' + fm(m.precio) + '</span>' + (m.promo_tipo ? '<span class="tag r">' + esc(E.promoTexto(m)) + '</span>' : '') + '<small>' + esc(m.seccion) + '</small></button>';
      }
    });
  }
  return h;
}
function nombreLinea(l){
  if(l.origen === 'dia'){ var d = E.diaPorId(l.id); return d ? d.nombre : '?'; }
  var m = S.menu.filter(function(x){ return x.id === l.id; })[0];
  return (m ? m.nombre : '?') + (m && m.precio_grande ? (l.tamano === 'g' ? ' (G)' : ' (Ch)') : '');
}
function ticketHTML(){
  var h = '<h3 style="margin-bottom:6px">Ticket</h3>';
  if(!S.ticket.length) h += '<p style="color:#5c4f4c;font-size:14px">Toca un producto para agregarlo.</p>';
  S.ticket.forEach(function(l, i){
    var pr = prodLinea(l), des = E.promoDescuento(pr, precioLinea(l), l.cantidad, l.tamano);
    h += '<div class="tl"><span class="n">' + esc(nombreLinea(l)) + (pr && pr.promo_tipo ? '<br><small style="color:#8f1c21">Promo ' + esc(E.promoTexto(pr)) + (des > 0 ? ': −' + fm(des) : ' (aún no aplica)') + '</small>' : '') + '</span><button data-a="tMenos" data-i="' + i + '" aria-label="Quitar uno">−</button><b>' + l.cantidad + '</b><button data-a="tMas" data-i="' + i + '" aria-label="Agregar uno">+</button><span class="m">' + fm(subLinea(l)) + '</span></div>';
  });
  h += '<div class="tot"><span>Total</span><span>' + fm(totalTicket()) + '</span></div>' +
    '<div class="pay">' + [['efectivo','Efectivo'],['tarjeta','Tarjeta'],['transferencia','Transferencia']].map(function(p){
      return '<button data-a="pago" data-p="' + p[0] + '" class="' + (S.pago === p[0] ? 'on' : '') + '">' + p[1] + '</button>'; }).join('') + '</div>' +
    '<div class="err-t" id="cErr"></div>' +
    '<div class="acts"><button class="btn-o" data-a="tVaciar"' + (S.ticket.length ? '' : ' disabled') + '>Vaciar</button><button class="btn-r" data-a="cobrar"' + (S.ticket.length && !S.cerrado ? '' : ' disabled') + '>Cobrar ' + fm(totalTicket()) + '</button></div>';
  return h;
}
function repintarCaja(){ var p = E.$('cProds'), t = E.$('cTicket'); if(p) p.innerHTML = prodsHTML(); if(t) t.innerHTML = ticketHTML(); }
function agregar(origen, id, tamano){
  id = Number(id);
  var l = S.ticket.filter(function(x){ return x.origen === origen && x.id === id && (x.tamano || null) === (tamano || null); })[0];
  if(origen === 'dia'){
    var d = E.diaPorId(id); var ya = l ? l.cantidad : 0;
    if(!d || ya >= d.cantidad){ var e = E.$('cErr'); if(e) e.textContent = 'Solo quedan ' + (d ? d.cantidad : 0) + ' de ' + (d ? d.nombre : 'ese producto') + '.'; return; }
  }
  if(l) l.cantidad++; else S.ticket.push({origen:origen, id:id, tamano: tamano || null, cantidad:1});
  S.ultimo = null; repintarCaja();
}
async function cobrar(){
  var items = S.ticket.map(function(l){ var o = {origen:l.origen, id:l.id, cantidad:l.cantidad}; if(l.tamano) o.tamano = l.tamano; return o; });
  var r = await sb.rpc('et_registrar_venta', {p_items: items, p_metodo: S.pago, p_suc: S.suc});
  if(r.error) throw r.error;
  var row = Array.isArray(r.data) ? r.data[0] : r.data;
  S.ultimo = {id: row.venta_id, total: row.total, metodo: S.pago};
  S.ticket = [];
  await cargarCaja();
}

/* ---------- Pedidos de pastel ---------- */
async function cargarPedidos(){
  var r = await sb.from('pedidos_pastel').select('*').eq('estado','pendiente').eq('sucursal', S.suc).order('fecha_entrega');
  if(r.error) throw r.error;
  S.pedidos = r.data || [];
}
function vistaPedidos(){
  var h = '<h2 style="margin-bottom:12px">Pedidos de pastel</h2>' +
    '<div class="ctl" style="margin-bottom:14px"><button class="btn-y" data-a="abrir" data-k="nuevoPed">+ Nuevo pedido con anticipo</button></div>';
  if(S.abierto === 'nuevoPed'){
    h += '<div class="form"><h3>Nuevo pedido</h3><div class="grid2">' +
      '<div class="fld"><label for="pCli">Cliente</label><input id="pCli" type="text" maxlength="80"></div>' +
      '<div class="fld"><label for="pTel">Teléfono (opcional)</label><input id="pTel" type="tel" maxlength="20" inputmode="tel"></div>' +
      '<div class="fld"><label for="pEnt">Fecha de entrega</label><input id="pEnt" type="date" min="' + S.hoy + '"></div>' +
      '<div class="fld"><label for="pTot">Total del pedido</label><input id="pTot" type="text" inputmode="decimal"></div>' +
      '<div class="fld"><label for="pAnt">Anticipo que deja hoy</label><input id="pAnt" type="text" inputmode="decimal"></div>' +
      '<div class="fld"><label for="pMet">Pagó con</label><select id="pMet"><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option></select></div>' +
      '</div><div class="fld"><label for="pDes">Pastel (sabor, tamaño, decoración)</label><textarea id="pDes" maxlength="300"></textarea></div>' +
      '<div class="acts"><button class="btn-o" data-a="cerrar">Cancelar</button><button class="btn-r" data-a="pedNuevo">Registrar pedido</button></div></div>';
  }
  h += '<div class="box"><h3>Con saldo pendiente</h3>';
  if(!S.pedidos || !S.pedidos.length) h += '<div class="empty">No hay pedidos pendientes.</div>';
  (S.pedidos || []).forEach(function(p){
    var saldo = p.total - p.pagado;
    h += '<div class="row"><div class="nm"><b>' + esc(p.cliente) + (p.telefono ? ' · ' + esc(p.telefono) : '') + '</b><small>' + esc(p.descripcion) + '</small><small>Entrega: ' + E.fechaLarga(p.fecha_entrega) + ' · Total ' + fm(p.total) + ' · Pagado ' + fm(p.pagado) + '</small></div>' +
      '<span class="money">Saldo ' + fm(saldo) + '</span><button class="btn-y btn-s" data-a="abrir" data-k="sal:' + p.id + '">Cobrar saldo</button></div>';
    if(S.abierto === 'sal:' + p.id){
      h += '<div class="inline">Cobrar <b>' + fm(saldo) + '</b> a ' + esc(p.cliente) + ' con: <div class="pay" style="margin-top:8px">' +
        [['efectivo','Efectivo'],['tarjeta','Tarjeta'],['transferencia','Transferencia']].map(function(m){ return '<button data-a="salCobrar" data-id="' + p.id + '" data-p="' + m[0] + '">' + m[1] + '</button>'; }).join('') +
        '</div><div class="acts"><button class="btn-o" data-a="cerrar">Cancelar</button></div></div>';
    }
  });
  return h + '</div>';
}
async function pedNuevo(){
  var cli = val('pCli').trim(), tot = num(val('pTot')), ant = num(val('pAnt')), ent = val('pEnt'), des = val('pDes').trim();
  if(!cli) throw new Error('Escribe el nombre del cliente.');
  if(!des) throw new Error('Describe el pastel.');
  if(!ent) throw new Error('Elige la fecha de entrega.');
  if(!(tot > 0)) throw new Error('Escribe el total del pedido.');
  if(!(ant > 0) || ant > tot) throw new Error('El anticipo debe ser mayor a cero y no pasar del total.');
  var r = await sb.rpc('et_registrar_pedido', {p_cliente:cli, p_telefono:val('pTel').trim(), p_descripcion:des, p_entrega:ent, p_total:tot, p_anticipo:ant, p_metodo:val('pMet'), p_suc:S.suc});
  if(r.error) throw r.error;
  S.abierto = null; E.ok('Pedido registrado con anticipo de ' + fm(ant) + '.');
  await cargarPedidos();
}
async function salCobrar(id, metodo){
  var r = await sb.rpc('et_cobrar_saldo', {p_pedido: Number(id), p_metodo: metodo});
  if(r.error) throw r.error;
  S.abierto = null; E.ok('Saldo cobrado: ' + fm(r.data) + '.');
  await cargarPedidos();
}

/* ---------- Ventas de hoy ---------- */
async function cargarVentas(){
  var r = await sb.from('ventas').select('*, venta_items(nombre,cantidad,tamano,subtotal,promo)').eq('fecha', S.hoy).eq('sucursal', S.suc).order('id', {ascending:false});
  if(r.error) throw r.error;
  S.ventas = r.data || [];
  var c = await sb.rpc('et_dia_cerrado', {p_fecha: S.hoy, p_suc: S.suc});
  S.cerrado = !c.error && c.data === true;
}
var TIPO = {venta:'Venta', anticipo:'Anticipo de pastel', saldo:'Saldo de pastel'};
function vistaVentas(){
  var h = '<h2 style="margin-bottom:12px">Ventas de hoy</h2>';
  if(S.cerrado) h += '<div class="msg info">El día ya se cerró: los tickets están bloqueados.</div>';
  h += '<div class="box">';
  if(!S.ventas.length) h += '<div class="empty">Todavía no hay ventas hoy.</div>';
  S.ventas.forEach(function(v){
    var can = v.estado === 'cancelada';
    var det = v.tipo === 'venta' ? (v.venta_items || []).map(function(i){ return i.cantidad + ' ' + i.nombre + (i.tamano === 'g' ? ' (G)' : i.tamano === 'ch' ? ' (Ch)' : '') + (i.promo ? ' [' + i.promo + ']' : ''); }).join(', ') : TIPO[v.tipo];
    h += '<div class="row' + (can ? ' off' : '') + '"><div class="nm"><b>#' + v.id + ' · ' + E.horaMX(v.creada) + ' <span class="tag ' + (can ? 'g' : 'y') + '">' + (can ? 'Cancelada' : 'Cobrada') + '</span></b><small>' + esc(det) + '</small>' +
      (can ? '<small>Motivo: ' + esc(v.motivo_cancel) + '</small>' : '') + '</div>' +
      '<span class="money" style="' + (can ? 'text-decoration:line-through;color:#6b5f5c' : '') + '">' + fm(v.total) + '</span><small>' + esc(v.metodo) + '</small>' +
      (!can && !S.cerrado ? '<button class="btn-o btn-s" data-a="abrir" data-k="cv:' + v.id + '">Cancelar</button>' : '') + '</div>';
    if(S.abierto === 'cv:' + v.id){
      h += '<div class="inline"><div class="fld"><label for="cvM">Motivo de la cancelación</label><select id="cvM"><option value="">Elige un motivo</option><option>Me equivoqué de producto</option><option>El cliente se arrepintió</option><option>Error en el cobro</option><option value="otro">Otro</option></select></div>' +
        '<div class="fld"><label for="cvO">Detalle (si elegiste "Otro")</label><input id="cvO" type="text" maxlength="200"></div>' +
        '<div class="fld"><div class="note">Para corregir: cancela y vuelve a cobrar en Caja. Las piezas regresan al menú del día. Todo queda registrado.</div></div>' +
        '<div class="acts"><button class="btn-o" data-a="cerrar">Volver</button><button class="btn-r" data-a="cvOk" data-id="' + v.id + '">Cancelar venta</button></div></div>';
    }
  });
  return h + '</div>';
}
async function cvOk(id){
  var m = val('cvM'); if(m === 'otro') m = val('cvO').trim();
  if(!m || m.length < 3) throw new Error('Elige o escribe el motivo.');
  var r = await sb.rpc('et_cancelar_venta', {p_venta: Number(id), p_motivo: m});
  if(r.error) throw r.error;
  S.abierto = null; E.ok('Venta #' + id + ' cancelada.');
  await cargarVentas();
}

/* ---------- Corte de caja ---------- */
async function cargarCorte(){
  var r = await sb.rpc('et_resumen_caja', {p_suc: S.suc});
  if(r.error) throw r.error;
  S.caja = Array.isArray(r.data) ? r.data[0] : r.data;
  S.corteHoy = null;
  if(S.caja && S.caja.cerrado){
    var c = await sb.from('cortes').select('*').eq('fecha', S.hoy).eq('sucursal', S.suc).maybeSingle();
    if(!c.error) S.corteHoy = c.data;
  }
}
function vistaCorte(){
  var c = S.caja || {efectivo:0, tarjeta:0, transferencia:0, fondo:0, cerrado:false};
  var h = '<h2 style="margin-bottom:12px">Corte de caja · ' + esc(E.sucNombre(S.suc)) + '</h2>';
  if(c.cerrado && S.corteHoy){
    var d = Number(S.corteHoy.diferencia);
    h += '<div class="box"><div class="in"><h3>Día cerrado</h3>' +
      '<p>Esperado: <b>' + fm(S.corteHoy.esperado) + '</b> · Contado: <b>' + fm(S.corteHoy.contado) + '</b></p>' +
      '<p class="money">' + (d === 0 ? 'Cuadra, sin diferencia' : (d > 0 ? 'Sobran ' + fm(d) : 'Faltan ' + fm(-d))) + '</p>' +
      (S.corteHoy.nota ? '<p>Nota: ' + esc(S.corteHoy.nota) + '</p>' : '') +
      '<p style="color:#5c4f4c">Solo el Administrador puede reabrir el día.</p></div></div>';
    return h;
  }
  h += '<div class="box"><div class="in">' +
    '<table><tr><td>Fondo inicial</td><td><b>' + fm(c.fondo) + '</b></td></tr>' +
    '<tr><td>Ventas y cobros en efectivo</td><td><b>+ ' + fm(c.efectivo) + '</b></td></tr>' +
    '<tr><td>Tarjeta (no va en la caja)</td><td>' + fm(c.tarjeta) + '</td></tr>' +
    '<tr><td>Transferencia (no va en la caja)</td><td>' + fm(c.transferencia) + '</td></tr></table>' +
    '<div class="grid2"><div class="fld"><label for="coR">Retiros o gastos pagados de la caja</label><input id="coR" type="text" inputmode="decimal" value="0"></div>' +
    '<div class="fld"><label for="coC">Efectivo que contaste</label><input id="coC" type="text" inputmode="decimal"></div></div>' +
    '<p class="money" id="coEsp"></p>' +
    '<div class="fld"><label for="coN">Nota (obligatoria si hay diferencia)</label><input id="coN" type="text" maxlength="300"></div>' +
    '<div class="acts"><button class="btn-r" data-a="corteOk">Confirmar y cerrar el día</button></div>' +
    '<div class="fld"><div class="note">Al cerrar, ya no se pueden cobrar ni cancelar ventas de hoy.</div></div></div></div>';
  return h;
}
function actualizarEsperado(){
  var c = S.caja || {}; var r = num(E.val('coR')); if(isNaN(r)) r = 0;
  var esp = Number(c.fondo || 0) + Number(c.efectivo || 0) - r;
  var el = E.$('coEsp'); if(!el) return;
  var cont = num(E.val('coC'));
  var t = 'Debería haber ' + fm(esp);
  if(!isNaN(cont)){ var d = Math.round((cont - esp) * 100) / 100; t += d === 0 ? ' · Cuadra' : (d > 0 ? ' · Sobran ' + fm(d) : ' · Faltan ' + fm(-d)); }
  el.textContent = t;
}
async function corteOk(){
  var r = num(val('coR')), c = num(val('coC'));
  if(isNaN(r) || r < 0) throw new Error('Retiros inválidos.');
  if(isNaN(c) || c < 0) throw new Error('Escribe el efectivo que contaste.');
  var x = await sb.rpc('et_registrar_corte', {p_retiros:r, p_contado:c, p_nota: val('coN').trim(), p_suc: S.suc});
  if(x.error) throw x.error;
  E.ok('Día cerrado. El corte quedó guardado.');
  await cargarCorte();
}

Object.assign(E.VISTAS, {bebidas:vistaBebidas, pasteles:vistaPasteles, caja:vistaCaja, pedidos:vistaPedidos, ventas:vistaVentas, corte:vistaCorte});
Object.assign(E.CARGAS, {bebidas:cargarMenu, pasteles:cargarPasteles, caja:cargarCaja, pedidos:cargarPedidos, ventas:cargarVentas, corte:cargarCorte});
Object.assign(E, {menuNuevo:menuNuevo, menuEdit:menuEdit, menuTog:menuTog, opcNuevo:opcNuevo, opcEdit:opcEdit, opcTog:opcTog, baseSave:baseSave,
  agregar:agregar, cobrar:cobrar, repintarCaja:repintarCaja, pedNuevo:pedNuevo, salCobrar:salCobrar, cvOk:cvOk, corteOk:corteOk,
  actualizarEsperado:actualizarEsperado, cargarCaja:cargarCaja});
})();

/* ================= Bloque 3: Administrador (resumen, costos, historial, equipo) ================= */
(function(){
'use strict';
var E = window.__ET, sb = E.sb, S = E.S, esc = E.esc, fm = E.fm, num = E.num, val = E.val;

async function todo(fabrica){
  var out = [], de = 0, paso = 1000;
  for(;;){
    var r = await fabrica().range(de, de + paso - 1);
    if(r.error) throw r.error;
    out = out.concat(r.data || []);
    if(!r.data || r.data.length < paso) break;
    de += paso;
  }
  return out;
}
function rango(){
  var h = S.hoy;
  if(S.periodo === 'hoy') return [h, h];
  if(S.periodo === 'ayer'){ var a = E.sumarDias(h, -1); return [a, a]; }
  if(S.periodo === '7') return [E.sumarDias(h, -6), h];
  if(S.periodo === '30') return [E.sumarDias(h, -29), h];
  if(S.periodo === 'mes') return [h.slice(0,8) + '01', h];
  var d = S.desde || h, x = S.hasta || h;
  return d <= x ? [d, x] : [x, d];
}
async function nombres(){
  var r = await sb.from('perfiles').select('id,nombre,rol,activo,sucursal').order('nombre');
  if(r.error) throw r.error;
  S.perfiles = r.data || [];
  S.nom = {}; S.perfiles.forEach(function(p){ S.nom[p.id] = p.nombre; });
}

/* ---------- Resumen ---------- */
async function cargarResumen(){
  var rg = rango();
  S.rg = rg;
  var suc = S.rsuc === 'todas' ? null : S.rsuc;
  S.rv = await todo(function(){
    var q = sb.from('ventas').select('id,fecha,creada,tipo,metodo,total,estado,motivo_cancel,cancelada,creado_por,cancelada_por,sucursal,venta_items(id,nombre,cantidad,tamano,precio_unit,subtotal,origen,promo,descuento,venta_costos(costo_unit))')
      .gte('fecha', rg[0]).lte('fecha', rg[1]);
    if(suc) q = q.eq('sucursal', suc);
    return q.order('id');
  });
  var cq = sb.from('cortes').select('*').gte('fecha', rg[0]).lte('fecha', rg[1]);
  if(suc) cq = cq.eq('sucursal', suc);
  var c = await cq.order('fecha', {ascending:false});
  if(c.error) throw c.error; S.rc = c.data || [];
  var pq = sb.from('pedidos_pastel').select('total,pagado').eq('estado','pendiente');
  if(suc) pq = pq.eq('sucursal', suc);
  var p = await pq;
  if(p.error) throw p.error; S.saldoPend = (p.data || []).reduce(function(s, x){ return s + (x.total - x.pagado); }, 0);
  await E.cargarSucursales();
  await nombres();
}
function costoDe(it){ var vc = it.venta_costos; if(Array.isArray(vc)) vc = vc[0]; return vc ? Number(vc.costo_unit) : null; }
function calc(){
  var R = {total:0, mostrador:0, tickets:0, anticipos:0, metodo:{efectivo:0, tarjeta:0, transferencia:0}, dias:{}, prods:{},
    ingresoConCosto:0, costo:0, sinCosto:0, ingresoSinCosto:0, cancel:[], porSuc:{}};
  S.rv.forEach(function(v){
    if(v.estado === 'cancelada'){ R.cancel.push(v); return; }
    var t = Number(v.total);
    R.total += t; R.metodo[v.metodo] += t; R.dias[v.fecha] = (R.dias[v.fecha] || 0) + t;
    R.porSuc[v.sucursal] = (R.porSuc[v.sucursal] || 0) + t;
    if(v.tipo === 'venta'){
      R.mostrador += t; R.tickets++;
      (v.venta_items || []).forEach(function(it){
        var k = it.nombre + (it.tamano === 'g' ? ' (G)' : it.tamano === 'ch' ? ' (Ch)' : '');
        R.prods[k] = R.prods[k] || {n:0, $:0}; R.prods[k].n += it.cantidad; R.prods[k].$ += Number(it.subtotal);
        var cu = costoDe(it);
        if(cu == null){ R.sinCosto += it.cantidad; R.ingresoSinCosto += Number(it.subtotal); }
        else { R.ingresoConCosto += Number(it.subtotal); R.costo += cu * it.cantidad; }
      });
    } else R.anticipos += t;
  });
  return R;
}
function vistaResumen(){
  var R = calc(), rg = S.rg || [S.hoy, S.hoy];
  var P = [['hoy','Hoy'],['ayer','Ayer'],['7','7 días'],['30','30 días'],['mes','Este mes'],['rango','Elegir fechas']];
  var h = '<h2 style="margin-bottom:12px">Resumen</h2>';
  if(S.sucs.length > 1) h += '<div class="chips" aria-label="Sucursal">' + [['todas','Todas las sucursales']].concat(S.sucs.map(function(s){ return [s.id, s.nombre]; })).map(function(s){
    return '<button data-a="rsuc" data-s="' + esc(s[0]) + '" class="' + (S.rsuc === s[0] ? 'on' : '') + '">' + esc(s[1]) + '</button>'; }).join('') + '</div>';
  h += '<div class="chips">' + P.map(function(p){ return '<button data-a="per" data-p="' + p[0] + '" class="' + (S.periodo === p[0] ? 'on' : '') + '">' + p[1] + '</button>'; }).join('') + '</div>';
  if(S.periodo === 'rango') h += '<div class="form"><div class="grid3"><div class="fld"><label for="rD">Desde</label><input id="rD" type="date" value="' + esc(rg[0]) + '"></div><div class="fld"><label for="rH">Hasta</label><input id="rH" type="date" value="' + esc(rg[1]) + '"></div><div class="fld"><label>&nbsp;</label><button class="btn-r" data-a="rangoOk" style="width:100%">Ver</button></div></div></div>';
  var gan = R.ingresoConCosto - R.costo;
  h += '<div class="kpis">' +
    '<div class="kpi"><small>Ingresos totales</small><b>' + fm(R.total) + '</b><em>Incluye anticipos y saldos de pasteles</em></div>' +
    '<div class="kpi"><small>Ventas de mostrador</small><b>' + fm(R.mostrador) + '</b><em>' + R.tickets + ' tickets · promedio ' + fm(R.tickets ? R.mostrador / R.tickets : 0) + '</em></div>' +
    '<div class="kpi"><small>Ganancia real</small><b>' + fm(gan) + '</b><em>' + (R.sinCosto ? R.sinCosto + ' piezas vendidas sin costo capturado (' + fm(R.ingresoSinCosto) + ' fuera del cálculo)' : 'Todo lo vendido tiene costo') + '</em></div>' +
    '<div class="kpi"><small>Saldos de pasteles por cobrar</small><b>' + fm(S.saldoPend) + '</b><em>Anticipos y saldos cobrados: ' + fm(R.anticipos) + '</em></div></div>';
  var dias = Object.keys(R.dias).sort(), mx = Math.max.apply(null, [1].concat(dias.map(function(d){ return R.dias[d]; })));
  h += '<div class="box"><h3>Ingresos por día</h3>' + (dias.length ? '<div class="bars">' + dias.map(function(d){
    return '<div class="bc"><span>' + fm(R.dias[d]) + '</span><div class="bb" style="height:' + Math.max(2, Math.round(R.dias[d] / mx * 110)) + 'px"></div><span>' + d.slice(8) + '/' + d.slice(5,7) + '</span></div>'; }).join('') + '</div>' : '<div class="empty">Sin ventas en este periodo.</div>') + '</div>';
  if(S.rsuc === 'todas' && S.sucs.length > 1){
    var mxs = Math.max.apply(null, [1].concat(S.sucs.map(function(s){ return R.porSuc[s.id] || 0; })));
    h += '<div class="box"><h3>Por sucursal</h3>' + S.sucs.map(function(s){
      var v = R.porSuc[s.id] || 0;
      return '<div class="hbar"><span class="l">' + esc(s.nombre) + '</span><div class="t"><div class="f" style="width:' + Math.round(v / mxs * 100) + '%"></div></div><span class="v">' + fm(v) + '</span></div>'; }).join('') + '<div style="height:8px"></div></div>';
  }
  h += '<div class="box"><h3>Cómo pagaron</h3>' + ['efectivo','tarjeta','transferencia'].map(function(m){
    var pc = R.total ? Math.round(R.metodo[m] / R.total * 100) : 0;
    return '<div class="hbar"><span class="l">' + m.charAt(0).toUpperCase() + m.slice(1) + '</span><div class="t"><div class="f" style="width:' + pc + '%"></div></div><span class="v">' + fm(R.metodo[m]) + '</span></div>'; }).join('') + '<div style="height:8px"></div></div>';
  var top = Object.keys(R.prods).map(function(k){ return [k, R.prods[k]]; }).sort(function(a, b){ return b[1].n - a[1].n; }).slice(0, 10);
  var tm = top.length ? top[0][1].n : 1;
  h += '<div class="box"><h3>Lo que más se vende</h3>' + (top.length ? top.map(function(t){
    return '<div class="hbar"><span class="l">' + esc(t[0]) + '</span><div class="t"><div class="f" style="width:' + Math.round(t[1].n / tm * 100) + '%"></div></div><span class="v">' + t[1].n + ' · ' + fm(t[1].$) + '</span></div>'; }).join('') + '<div style="height:8px"></div>' : '<div class="empty">Sin ventas.</div>') + '</div>';
  h += '<div class="box"><h3>Cortes de caja</h3>';
  if(!S.rc.length) h += '<div class="empty">No hay cortes en este periodo.</div>';
  else h += '<div class="scroll"><table><tr><th>Fecha</th><th>Sucursal</th><th>Esperado</th><th>Contado</th><th>Diferencia</th><th>Nota</th><th>Hizo el corte</th><th></th></tr>' + S.rc.map(function(c){
    var d = Number(c.diferencia), kc = c.fecha + '|' + c.sucursal;
    return '<tr><td>' + esc(c.fecha) + '</td><td>' + esc(E.sucNombre(c.sucursal)) + '</td><td>' + fm(c.esperado) + '</td><td>' + fm(c.contado) + '</td><td><b>' + (d === 0 ? 'Cuadra' : (d > 0 ? 'Sobran ' + fm(d) : 'Faltan ' + fm(-d))) + '</b></td><td>' + esc(c.nota || '') + '</td><td>' + esc(S.nom[c.creado_por] || '') + '</td><td>' +
      (S.abierto === 'reab:' + kc ? '<button class="btn-r btn-s" data-a="reabrir" data-f="' + esc(c.fecha) + '" data-s="' + esc(c.sucursal) + '">Sí, reabrir</button> <button class="btn-o btn-s" data-a="cerrar">No</button>' : '<button class="btn-o btn-s" data-a="abrir" data-k="reab:' + esc(kc) + '">Reabrir día</button>') + '</td></tr>'; }).join('') + '</table></div>';
  h += '</div>';
  h += '<div class="box"><h3>Cancelaciones (' + R.cancel.length + ')</h3>' + (R.cancel.length ? '<div class="scroll"><table><tr><th>Ticket</th><th>Fecha</th><th>Monto</th><th>Motivo</th><th>Canceló</th></tr>' + R.cancel.slice().reverse().map(function(v){
    return '<tr><td>#' + v.id + '</td><td>' + esc(v.fecha) + ' ' + (v.cancelada ? E.horaMX(v.cancelada) : '') + '</td><td>' + fm(v.total) + '</td><td>' + esc(v.motivo_cancel || '') + '</td><td>' + esc(S.nom[v.cancelada_por] || '') + '</td></tr>'; }).join('') + '</table></div>' : '<div class="empty">Sin cancelaciones.</div>') + '</div>';
  var promos = {};
  S.rv.forEach(function(v){ if(v.estado !== 'cobrada') return; (v.venta_items || []).forEach(function(it){ if(it.promo && Number(it.descuento) > 0){ var k = it.nombre + ' · ' + it.promo; promos[k] = promos[k] || {n:0, d:0}; promos[k].n += it.cantidad; promos[k].d += Number(it.descuento); } }); });
  var pk = Object.keys(promos);
  h += '<div class="box"><h3>Promociones aplicadas</h3>' + (pk.length ? '<div class="scroll"><table><tr><th>Producto y promoción</th><th>Piezas</th><th>Descuento dado</th></tr>' + pk.map(function(k){ return '<tr><td>' + esc(k) + '</td><td>' + promos[k].n + '</td><td>' + fm(promos[k].d) + '</td></tr>'; }).join('') + '</table></div>' : '<div class="empty">No se aplicaron promociones en este periodo.</div>') + '</div>';
  var sf = S.rsuc === 'todas' ? S.suc : S.rsuc;
  var sfo = S.sucs.filter(function(x){ return x.id === sf; })[0] || {};
  var fondo = sfo.fondo_caja;
  h += '<div class="box"><div class="row"><div class="nm"><b>Fondo de caja · ' + esc(E.sucNombre(sf)) + '</b><small>Efectivo con el que abre la caja cada día (se usa en el corte)</small></div><span class="money">' + (fondo == null ? '$0' : fm(fondo)) + '</span><button class="btn-p btn-s" data-a="abrir" data-k="fondo">Cambiar</button></div>' +
    (S.abierto === 'fondo' ? '<div class="inline"><div class="fld"><label for="fnV">Fondo de caja</label><input id="fnV" type="text" inputmode="decimal" value="' + esc(fondo == null ? '' : fondo) + '"></div><div class="acts"><button class="btn-o" data-a="cerrar">Cancelar</button><button class="btn-r" data-a="fondoOk">Guardar</button></div></div>' : '') + '</div>';
  h += '<div class="ctl"><button class="btn-y" data-a="excel">Descargar Excel del periodo (para el contador)</button></div>';
  return h;
}
function csvCampo(v){
  var s = String(v == null ? '' : v);
  if(/^[=+\-@\t\r]/.test(s)) s = "'" + s;            // evita fórmulas maliciosas al abrir en Excel
  return '"' + s.replace(/"/g,'""') + '"';
}
function excel(){
  var L = [['Sucursal','Fecha','Hora','Ticket','Tipo','Producto','Tamaño','Cantidad','Precio unitario','Promoción','Descuento','Subtotal','Costo unitario','Ganancia','Método de pago','Estado','Motivo cancelación']];
  S.rv.forEach(function(v){
    var base = [E.sucNombre(v.sucursal), v.fecha, E.horaMX(v.creada), v.id, v.tipo];
    var fin = [v.metodo, v.estado, v.motivo_cancel || ''];
    if(v.tipo === 'venta' && (v.venta_items || []).length){
      v.venta_items.forEach(function(it){
        var cu = costoDe(it);
        L.push(base.concat([it.nombre, it.tamano === 'g' ? 'Grande' : it.tamano === 'ch' ? 'Chico' : '', it.cantidad, it.precio_unit, it.promo || '', it.descuento || 0, it.subtotal, cu == null ? '' : cu, cu == null ? '' : (Number(it.subtotal) - cu * it.cantidad).toFixed(2)]).concat(fin));
      });
    } else L.push(base.concat([v.tipo === 'anticipo' ? 'Anticipo de pastel' : 'Saldo de pastel', '', 1, v.total, '', 0, v.total, '', '']).concat(fin));
  });
  var txt = '\ufeff' + L.map(function(r){ return r.map(csvCampo).join(','); }).join('\r\n');
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], {type:'text/csv;charset=utf-8'}));
  a.download = 'ventas-el-taller_' + (S.rsuc === 'todas' ? 'todas' : S.rsuc) + '_' + S.rg[0] + '_a_' + S.rg[1] + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 2000);
}
async function reabrir(f, suc){
  var r = await sb.rpc('et_reabrir_dia', {p_fecha: f, p_suc: suc});
  if(r.error) throw r.error;
  S.abierto = null; E.ok('Día ' + f + ' reabierto.');
  await cargarResumen();
}
async function fondoOk(){
  var v = num(val('fnV')); if(isNaN(v) || v < 0) throw new Error('Monto inválido.');
  var sf = S.rsuc === 'todas' ? S.suc : S.rsuc;
  var r = await sb.rpc('et_guardar_fondo', {p_suc: sf, p_fondo: v});
  if(r.error) throw r.error;
  await E.cargarSucursales();
  S.abierto = null; E.ok('Fondo de caja de ' + E.sucNombre(sf) + ' guardado.');
}

/* ---------- Costos ---------- */
async function cargarCostos(){
  var r = await sb.from('costos').select('*').order('nombre');
  if(r.error) throw r.error;
  S.costos = r.data || [];
}
var TIPO_C = {menu:'Bebida / bowl', dia:'Menú del día', opcion:'Pastel (opción)', pedido:'Pedido'};
function vistaCostos(){
  var h = '<h2 style="margin-bottom:6px">Costos de materiales</h2><p style="margin:0 0 14px;color:#5c4f4c">Los empleados pueden capturarlos pero no verlos. Con estos datos se calcula la ganancia real del Resumen.</p><div class="box">';
  if(!S.costos.length) h += '<div class="empty">Todavía no hay costos capturados.</div>';
  S.costos.forEach(function(c){
    var tipo = c.clave.split(':')[0];
    h += '<div class="row"><div class="nm"><b>' + esc(c.nombre) + '</b><small>' + (TIPO_C[tipo] || tipo) + ' · actualizado ' + E.fechaHoraMX(c.actualizado) + '</small></div>' +
      '<span class="money">' + fm(c.costo) + (c.costo_grande != null ? ' / G ' + fm(c.costo_grande) : '') + '</span>' +
      '<button class="btn-p btn-s" data-a="abrir" data-k="cc:' + esc(c.clave) + '">Cambiar</button></div>';
    if(S.abierto === 'cc:' + c.clave) h += E.costoForm(c.clave, c.nombre, tipo === 'menu');
  });
  return h + '</div>';
}

/* ---------- Historial ---------- */
async function cargarHistorial(){
  var r = await sb.from('historial_precios').select('*').order('en', {ascending:false}).limit(300);
  if(r.error) throw r.error;
  S.hist = r.data || [];
  await nombres();
}
var TABLA = {menu_items:'Menú de bebidas', productos_dia:'Menú del día', pastel_opciones:'Pasteles', ajustes:'Ajuste', costos:'Costos'};
var CAMPO = {precio:'Precio', precio_grande:'Precio grande', costo:'Costo', costo_grande:'Costo grande', valor:'Valor', alta:'Alta', activo:'Visible', promo:'Promoción'};
function vistaHistorial(){
  var h = '<h2 style="margin-bottom:12px">Historial de cambios</h2><div class="box"><div class="scroll"><table><tr><th>Cuándo</th><th>Quién</th><th>Dónde</th><th>Qué</th><th>Cambio</th></tr>';
  if(!S.hist.length) h += '<tr><td colspan="5">Todavía no hay cambios.</td></tr>';
  S.hist.forEach(function(x){
    var cambio;
    if(x.campo === 'promo') cambio = esc(x.detalle || '');
    else if(x.campo === 'alta') cambio = 'Agregado' + (x.despues != null ? ' con ' + fm(x.despues) : '');
    else if(x.campo === 'activo') cambio = Number(x.despues) === 1 ? 'Se prendió' : 'Se apagó';
    else cambio = fm(x.antes) + ' → ' + fm(x.despues);
    var nomX = {pastel_base:'Precio base del pastel', fondo_caja:'Fondo de caja'}[x.nombre] || x.nombre;
    h += '<tr><td>' + E.fechaHoraMX(x.en) + '</td><td>' + esc(S.nom[x.por] || 'Sistema') + '</td><td>' + (TABLA[x.tabla] || esc(x.tabla)) + '</td><td>' + esc(nomX) + ' <small>(' + (CAMPO[x.campo] || esc(x.campo)) + ')</small></td><td><b>' + cambio + '</b></td></tr>';
  });
  return h + '</table></div></div>';
}

/* ---------- Equipo ---------- */
async function cargarEquipo(){
  await nombres();
  var s = await sb.rpc('et_sesiones'); if(s.error) throw s.error; S.ses = s.data || [];
  var i = await sb.from('invitaciones').select('*').order('creado', {ascending:false}).limit(30); if(i.error) throw i.error; S.inv = i.data || [];
  await E.cargarSucursales();
}
function dispositivo(ua){
  ua = ua || '';
  var so = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Dispositivo';
  var nav = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return so + (nav ? ' · ' + nav : '');
}
function vistaEquipo(){
  var h = '<h2 style="margin-bottom:12px">Equipo</h2>';
  h += '<div class="box"><h3>Personas</h3>';
  S.perfiles.forEach(function(p){
    var yo = S.user && p.id === S.user.id;
    var n = S.ses.filter(function(s){ return s.usuario === p.id; }).length;
    var selP = (p.rol === 'trabajador' && S.sucs.length > 1)
      ? '<label class="mini"><span>Sucursal</span><select data-a="perSuc" data-id="' + esc(p.id) + '" aria-label="Sucursal de ' + esc(p.nombre) + '"><option value="">Todas</option>' + S.sucs.map(function(s){ return '<option value="' + esc(s.id) + '"' + (p.sucursal === s.id ? ' selected' : '') + '>' + esc(s.nombre) + '</option>'; }).join('') + '</select></label>'
      : '';
    h += '<div class="row' + (p.activo ? '' : ' off') + '"><div class="nm"><b>' + esc(p.nombre) + (yo ? ' (tú)' : '') + '</b><small>' + (p.rol === 'trabajador' ? 'Empleado · ' + (p.sucursal ? esc(E.sucNombre(p.sucursal)) : 'todas las sucursales') : 'Administrador · todas las sucursales') + ' · ' + n + ' dispositivo(s) conectado(s)</small></div>' + selP +
      '<span class="tag ' + (p.activo ? 'y' : 'g') + '">' + (p.activo ? 'Activo' : 'Desactivado') + '</span>' +
      (yo ? '' : (p.activo ? '<button class="btn-o btn-s" data-a="abrir" data-k="des:' + p.id + '">Desactivar</button>' : '<button class="btn-y btn-s" data-a="react" data-id="' + p.id + '">Reactivar</button>')) + '</div>';
    if(S.abierto === 'des:' + p.id) h += '<div class="inline">¿Desactivar a <b>' + esc(p.nombre) + '</b>? Se cierran todos sus dispositivos y ya no podrá entrar.<div class="acts"><button class="btn-o" data-a="cerrar">No</button><button class="btn-r" data-a="desOk" data-id="' + p.id + '">Sí, desactivar</button></div></div>';
  });
  h += '</div>';
  h += '<div class="box"><h3>Dispositivos conectados (' + S.ses.length + ')</h3>';
  if(!S.ses.length) h += '<div class="empty">No hay sesiones abiertas.</div>';
  S.ses.forEach(function(s){
    h += '<div class="row"><div class="nm"><b>' + esc(s.nombre) + ' · ' + esc(dispositivo(s.dispositivo)) + '</b><small>Entró ' + E.fechaHoraMX(s.inicio) + ' · último uso ' + E.fechaHoraMX(s.ultimo_uso) + (s.ip ? ' · IP ' + esc(s.ip) : '') + '</small></div>' +
      '<button class="btn-o btn-s" data-a="sesCerrar" data-id="' + esc(s.sesion) + '">Cerrar sesión</button></div>';
  });
  h += '<div class="in" style="font-size:13px;color:#5c4f4c">Al cerrar una sesión, ese dispositivo pierde el acceso en máximo una hora (o de inmediato al recargar).</div></div>';
  h += '<div class="box"><h3>Códigos de invitación</h3><div class="in">' +
    '<div class="grid3"><div class="fld"><label for="ivD">Válido por (días)</label><input id="ivD" type="number" min="1" max="30" value="7"></div>' +
    '<div class="fld"><label for="ivU">Personas que lo pueden usar</label><input id="ivU" type="number" min="1" max="50" value="1"></div>' +
    '<div class="fld"><label for="ivS">Sucursal</label><select id="ivS"><option value="">Todas</option>' + S.sucs.map(function(s){ return '<option value="' + esc(s.id) + '"' + (s.id === S.suc ? ' selected' : '') + '>' + esc(s.nombre) + '</option>'; }).join('') + '</select></div></div>' +
    '<div class="acts" style="justify-content:flex-start"><button class="btn-r" data-a="invCrear">Generar código</button></div>';
  if(S.codigoNuevo) h += '<div style="margin-top:12px">Comparte este código con tu equipo:<br><span class="code">' + esc(S.codigoNuevo) + '</span><div class="ctl"><button class="btn-y btn-s" data-a="invCopiar">Copiar</button><button class="btn-p btn-s" data-a="invWa">Enviar por WhatsApp</button></div></div>';
  h += '</div>';
  S.inv.forEach(function(i){
    var vig = i.activo && new Date(i.expira) > new Date() && i.usos < i.usos_max;
    h += '<div class="row' + (vig ? '' : ' off') + '"><div class="nm"><b style="font-family:monospace;letter-spacing:2px">' + esc(i.codigo) + '</b><small>' + (i.sucursal ? esc(E.sucNombre(i.sucursal)) : 'Todas las sucursales') + ' · usado ' + i.usos + ' de ' + i.usos_max + ' · vence ' + E.fechaHoraMX(i.expira) + '</small></div>' +
      '<span class="tag ' + (vig ? 'y' : 'g') + '">' + (vig ? 'Vigente' : 'No vigente') + '</span>' +
      (vig ? '<button class="btn-o btn-s" data-a="invOff" data-id="' + esc(i.codigo) + '">Desactivar</button>' : '') + '</div>';
  });
  return h + '</div>';
}
async function desOk(id){ var r = await sb.rpc('et_desactivar', {p_usuario:id}); if(r.error) throw r.error; S.abierto = null; E.ok('Cuenta desactivada y sesiones cerradas.'); await cargarEquipo(); }
async function react(id){ var r = await sb.from('perfiles').update({activo:true}).eq('id', id).select(); if(r.error) throw r.error; E.ok('Cuenta reactivada.'); await cargarEquipo(); }
async function sesCerrar(id){ var r = await sb.rpc('et_cerrar_sesion', {p_sesion:id}); if(r.error) throw r.error; E.ok('Sesión cerrada.'); await cargarEquipo(); }
async function invCrear(){
  var d = parseInt(val('ivD'), 10), u = parseInt(val('ivU'), 10);
  if(!(d >= 1 && d <= 30)) throw new Error('Días entre 1 y 30.');
  if(!(u >= 1 && u <= 50)) throw new Error('Personas entre 1 y 50.');
  var s = val('ivS') || null;
  var r = await sb.rpc('et_crear_invitacion', {p_dias:d, p_usos:u, p_suc:s}); if(r.error) throw r.error;
  S.codigoNuevo = r.data; S.codigoSuc = s; E.ok('Código generado' + (s ? ' para ' + E.sucNombre(s) : '') + '.'); await cargarEquipo();
}
async function invOff(c){ var r = await sb.from('invitaciones').update({activo:false}).eq('codigo', c); if(r.error) throw r.error; await cargarEquipo(); }
function invTexto(){ return 'Te invito al panel de El Taller Repostería' + (S.codigoSuc ? ' (' + E.sucNombre(S.codigoSuc) + ')' : '') + '. Entra a ' + location.origin + location.pathname + ', elige "Soy nuevo: tengo un código" y usa este código: ' + S.codigoNuevo; }
async function perSuc(id, suc){
  var r = await sb.from('perfiles').update({sucursal: suc || null}).eq('id', id).select();
  if(r.error) throw r.error;
  E.ok('Sucursal actualizada. Si la persona tiene el panel abierto, verá el cambio al recargar.');
  await cargarEquipo();
}

/* ---------- Sucursales (Administrador) ---------- */
async function cargarSucAdmin(){ await E.cargarSucursales(); }
function sucForm(s){
  var e = s || {}, k = s ? s.id : 'nueva';
  var w = e.whatsapp ? String(e.whatsapp).replace(/^52/, '') : '';
  return '<div class="' + (s ? 'inline' : 'form') + '">' + (s ? '' : '<h3>Nueva sucursal</h3>') +
    '<div class="grid2">' +
    '<div class="fld"><label for="sN_' + k + '">Nombre</label><input id="sN_' + k + '" type="text" maxlength="60" value="' + esc(e.nombre) + '" placeholder="Sucursal Querétaro"></div>' +
    '<div class="fld"><label for="sC_' + k + '">Ciudad</label><input id="sC_' + k + '" type="text" maxlength="60" value="' + esc(e.ciudad) + '"></div>' +
    '<div class="fld"><label for="sW_' + k + '">WhatsApp (10 dígitos)</label><input id="sW_' + k + '" type="tel" inputmode="numeric" maxlength="14" value="' + esc(w) + '"></div>' +
    '<div class="fld"><label for="sD_' + k + '">Dirección</label><input id="sD_' + k + '" type="text" maxlength="160" value="' + esc(e.direccion) + '"></div>' +
    '</div>' +
    '<div class="fld"><label><input id="sA_' + k + '" type="checkbox"' + (e.activa === false ? '' : ' checked') + '> Mostrar en el sitio</label><div class="note">Si la apagas, los clientes ya no pueden elegirla ni hacer pedidos ahí.</div></div>' +
    '<div class="acts"><button class="btn-o" data-a="cerrar">Cancelar</button><button class="btn-r" data-a="sucGuardar" data-id="' + esc(k) + '">Guardar</button></div></div>';
}
function vistaSucAdmin(){
  var h = '<h2 style="margin-bottom:6px">Sucursales</h2><p style="margin:0 0 14px;color:#5c4f4c">Cada sucursal tiene su propio menú, precios, caja, corte y pedidos en línea. El WhatsApp de cada una es al que escriben los clientes desde el sitio.</p>' +
    '<div class="ctl" style="margin-bottom:14px"><button class="btn-y" data-a="abrir" data-k="sucNueva">+ Nueva sucursal</button></div>';
  if(S.abierto === 'sucNueva') h += sucForm(null);
  h += '<div class="box">';
  S.sucs.forEach(function(s){
    h += '<div class="row' + (s.activa ? '' : ' off') + '"><div class="nm"><b>' + esc(s.nombre) + '</b><small>' + esc(s.ciudad || 'Sin ciudad') + ' · ' + (s.whatsapp ? 'WhatsApp ' + esc(String(s.whatsapp).replace(/^52/, '')) : 'Sin WhatsApp (se usa el de Plaza Pascal)') + '</small>' +
      '<small>' + (s.activa ? '<span class="tag y">En el sitio</span>' : '<span class="tag g">Oculta</span>') + ' ' + (s.pedidos_activos ? '<span class="tag y">Recibe pedidos</span>' : '<span class="tag g">Pedidos en pausa</span>') + '</small></div>' +
      '<button class="btn-p btn-s" data-a="abrir" data-k="suc:' + esc(s.id) + '">Editar</button></div>';
    if(S.abierto === 'suc:' + s.id) h += sucForm(s);
  });
  h += '</div>';
  if(S.sucs.length > 1){
    var op = S.sucs.map(function(s){ return '<option value="' + esc(s.id) + '">' + esc(s.nombre) + '</option>'; }).join('');
    h += '<div class="box"><h3>Copiar menú de bebidas y desayunos</h3><div class="in">' +
      '<p style="margin:0 0 10px;color:#5c4f4c">Copia los productos con sus precios, fotos y costos. Lo que ya exista en la sucursal destino no se toca. Después puedes cambiar los precios de cada una por separado.</p>' +
      '<div class="grid3"><div class="fld"><label for="cmD">Copiar de</label><select id="cmD">' + op + '</select></div>' +
      '<div class="fld"><label for="cmH">A</label><select id="cmH">' + S.sucs.map(function(s, i){ return '<option value="' + esc(s.id) + '"' + (i === 1 ? ' selected' : '') + '>' + esc(s.nombre) + '</option>'; }).join('') + '</select></div>' +
      '<div class="fld"><label>&nbsp;</label><button class="btn-r" data-a="copiarMenu" style="width:100%">Copiar menú</button></div></div></div></div>';
  }
  return h;
}
function slug(t){ return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^sucursal\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20); }
async function sucGuardar(k){
  var nombre = val('sN_' + k).trim();
  if(nombre.length < 2) throw new Error('Escribe el nombre de la sucursal.');
  var w = val('sW_' + k).replace(/\D/g, '');
  if(w && w.length !== 10 && !(w.length === 12 && w.indexOf('52') === 0)) throw new Error('El WhatsApp debe tener 10 dígitos.');
  var id = k;
  if(k === 'nueva'){
    id = slug(nombre);
    if(id.length < 2) throw new Error('Usa un nombre con letras o números.');
    if(S.sucs.some(function(s){ return s.id === id; })) throw new Error('Ya existe una sucursal con un nombre parecido.');
  }
  var r = await sb.rpc('et_guardar_sucursal', {p_id:id, p_nombre:nombre, p_ciudad:val('sC_' + k), p_direccion:val('sD_' + k), p_whatsapp:w, p_activa:E.checked('sA_' + k)});
  if(r.error) throw r.error;
  await E.cargarSucursales();
  S.abierto = null; E.ok('Sucursal guardada.');
}
async function copiarMenu(){
  var de = val('cmD'), a = val('cmH');
  if(de === a) throw new Error('Elige dos sucursales distintas.');
  var r = await sb.rpc('et_copiar_menu', {p_desde:de, p_hacia:a});
  if(r.error) throw r.error;
  E.ok(r.data ? 'Se copiaron ' + r.data + ' productos a ' + E.sucNombre(a) + '.' : E.sucNombre(a) + ' ya tenía todos esos productos.');
}

Object.assign(E.VISTAS, {resumen:vistaResumen, costos:vistaCostos, historial:vistaHistorial, equipo:vistaEquipo, sucursales:vistaSucAdmin});
Object.assign(E.CARGAS, {resumen:cargarResumen, costos:cargarCostos, historial:cargarHistorial, equipo:cargarEquipo, sucursales:cargarSucAdmin});
Object.assign(E, {excel:excel, reabrir:reabrir, fondoOk:fondoOk, desOk:desOk, react:react, sesCerrar:sesCerrar, invCrear:invCrear, invOff:invOff, invTexto:invTexto, cargarResumen:cargarResumen,
  perSuc:perSuc, sucGuardar:sucGuardar, copiarMenu:copiarMenu});
})();


/* ================= Bloque 3b: Pedidos en línea ================= */
(function(){
'use strict';
var E = window.__ET, sb = E.sb, S = E.S, esc = E.esc, fm = E.fm, val = E.val;

var EST = {nuevo:'Nuevo', preparando:'En preparación', listo:'Listo para recoger', entregado:'Entregado', cancelado:'Cancelado', vencido:'No lo recogieron'};
function hhmm(t){ return t ? String(t).slice(0, 5) : ''; }
async function cargarEnLinea(){
  await sb.rpc('et_revisar_pedidos', {p_suc: S.suc});      // vence los que no se recogieron a tiempo
  var r = await sb.from('pedidos').select('*, pedido_items(nombre,cantidad,tamano,subtotal,promo,origen)')
    .eq('sucursal', S.suc).or('estado.in.(nuevo,preparando,listo),fecha.eq.' + S.hoy).order('recoger');
  if(r.error) throw r.error;
  S.pedl = r.data || [];
  S.nuevosEnLinea = S.pedl.filter(function(p){ return p.estado === 'nuevo'; }).length;
  S.actEnLinea = new Date();
  await E.cargarSucursales();
}
function minutosPara(ts){ return Math.round((new Date(ts) - new Date()) / 60000); }
function cuando(ts){
  var m = minutosPara(ts);
  if(m > 0) return 'en ' + (m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min');
  if(m === 0) return 'ahora';
  return 'hace ' + (-m >= 60 ? Math.floor(-m / 60) + ' h ' + (-m % 60) + ' min' : -m + ' min');
}
function detalle(p){
  return (p.pedido_items || []).map(function(i){
    return '<li><b>' + i.cantidad + ' ×</b> ' + esc(i.nombre) + (i.tamano === 'g' ? ' (grande)' : i.tamano === 'ch' ? ' (chico)' : '') + (i.promo ? ' <span class="tag r">' + esc(i.promo) + '</span>' : '') + '</li>';
  }).join('');
}
function tarjeta(p){
  var tarde = minutosPara(p.recoger) < 0;
  var h = '<div class="pedl est-' + p.estado + '">' +
    '<div class="pedl-top"><div><b class="folio">' + esc(p.folio || ('#' + p.id)) + '</b> · ' + esc(p.cliente) + '</div><span class="money">' + fm(p.total) + '</span></div>' +
    '<div class="pedl-meta"><span class="' + (tarde ? 'tarde' : '') + '">Recoge a las <b>' + E.horaMX(p.recoger) + '</b> (' + cuando(p.recoger) + ')</span> · <span>Paga en tienda</span> · <span>Tel. ' + esc(p.telefono) + '</span></div>' +
    '<ul class="pedl-items">' + detalle(p) + '</ul><div class="ctl">';
  if(p.estado === 'nuevo') h += '<button class="btn-r btn-s" data-a="enlEstado" data-id="' + p.id + '" data-e="preparando">Empezar a preparar</button>';
  if(p.estado === 'preparando') h += '<button class="btn-r btn-s" data-a="enlEstado" data-id="' + p.id + '" data-e="listo">Ya está listo</button>';
  h += '<button class="' + (p.estado === 'listo' ? 'btn-r' : 'btn-p') + ' btn-s" data-a="abrir" data-k="ent:' + p.id + '">Entregar y cobrar</button>' +
    '<button class="btn-y btn-s" data-a="enlWa" data-id="' + p.id + '">' + (p.estado === 'listo' ? 'Avisar que está listo' : 'Escribir al cliente') + '</button>' +
    '<button class="btn-o btn-s" data-a="abrir" data-k="pcan:' + p.id + '">Cancelar</button></div>';
  if(S.abierto === 'ent:' + p.id){
    h += '<div class="inline">Cobrar <b>' + fm(p.total) + '</b> a ' + esc(p.cliente) + ' con:<div class="pay" style="margin-top:8px">' +
      [['efectivo','Efectivo'],['tarjeta','Tarjeta'],['transferencia','Transferencia']].map(function(m){ return '<button data-a="enlEntregar" data-id="' + p.id + '" data-p="' + m[0] + '">' + m[1] + '</button>'; }).join('') +
      '</div><div class="fld"><div class="note">Queda registrado como venta en la caja de hoy. Las piezas ya estaban apartadas.</div></div><div class="acts"><button class="btn-o" data-a="cerrar">Volver</button></div></div>';
  }
  if(S.abierto === 'pcan:' + p.id){
    h += '<div class="inline"><div class="fld"><label for="pcM">Motivo</label><select id="pcM"><option value="">Elige un motivo</option><option>El cliente canceló</option><option>Se acabó un producto</option><option>Pedido falso o no contestan</option><option value="otro">Otro</option></select></div>' +
      '<div class="fld"><label for="pcO">Detalle (si elegiste "Otro")</label><input id="pcO" type="text" maxlength="200"></div>' +
      '<div class="fld"><div class="note">Las piezas apartadas regresan al menú del día.</div></div>' +
      '<div class="acts"><button class="btn-o" data-a="cerrar">Volver</button><button class="btn-r" data-a="enlCancelar" data-id="' + p.id + '">Cancelar pedido</button></div></div>';
  }
  return h + '</div>';
}
function ajustesForm(s){
  return '<div class="inline"><h3 style="margin-bottom:8px">Ajustes de pedidos en línea · ' + esc(s.nombre) + '</h3><div class="grid3">' +
    '<div class="fld"><label for="ajP">Minutos para preparar bebidas y desayunos</label><input id="ajP" type="number" min="5" max="120" step="5" value="' + esc(s.prep_min) + '"></div>' +
    '<div class="fld"><label for="ajL">Desayunos hasta las</label><input id="ajL" type="time" value="' + esc(hhmm(s.limite_desayunos)) + '"><div class="note">Vacío = todo el día.</div></div>' +
    '<div class="fld"><label for="ajT">Esperar al cliente (minutos)</label><input id="ajT" type="number" min="10" max="240" step="5" value="' + esc(s.tolerancia_min) + '"><div class="note">Después, el pedido se cancela solo y las piezas regresan al menú.</div></div>' +
    '<div class="fld"><label for="ajA">Reciben pedidos desde</label><input id="ajA" type="time" value="' + esc(hhmm(s.abre)) + '"></div>' +
    '<div class="fld"><label for="ajC">Hasta</label><input id="ajC" type="time" value="' + esc(hhmm(s.cierra)) + '"></div>' +
    '</div><div class="acts"><button class="btn-o" data-a="cerrar">Cancelar</button><button class="btn-r" data-a="enlAjustes">Guardar ajustes</button></div></div>';
}
function vistaEnLinea(){
  var s = E.sucActual() || {};
  var h = '<h2 style="margin-bottom:6px">Pedidos en línea · ' + esc(s.nombre || '') + '</h2>' +
    '<p style="margin:0 0 12px;color:#5c4f4c">Los clientes apartan desde el sitio y pagan al recoger. Esta pantalla se actualiza sola' + (S.actEnLinea ? ' (última vez ' + E.horaMX(S.actEnLinea) + ')' : '') + '.</p>';
  h += '<div class="box"><div class="row"><div class="nm"><b>' + (s.pedidos_activos ? 'Recibiendo pedidos' : 'Pedidos en pausa') + '</b><small>' +
    (s.pedidos_activos ? 'Horario ' + hhmm(s.abre) + ' a ' + hhmm(s.cierra) + ' · ' + s.prep_min + ' min de preparación' + (s.limite_desayunos ? ' · desayunos hasta las ' + hhmm(s.limite_desayunos) : '') : 'El sitio muestra los productos pero no deja pedir.') + '</small></div>' +
    '<span class="tag ' + (s.pedidos_activos ? 'y' : 'g') + '">' + (s.pedidos_activos ? 'Activo' : 'Pausado') + '</span>' +
    '<button class="' + (s.pedidos_activos ? 'btn-o' : 'btn-r') + ' btn-s" data-a="enlTog">' + (s.pedidos_activos ? 'Pausar pedidos' : 'Reanudar pedidos') + '</button>' +
    '<button class="btn-p btn-s" data-a="abrir" data-k="ajustes">Ajustes</button></div>';
  if(S.abierto === 'ajustes') h += ajustesForm(s);
  h += '</div>';
  var act = S.pedl.filter(function(p){ return ['nuevo','preparando','listo'].indexOf(p.estado) >= 0; });
  if(!act.length) h += '<div class="box"><div class="empty">No hay pedidos pendientes. Cuando un cliente confirme desde el sitio, aparece aquí y suena un aviso.</div></div>';
  [['nuevo','Nuevos'],['preparando','En preparación'],['listo','Listos para recoger']].forEach(function(g){
    var ps = act.filter(function(p){ return p.estado === g[0]; });
    if(!ps.length) return;
    h += '<div class="box"><h3>' + g[1] + ' <span class="tag">' + ps.length + '</span></h3><div class="in pedl-lista">' + ps.map(tarjeta).join('') + '</div></div>';
  });
  var cer = S.pedl.filter(function(p){ return ['entregado','cancelado','vencido'].indexOf(p.estado) >= 0; });
  if(cer.length){
    h += '<div class="box"><h3>Cerrados hoy (' + cer.length + ')</h3><div class="scroll"><table><tr><th>Folio</th><th>Cliente</th><th>Total</th><th>Estado</th></tr>' +
      cer.map(function(p){ return '<tr><td>' + esc(p.folio) + '</td><td>' + esc(p.cliente) + '</td><td>' + fm(p.total) + '</td><td>' + esc(EST[p.estado]) + (p.motivo_cancel ? ' · ' + esc(p.motivo_cancel) : '') + '</td></tr>'; }).join('') + '</table></div></div>';
  }
  return h;
}
function porId(id){ return S.pedl.filter(function(p){ return String(p.id) === String(id); })[0]; }
async function enlEstado(id, e){
  var r = await sb.rpc('et_pedido_estado', {p_pedido: Number(id), p_estado: e}); if(r.error) throw r.error;
  await cargarEnLinea();
}
async function enlEntregar(id, metodo){
  var p = porId(id);
  var r = await sb.rpc('et_entregar_pedido', {p_pedido: Number(id), p_metodo: metodo}); if(r.error) throw r.error;
  S.abierto = null; E.ok('Pedido ' + (p ? p.folio : '') + ' entregado y cobrado (venta #' + r.data + ').');
  await cargarEnLinea();
}
async function enlCancelar(id){
  var m = val('pcM'); if(m === 'otro') m = val('pcO').trim();
  if(!m || m.length < 3) throw new Error('Elige o escribe el motivo.');
  var r = await sb.rpc('et_cancelar_pedido', {p_pedido: Number(id), p_motivo: m}); if(r.error) throw r.error;
  S.abierto = null; E.ok('Pedido cancelado. Las piezas regresaron al menú.');
  await cargarEnLinea();
}
function enlWa(id){
  var p = porId(id); if(!p) return;
  var s = E.sucActual() || {};
  var txt = p.estado === 'listo'
    ? 'Hola ' + p.cliente + ', tu pedido ' + p.folio + ' de El Taller (' + (s.nombre || '') + ') ya está listo para recoger. Total ' + fm(p.total) + ', pagas al recoger. ¡Te esperamos!'
    : 'Hola ' + p.cliente + ', te escribimos de El Taller (' + (s.nombre || '') + ') sobre tu pedido ' + p.folio + '.';
  window.open('https://wa.me/52' + encodeURIComponent(p.telefono) + '?text=' + encodeURIComponent(txt), '_blank', 'noopener,noreferrer');
}
async function guardarAjustes(cambios){
  var s = E.sucActual(); if(!s) return;
  var x = Object.assign({p_suc:s.id, p_activos:s.pedidos_activos, p_prep:s.prep_min, p_limite:s.limite_desayunos || null,
    p_abre:hhmm(s.abre), p_cierra:hhmm(s.cierra), p_tolerancia:s.tolerancia_min}, cambios);
  var r = await sb.rpc('et_ajustes_pedidos', x); if(r.error) throw r.error;
  await E.cargarSucursales();
}
async function enlTog(){
  var s = E.sucActual(); if(!s) return;
  await guardarAjustes({p_activos: !s.pedidos_activos});
  E.ok(s.pedidos_activos ? 'Pedidos en pausa: el sitio ya no deja pedir.' : 'Listo: el sitio vuelve a recibir pedidos.');
}
async function enlAjustes(){
  var p = parseInt(val('ajP'), 10), t = parseInt(val('ajT'), 10), a = val('ajA'), c = val('ajC'), l = val('ajL');
  if(!(p >= 5 && p <= 120)) throw new Error('La preparación debe ser de 5 a 120 minutos.');
  if(!(t >= 10 && t <= 240)) throw new Error('La espera debe ser de 10 a 240 minutos.');
  if(!a || !c || c <= a) throw new Error('Revisa el horario: debe cerrar después de abrir.');
  await guardarAjustes({p_prep:p, p_tolerancia:t, p_abre:a, p_cierra:c, p_limite: l || null});
  S.abierto = null; E.ok('Ajustes guardados.');
}
/* Cuántos pedidos nuevos hay (para el numerito de la pestaña) */
async function contarNuevos(){
  if(!S.suc) return 0;
  var r = await sb.from('pedidos').select('id', {count:'exact', head:true}).eq('sucursal', S.suc).eq('estado', 'nuevo');
  if(r.error) return S.nuevosEnLinea;
  return r.count || 0;
}
Object.assign(E.VISTAS, {enlinea:vistaEnLinea});
Object.assign(E.CARGAS, {enlinea:cargarEnLinea});
Object.assign(E, {enlEstado:enlEstado, enlEntregar:enlEntregar, enlCancelar:enlCancelar, enlWa:enlWa, enlTog:enlTog, enlAjustes:enlAjustes,
  cargarEnLinea:cargarEnLinea, contarNuevos:contarNuevos});
})();

/* ================= Bloque 4: eventos ================= */
(function(){
'use strict';
var E = window.__ET, S = E.S;
var ocupado = false;

/* ---- Estados de carga ---- */
function cargandoPanel(texto){
  var fila = '<div class="sk-row"><div style="flex:1"><div class="sk-l sk" style="width:55%;margin-bottom:8px"></div><div class="sk-l sk" style="width:30%"></div></div><div class="sk-btn sk"></div></div>';
  var caja = '<div class="sk-box" aria-hidden="true"><div class="sk-t sk"></div>' + fila + fila + fila + '</div>';
  return '<div class="loading" role="status"><span class="spin" aria-hidden="true"></span>' + E.esc(texto || 'Cargando…') + '</div>' + caja + caja;
}
/* Pone el botón en "ocupado" (con su texto), muestra la barrita de arriba y regresa todo al terminar */
function textoOcupado(btn){
  var f = btn && btn.closest ? btn.closest('.form, .inline, .login, .box') : null;
  var archivo = f && Array.prototype.some.call(f.querySelectorAll('input[type=file]'), function(i){ return i.files && i.files.length; });
  return archivo ? 'Subiendo foto…' : 'Guardando…';
}
function marcarOcupado(btn, texto){
  document.body.classList.add('ocupado');
  E.$('app').setAttribute('aria-busy', 'true');
  if(!btn) return null;
  var antes = btn.innerHTML;
  btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  btn.innerHTML = '<span class="spin" aria-hidden="true"></span>' + E.esc(texto);
  return antes;
}
function quitarOcupado(btn, antes){
  document.body.classList.remove('ocupado');
  E.$('app').removeAttribute('aria-busy');
  if(btn && document.body.contains(btn)){ btn.disabled = false; btn.removeAttribute('aria-busy'); btn.innerHTML = antes; }
}
async function correr(btn, fn, recargar){
  if(ocupado) return;
  ocupado = true;
  var antes = marcarOcupado(btn, textoOcupado(btn));
  S.msg = null;
  try{ await fn(); if(recargar) await E.CARGAS[S.tab](); }
  catch(e){ E.fallo(e); }
  finally{ ocupado = false; quitarOcupado(btn, antes); E.pintar(); }
}
async function conBoton(btn, texto, fn){
  if(ocupado) return;
  ocupado = true;
  var antes = marcarOcupado(btn, texto);
  try{ await fn(); }
  finally{ ocupado = false; quitarOcupado(btn, antes); }
}

var ACC = {
  login: function(b){ return conBoton(b, 'Entrando…', function(){ return E.accionLogin('login'); }); },
  alta: function(b){ return conBoton(b, 'Creando cuenta…', function(){ return E.accionLogin('alta'); }); },
  olvido: function(b){ return conBoton(b, 'Enviando…', function(){ return E.accionLogin('olvido'); }); },
  nueva: function(b){ return conBoton(b, 'Guardando…', function(){ return E.accionLogin('nueva'); }); },
  modo: function(b){ S.modo = b.getAttribute('data-m'); S.msg = null; E.pintar(); },
  salir: function(){ return E.salir(); },
  tab: function(b){ S.tab = b.getAttribute('data-t'); S.abierto = null; S.msg = null; S.ultimo = null; S.codigoNuevo = null; E.pintar(); E.$('app').innerHTML = cargandoPanel('Cargando ' + (b.getAttribute('data-l') || b.textContent).trim().toLowerCase() + '…'); E.$('app').setAttribute('aria-busy', 'true'); return E.cargarTab().then(function(){ E.$('app').removeAttribute('aria-busy'); }); },
  abrir: function(b){ var k = b.getAttribute('data-k'); S.abierto = (S.abierto === k ? null : k); S.msg = null; E.pintar(); var f = document.querySelector('.form input, .inline input, .inline select'); if(f && S.abierto) f.focus(); },
  cerrar: function(){ S.abierto = null; E.pintar(); },
  costoSave: function(b){ return correr(b, function(){ return E.guardarCosto(b.getAttribute('data-k'), b.getAttribute('data-n'), b.getAttribute('data-g') === '1'); }, S.tab === 'costos'); },
  fDia: function(b){ S.filtroDia = b.getAttribute('data-c'); E.pintar(); },
  diaNuevo: function(b){ return correr(b, E.diaNuevo); },
  diaEdit: function(b){ return correr(b, function(){ return E.diaEdit(b.getAttribute('data-id')); }); },
  diaTog: function(b){ var p = E.diaPorId(b.getAttribute('data-id')); return correr(null, function(){ return E.diaUpdate(p.id, {disponible: !p.disponible}); }); },
  diaMas: function(b){ var p = E.diaPorId(b.getAttribute('data-id')); return correr(null, function(){ return E.diaUpdate(p.id, {cantidad: p.cantidad + 1}); }); },
  diaMenos: function(b){ var p = E.diaPorId(b.getAttribute('data-id')); if(p.cantidad < 1) return; return correr(null, function(){ return E.diaUpdate(p.id, {cantidad: p.cantidad - 1}); }); },
  diaAgo: function(b){ return correr(null, function(){ return E.diaUpdate(b.getAttribute('data-id'), {cantidad: 0}); }); },
  diaBorrar: function(b){ return correr(b, async function(){ var r = await E.sb.from('productos_dia').delete().eq('id', b.getAttribute('data-id')); if(r.error) throw r.error; S.abierto = null; E.ok('Producto borrado del menú de hoy.'); }, true); },
  copiarAyer: function(b){ return correr(b, E.copiarAyer); },
  promoOff: function(b){ return correr(b, async function(){
    var tabla = b.getAttribute('data-t'); if(tabla !== 'productos_dia' && tabla !== 'menu_items') return;
    var r = await E.sb.from(tabla).update({promo_tipo:null, promo_n:null, promo_m:null, promo_valor:null}).eq('id', b.getAttribute('data-id'));
    if(r.error) throw r.error; E.ok('Promoción quitada.'); }, true); },
  menuNuevo: function(b){ return correr(b, E.menuNuevo); },
  menuEdit: function(b){ return correr(b, function(){ return E.menuEdit(b.getAttribute('data-id')); }); },
  menuTog: function(b){ return correr(null, function(){ return E.menuTog(b.getAttribute('data-id')); }); },
  opcNuevo: function(b){ return correr(b, function(){ return E.opcNuevo(b.getAttribute('data-p')); }); },
  opcEdit: function(b){ return correr(b, function(){ return E.opcEdit(b.getAttribute('data-id')); }); },
  opcTog: function(b){ return correr(null, function(){ return E.opcTog(b.getAttribute('data-id')); }); },
  baseSave: function(b){ return correr(b, E.baseSave); },
  fCaja: function(b){ S.filtroCaja = b.getAttribute('data-c'); E.pintar(); },
  add: function(b){ E.agregar(b.getAttribute('data-o'), b.getAttribute('data-id'), b.getAttribute('data-t')); },
  tMas: function(b){ var l = S.ticket[+b.getAttribute('data-i')]; if(l) E.agregar(l.origen, l.id, l.tamano); },
  tMenos: function(b){ var i = +b.getAttribute('data-i'); var l = S.ticket[i]; if(!l) return; l.cantidad--; if(l.cantidad <= 0) S.ticket.splice(i, 1); E.repintarCaja(); },
  tVaciar: function(){ S.ticket = []; E.repintarCaja(); },
  pago: function(b){ S.pago = b.getAttribute('data-p'); E.repintarCaja(); },
  cobrar: function(b){ return correr(b, E.cobrar); },
  pedNuevo: function(b){ return correr(b, E.pedNuevo); },
  salCobrar: function(b){ return correr(b, function(){ return E.salCobrar(b.getAttribute('data-id'), b.getAttribute('data-p')); }); },
  cvOk: function(b){ return correr(b, function(){ return E.cvOk(b.getAttribute('data-id')); }); },
  corteOk: function(b){ return correr(b, E.corteOk); },
  per: function(b){ S.periodo = b.getAttribute('data-p'); if(S.periodo === 'rango'){ E.pintar(); return; } return correr(null, E.cargarResumen); },
  rangoOk: function(b){ S.desde = E.val('rD'); S.hasta = E.val('rH'); return correr(b, E.cargarResumen); },
  reabrir: function(b){ return correr(b, function(){ return E.reabrir(b.getAttribute('data-f'), b.getAttribute('data-s')); }); },
  rsuc: function(b){ S.rsuc = b.getAttribute('data-s'); return correr(null, E.cargarResumen); },
  sucGuardar: function(b){ return correr(b, function(){ return E.sucGuardar(b.getAttribute('data-id')); }); },
  copiarMenu: function(b){ return correr(b, E.copiarMenu); },
  enlEstado: function(b){ return correr(b, function(){ return E.enlEstado(b.getAttribute('data-id'), b.getAttribute('data-e')); }); },
  enlEntregar: function(b){ return correr(b, function(){ return E.enlEntregar(b.getAttribute('data-id'), b.getAttribute('data-p')); }); },
  enlCancelar: function(b){ return correr(b, function(){ return E.enlCancelar(b.getAttribute('data-id')); }); },
  enlWa: function(b){ E.enlWa(b.getAttribute('data-id')); },
  enlTog: function(b){ return correr(b, E.enlTog); },
  enlAjustes: function(b){ return correr(b, E.enlAjustes); },
  fondoOk: function(b){ return correr(b, E.fondoOk); },
  excel: function(){ E.excel(); },
  desOk: function(b){ return correr(b, function(){ return E.desOk(b.getAttribute('data-id')); }); },
  react: function(b){ return correr(b, function(){ return E.react(b.getAttribute('data-id')); }); },
  sesCerrar: function(b){ return correr(b, function(){ return E.sesCerrar(b.getAttribute('data-id')); }); },
  invCrear: function(b){ return correr(b, E.invCrear); },
  invOff: function(b){ return correr(b, function(){ return E.invOff(b.getAttribute('data-id')); }); },
  invCopiar: function(){ if(navigator.clipboard) navigator.clipboard.writeText(S.codigoNuevo).then(function(){ E.ok('Código copiado.'); E.pintar(); }); },
  invWa: function(){ window.open('https://wa.me/?text=' + encodeURIComponent(E.invTexto()), '_blank', 'noopener,noreferrer'); }
};

document.addEventListener('click', function(e){
  var b = e.target.closest('[data-a]');
  if(!b || b.tagName === 'INPUT' || b.disabled) return;
  var f = ACC[b.getAttribute('data-a')];
  if(f){ e.preventDefault(); f(b); }
});
document.addEventListener('change', function(e){
  var t = e.target;
  if(t.id === 'prT'){ E.promoTipoCambio(); return; }
  if(t.id === 'sucSel'){
    if(ocupado){ t.value = S.suc; return; }
    E.cambiarSucursal(t.value); E.pintar();
    E.$('app').innerHTML = cargandoPanel('Cambiando a ' + E.sucNombre(S.suc) + '…');
    E.cargarTab(); return;
  }
  if(t.getAttribute('data-a') === 'perSuc'){
    correr(null, function(){ return E.perSuc(t.getAttribute('data-id'), t.value); }); return;
  }
  if(t.getAttribute('data-a') === 'diaQty'){
    var n = parseInt(t.value, 10); if(!(n >= 0)) n = 0;
    correr(null, function(){ return E.diaUpdate(t.getAttribute('data-id'), {cantidad: n}); });
  }
});
document.addEventListener('input', function(e){
  var t = e.target;
  if(t.id === 'cBus'){ S.buscaCaja = t.value; var p = E.$('cProds'); if(p) E.repintarCaja(); }
  if(t.id === 'coR' || t.id === 'coC') E.actualizarEsperado();
});
document.addEventListener('keydown', function(e){
  if(e.key !== 'Enter') return;
  var t = e.target; if(!t || t.tagName !== 'INPUT') return;
  var m = {lgE:'login', lgP:'login', alC:'alta', alP:'alta', olE:'olvido', nvP:'nueva'}[t.id];
  if(m){ e.preventDefault(); E.accionLogin(m); }
});

/* Avisos de pedidos en línea: revisa cada 20 segundos */
var previos = null;
function sonar(){
  try{
    var C = window.AudioContext || window.webkitAudioContext; if(!C) return;
    var ctx = sonar.ctx || (sonar.ctx = new C());
    [0, 0.18].forEach(function(dt){
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + dt);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dt + 0.15);
      o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + dt); o.stop(ctx.currentTime + dt + 0.16);
    });
  }catch(e){}
}
async function revisarPedidos(){
  if(!S.user || !S.perfil || !S.perfil.activo || !S.suc || ocupado || document.hidden) return;
  try{
    if(S.tab === 'enlinea' && !S.abierto){
      await E.cargarEnLinea();
      if(!ocupado && S.tab === 'enlinea' && !S.abierto) E.pintar();
    } else {
      S.nuevosEnLinea = await E.contarNuevos();
      E.pintarBarra();
    }
    if(previos !== null && S.nuevosEnLinea > previos) sonar();
    previos = S.nuevosEnLinea;
  }catch(e){}
}
setInterval(revisarPedidos, 20000);

E.iniciar();
})();
