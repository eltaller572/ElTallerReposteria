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
  ses: [], inv: [], perfiles: [], nom: {}, rv: [], rc: [], costos: [], hist: [], ventas: [], pedidos: [], saldoPend: 0
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
  var p = await sb.from('perfiles').select('id,nombre,rol,activo').eq('id', S.user.id).maybeSingle();
  if(p.error){ fallo(p.error); S.perfil = null; pintar(); return; }
  S.perfil = p.data;
  if(!S.perfil || !S.perfil.activo){ pintar(); return; }
  S.admin = (S.perfil.rol === 'dueno' || S.perfil.rol === 'developer');
  S.tab = S.tab || (S.admin ? 'resumen' : 'dia');
  await cargarTab();
}

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
var TABS_EMP = [['dia','Menú del día'],['bebidas','Menú de bebidas'],['pasteles','Pasteles'],['caja','Caja'],['pedidos','Pedidos'],['ventas','Ventas de hoy'],['corte','Corte']];
var TABS_ADM = [['resumen','Resumen']].concat(TABS_EMP).concat([['costos','Costos'],['historial','Historial'],['equipo','Equipo']]);

function pintarBarra(){
  var who = $('who'), tabs = $('tabs'), tin = $('tabsIn');
  if(!S.user || !S.perfil || !S.perfil.activo){
    who.innerHTML = S.user ? '<button data-a="salir">Salir</button>' : '';
    tabs.classList.add('hidden'); return;
  }
  who.innerHTML = '<span>' + esc(S.perfil.nombre || '') + ' · <b>' + (S.admin ? 'Administrador' : 'Empleado') + '</b></span><button data-a="salir">Salir</button>';
  var lista = S.admin ? TABS_ADM : TABS_EMP;
  tin.innerHTML = lista.map(function(t){ return '<button data-a="tab" data-t="' + t[0] + '" class="' + (S.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('');
  tabs.classList.remove('hidden');
}

function pintar(){
  pintarBarra();
  var app = $('app');
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
  var r = await sb.from('productos_dia').select('*').eq('fecha', S.hoy).order('categoria').order('creado');
  if(r.error) throw r.error;
  S.dia = r.data || [];
  await cargarCostosOk();
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
      '<div class="nm"><b>' + esc(p.nombre) + '</b><small>' + catNombre(p.categoria) + ' · ' + fm(p.precio) + '</small><small>' + costoTag(claveDia(p.nombre)) + '</small></div>' +
      '<div class="ctl">' +
      '<button class="' + (p.disponible ? 'btn-r' : 'btn-o') + '" data-a="diaTog" data-id="' + p.id + '">' + (p.disponible ? 'Disponible' : 'No disponible') + '</button>';
    if(p.disponible){
      h += '<button class="st" data-a="diaMenos" data-id="' + p.id + '" aria-label="Quitar una pieza">−</button>' +
        '<input class="qty" type="number" min="0" step="1" inputmode="numeric" value="' + p.cantidad + '" data-a="diaQty" data-id="' + p.id + '" aria-label="Piezas de ' + esc(p.nombre) + '">' +
        '<button class="st" data-a="diaMas" data-id="' + p.id + '" aria-label="Agregar una pieza">+</button>' +
        (ago ? '<span class="tag r">Agotado</span>' : '<button class="btn-y" data-a="diaAgo" data-id="' + p.id + '">Agotado</button>');
    }
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
  var foto = await subirFoto('dFoto', 'dia/' + S.hoy);
  var r = await sb.from('productos_dia').insert({fecha:S.hoy, categoria:val('dCat'), nombre:nombre, precio:precio, cantidad:cant,
    descripcion: val('dDes').trim() || null, foto_path: foto, disponible:true}).select().single();
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
  var cambios = {categoria:val('dCat'), nombre:nombre, precio:precio, descripcion: val('dDes').trim() || null};
  var foto = await subirFoto('dFoto', 'dia/' + S.hoy);
  if(foto) cambios.foto_path = foto;
  await diaUpdate(id, cambios);
  S.abierto = null; ok('Cambios guardados.');
}
async function copiarAyer(){
  var ayer = sumarDias(S.hoy, -1);
  var r = await sb.from('productos_dia').select('categoria,nombre,descripcion,precio').eq('fecha', ayer);
  if(r.error) throw r.error;
  var hoyN = {}; S.dia.forEach(function(p){ hoyN[p.nombre.toLowerCase()] = 1; });
  var nuevos = (r.data || []).filter(function(p){ return !hoyN[p.nombre.toLowerCase()]; })
    .map(function(p){ return {fecha:S.hoy, categoria:p.categoria, nombre:p.nombre, descripcion:p.descripcion, precio:p.precio, cantidad:0, disponible:false}; });
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
  cargarDia:cargarDia, diaPorId:diaPorId, diaUpdate:diaUpdate, diaNuevo:diaNuevo, diaEdit:diaEdit, copiarAyer:copiarAyer,
  accionLogin:accionLogin, salir:salir, iniciar:iniciar, vistaDia:vistaDia };
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
  var r = await sb.from('menu_items').select('*').order('orden').order('id');
  if(r.error) throw r.error;
  S.menu = r.data || [];
  await E.cargarCostosOk();
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
    '<div class="fld"><label for="mTip">Tipo</label><select id="mTip"><option value="bebida"' + (e.tipo !== 'bowl' ? ' selected' : '') + '>Bebida</option><option value="bowl"' + (e.tipo === 'bowl' ? ' selected' : '') + '>Bowl</option></select></div>' +
    '</div>' +
    '<div class="fld"><label for="mDes">Descripción (opcional)</label><input id="mDes" type="text" maxlength="300" value="' + esc(e.descripcion) + '"></div>' +
    '<div class="fld"><label for="mFoto">' + (m && m.foto_path ? 'Cambiar foto' : 'Foto') + ' (opcional)</label><input id="mFoto" type="file" accept="image/*"></div>' +
    '<div class="acts"><button class="btn-o" data-a="cerrar">Cancelar</button><button class="btn-r" data-a="' + (m ? 'menuEdit' : 'menuNuevo') + '"' + (m ? ' data-id="' + m.id + '"' : '') + '>Guardar</button></div></div>';
}
function vistaBebidas(){
  var h = '<h2 style="margin-bottom:12px">Menú de bebidas</h2>' +
    '<div class="ctl" style="margin-bottom:14px"><button class="btn-y" data-a="abrir" data-k="nuevoMenu">+ Agregar bebida o bowl</button></div>';
  if(S.abierto === 'nuevoMenu') h += menuForm(null);
  secciones().forEach(function(sec){
    h += '<div class="box"><h3>' + esc(sec) + '</h3>';
    S.menu.filter(function(m){ return m.seccion === sec; }).forEach(function(m){
      var k = 'menu:' + m.id;
      h += '<div class="row' + (m.activo ? '' : ' off') + '">' + E.phHTML(m.nombre, m.foto_path) +
        '<div class="nm"><b>' + esc(m.nombre) + '</b><small>' + fm(m.precio) + (m.precio_grande ? ' · grande ' + fm(m.precio_grande) : '') + '</small><small>' + E.costoTag(k) + '</small></div>' +
        '<div class="ctl"><button class="' + (m.activo ? 'btn-r' : 'btn-o') + ' btn-s" data-a="menuTog" data-id="' + m.id + '">' + (m.activo ? 'En el menú' : 'Oculto') + '</button>' +
        '<button class="btn-p btn-s" data-a="abrir" data-k="me:' + m.id + '">Editar</button>' +
        '<button class="btn-p btn-s" data-a="abrir" data-k="mc:' + m.id + '">Costo</button></div>';
      if(S.abierto === 'me:' + m.id) h += menuForm(m);
      if(S.abierto === 'mc:' + m.id) h += E.costoForm(k, m.nombre, !!m.precio_grande);
      h += '</div>';
    });
    h += '</div>';
  });
  if(!S.menu.length) h += '<div class="box"><div class="empty">El menú está vacío.</div></div>';
  return h;
}
function menuDatos(){
  var sec = val('mSec').replace(/\s+/g,' ').trim(), nom = val('mNom').replace(/\s+/g,' ').trim();
  var p = num(val('mPre')), g = val('mPg').trim() === '' ? null : num(val('mPg'));
  if(!sec) throw new Error('Escribe la sección (por ejemplo: Café caliente).');
  if(!nom) throw new Error('Escribe el nombre.');
  if(!(p > 0)) throw new Error('Escribe un precio mayor a cero.');
  if(g !== null && !(g > 0)) throw new Error('El precio grande debe ser mayor a cero o quedar vacío.');
  return {seccion:sec, nombre:nom, precio:p, precio_grande:g, tipo:val('mTip'), descripcion: val('mDes').trim() || null};
}
async function menuNuevo(){
  var d = menuDatos();
  var foto = await E.subirFoto('mFoto', 'menu/items');
  if(foto) d.foto_path = foto;
  d.orden = S.menu.length + 1;
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
  var a = await sb.from('productos_dia').select('*').eq('fecha', S.hoy).eq('disponible', true).order('categoria').order('nombre');
  if(a.error) throw a.error;
  var b = await sb.from('menu_items').select('*').eq('activo', true).order('orden');
  if(b.error) throw b.error;
  var c = await sb.rpc('et_dia_cerrado', {p_fecha: S.hoy});
  S.dia = a.data || []; S.menu = b.data || []; S.cerrado = !c.error && c.data === true;
}
function precioLinea(l){
  if(l.origen === 'dia'){ var d = E.diaPorId(l.id); return d ? d.precio : 0; }
  var m = S.menu.filter(function(x){ return x.id === l.id; })[0];
  if(!m) return 0;
  return l.tamano === 'g' && m.precio_grande ? m.precio_grande : m.precio;
}
function totalTicket(){ return S.ticket.reduce(function(s, l){ return s + precioLinea(l) * l.cantidad; }, 0); }
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
      h += '<button class="pb' + (z ? ' z' : '') + '" data-a="add" data-o="dia" data-id="' + p.id + '"' + (z || S.cerrado ? ' disabled' : '') + '><b>' + esc(p.nombre) + '</b><span class="p">' + fm(p.precio) + '</span><small>' + (z ? 'Agotado' : 'Quedan ' + p.cantidad) + '</small></button>';
    });
  } else {
    var ms = S.menu.filter(function(m){ return !q || m.nombre.toLowerCase().indexOf(q) >= 0 || m.seccion.toLowerCase().indexOf(q) >= 0; });
    if(!ms.length) return '<div class="empty">Sin resultados.</div>';
    ms.forEach(function(m){
      if(m.precio_grande){
        h += '<div class="pb"><b>' + esc(m.nombre) + '</b><small>' + esc(m.seccion) + '</small><div class="pb-sz">' +
          '<button data-a="add" data-o="menu" data-t="ch" data-id="' + m.id + '"' + (S.cerrado ? ' disabled' : '') + '>Ch ' + fm(m.precio) + '</button>' +
          '<button data-a="add" data-o="menu" data-t="g" data-id="' + m.id + '"' + (S.cerrado ? ' disabled' : '') + '>G ' + fm(m.precio_grande) + '</button></div></div>';
      } else {
        h += '<button class="pb" data-a="add" data-o="menu" data-id="' + m.id + '"' + (S.cerrado || m.precio == null ? ' disabled' : '') + '><b>' + esc(m.nombre) + '</b><span class="p">' + fm(m.precio) + '</span><small>' + esc(m.seccion) + '</small></button>';
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
    h += '<div class="tl"><span class="n">' + esc(nombreLinea(l)) + '</span><button data-a="tMenos" data-i="' + i + '" aria-label="Quitar uno">−</button><b>' + l.cantidad + '</b><button data-a="tMas" data-i="' + i + '" aria-label="Agregar uno">+</button><span class="m">' + fm(precioLinea(l) * l.cantidad) + '</span></div>';
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
  var r = await sb.rpc('et_registrar_venta', {p_items: items, p_metodo: S.pago});
  if(r.error) throw r.error;
  var row = Array.isArray(r.data) ? r.data[0] : r.data;
  S.ultimo = {id: row.venta_id, total: row.total, metodo: S.pago};
  S.ticket = [];
  await cargarCaja();
}

/* ---------- Pedidos de pastel ---------- */
async function cargarPedidos(){
  var r = await sb.from('pedidos_pastel').select('*').eq('estado','pendiente').order('fecha_entrega');
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
  var r = await sb.rpc('et_registrar_pedido', {p_cliente:cli, p_telefono:val('pTel').trim(), p_descripcion:des, p_entrega:ent, p_total:tot, p_anticipo:ant, p_metodo:val('pMet')});
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
  var r = await sb.from('ventas').select('*, venta_items(nombre,cantidad,tamano,subtotal)').eq('fecha', S.hoy).order('id', {ascending:false});
  if(r.error) throw r.error;
  S.ventas = r.data || [];
  var c = await sb.rpc('et_dia_cerrado', {p_fecha: S.hoy});
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
    var det = v.tipo === 'venta' ? (v.venta_items || []).map(function(i){ return i.cantidad + ' ' + i.nombre + (i.tamano === 'g' ? ' (G)' : i.tamano === 'ch' ? ' (Ch)' : ''); }).join(', ') : TIPO[v.tipo];
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
  var r = await sb.rpc('et_resumen_caja');
  if(r.error) throw r.error;
  S.caja = Array.isArray(r.data) ? r.data[0] : r.data;
  S.corteHoy = null;
  if(S.caja && S.caja.cerrado){
    var c = await sb.from('cortes').select('*').eq('fecha', S.hoy).maybeSingle();
    if(!c.error) S.corteHoy = c.data;
  }
}
function vistaCorte(){
  var c = S.caja || {efectivo:0, tarjeta:0, transferencia:0, fondo:0, cerrado:false};
  var h = '<h2 style="margin-bottom:12px">Corte de caja</h2>';
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
  var x = await sb.rpc('et_registrar_corte', {p_retiros:r, p_contado:c, p_nota: val('coN').trim()});
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
  var r = await sb.from('perfiles').select('id,nombre,rol,activo').order('nombre');
  if(r.error) throw r.error;
  S.perfiles = r.data || [];
  S.nom = {}; S.perfiles.forEach(function(p){ S.nom[p.id] = p.nombre; });
}

/* ---------- Resumen ---------- */
async function cargarResumen(){
  var rg = rango();
  S.rg = rg;
  S.rv = await todo(function(){
    return sb.from('ventas').select('id,fecha,creada,tipo,metodo,total,estado,motivo_cancel,cancelada,creado_por,cancelada_por,venta_items(id,nombre,cantidad,tamano,precio_unit,subtotal,origen,venta_costos(costo_unit))')
      .gte('fecha', rg[0]).lte('fecha', rg[1]).order('id');
  });
  var c = await sb.from('cortes').select('*').gte('fecha', rg[0]).lte('fecha', rg[1]).order('fecha', {ascending:false});
  if(c.error) throw c.error; S.rc = c.data || [];
  var p = await sb.from('pedidos_pastel').select('total,pagado').eq('estado','pendiente');
  if(p.error) throw p.error; S.saldoPend = (p.data || []).reduce(function(s, x){ return s + (x.total - x.pagado); }, 0);
  var a = await sb.from('ajustes').select('clave,valor');
  if(!a.error){ S.ajustes = S.ajustes || {}; (a.data || []).forEach(function(x){ S.ajustes[x.clave] = x.valor; }); }
  await nombres();
}
function costoDe(it){ var vc = it.venta_costos; if(Array.isArray(vc)) vc = vc[0]; return vc ? Number(vc.costo_unit) : null; }
function calc(){
  var R = {total:0, mostrador:0, tickets:0, anticipos:0, metodo:{efectivo:0, tarjeta:0, transferencia:0}, dias:{}, prods:{},
    ingresoConCosto:0, costo:0, sinCosto:0, ingresoSinCosto:0, cancel:[]};
  S.rv.forEach(function(v){
    if(v.estado === 'cancelada'){ R.cancel.push(v); return; }
    var t = Number(v.total);
    R.total += t; R.metodo[v.metodo] += t; R.dias[v.fecha] = (R.dias[v.fecha] || 0) + t;
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
  var h = '<h2 style="margin-bottom:12px">Resumen</h2><div class="chips">' + P.map(function(p){ return '<button data-a="per" data-p="' + p[0] + '" class="' + (S.periodo === p[0] ? 'on' : '') + '">' + p[1] + '</button>'; }).join('') + '</div>';
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
  h += '<div class="box"><h3>Cómo pagaron</h3>' + ['efectivo','tarjeta','transferencia'].map(function(m){
    var pc = R.total ? Math.round(R.metodo[m] / R.total * 100) : 0;
    return '<div class="hbar"><span class="l">' + m.charAt(0).toUpperCase() + m.slice(1) + '</span><div class="t"><div class="f" style="width:' + pc + '%"></div></div><span class="v">' + fm(R.metodo[m]) + '</span></div>'; }).join('') + '<div style="height:8px"></div></div>';
  var top = Object.keys(R.prods).map(function(k){ return [k, R.prods[k]]; }).sort(function(a, b){ return b[1].n - a[1].n; }).slice(0, 10);
  var tm = top.length ? top[0][1].n : 1;
  h += '<div class="box"><h3>Lo que más se vende</h3>' + (top.length ? top.map(function(t){
    return '<div class="hbar"><span class="l">' + esc(t[0]) + '</span><div class="t"><div class="f" style="width:' + Math.round(t[1].n / tm * 100) + '%"></div></div><span class="v">' + t[1].n + ' · ' + fm(t[1].$) + '</span></div>'; }).join('') + '<div style="height:8px"></div>' : '<div class="empty">Sin ventas.</div>') + '</div>';
  h += '<div class="box"><h3>Cortes de caja</h3>';
  if(!S.rc.length) h += '<div class="empty">No hay cortes en este periodo.</div>';
  else h += '<div class="scroll"><table><tr><th>Fecha</th><th>Esperado</th><th>Contado</th><th>Diferencia</th><th>Nota</th><th>Hizo el corte</th><th></th></tr>' + S.rc.map(function(c){
    var d = Number(c.diferencia);
    return '<tr><td>' + esc(c.fecha) + '</td><td>' + fm(c.esperado) + '</td><td>' + fm(c.contado) + '</td><td><b>' + (d === 0 ? 'Cuadra' : (d > 0 ? 'Sobran ' + fm(d) : 'Faltan ' + fm(-d))) + '</b></td><td>' + esc(c.nota || '') + '</td><td>' + esc(S.nom[c.creado_por] || '') + '</td><td>' +
      (S.abierto === 'reab:' + c.fecha ? '<button class="btn-r btn-s" data-a="reabrir" data-f="' + esc(c.fecha) + '">Sí, reabrir</button> <button class="btn-o btn-s" data-a="cerrar">No</button>' : '<button class="btn-o btn-s" data-a="abrir" data-k="reab:' + esc(c.fecha) + '">Reabrir día</button>') + '</td></tr>'; }).join('') + '</table></div>';
  h += '</div>';
  h += '<div class="box"><h3>Cancelaciones (' + R.cancel.length + ')</h3>' + (R.cancel.length ? '<div class="scroll"><table><tr><th>Ticket</th><th>Fecha</th><th>Monto</th><th>Motivo</th><th>Canceló</th></tr>' + R.cancel.slice().reverse().map(function(v){
    return '<tr><td>#' + v.id + '</td><td>' + esc(v.fecha) + ' ' + (v.cancelada ? E.horaMX(v.cancelada) : '') + '</td><td>' + fm(v.total) + '</td><td>' + esc(v.motivo_cancel || '') + '</td><td>' + esc(S.nom[v.cancelada_por] || '') + '</td></tr>'; }).join('') + '</table></div>' : '<div class="empty">Sin cancelaciones.</div>') + '</div>';
  var fondo = S.ajustes ? S.ajustes.fondo_caja : null;
  h += '<div class="box"><div class="row"><div class="nm"><b>Fondo de caja</b><small>Efectivo con el que abre la caja cada día (se usa en el corte)</small></div><span class="money">' + (fondo == null ? '$0' : fm(fondo)) + '</span><button class="btn-p btn-s" data-a="abrir" data-k="fondo">Cambiar</button></div>' +
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
  var L = [['Fecha','Hora','Ticket','Tipo','Producto','Tamaño','Cantidad','Precio unitario','Subtotal','Costo unitario','Ganancia','Método de pago','Estado','Motivo cancelación']];
  S.rv.forEach(function(v){
    var base = [v.fecha, E.horaMX(v.creada), v.id, v.tipo];
    var fin = [v.metodo, v.estado, v.motivo_cancel || ''];
    if(v.tipo === 'venta' && (v.venta_items || []).length){
      v.venta_items.forEach(function(it){
        var cu = costoDe(it);
        L.push(base.concat([it.nombre, it.tamano === 'g' ? 'Grande' : it.tamano === 'ch' ? 'Chico' : '', it.cantidad, it.precio_unit, it.subtotal, cu == null ? '' : cu, cu == null ? '' : (Number(it.subtotal) - cu * it.cantidad).toFixed(2)]).concat(fin));
      });
    } else L.push(base.concat([v.tipo === 'anticipo' ? 'Anticipo de pastel' : 'Saldo de pastel', '', 1, v.total, v.total, '', '']).concat(fin));
  });
  var txt = '\ufeff' + L.map(function(r){ return r.map(csvCampo).join(','); }).join('\r\n');
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], {type:'text/csv;charset=utf-8'}));
  a.download = 'ventas-el-taller_' + S.rg[0] + '_a_' + S.rg[1] + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 2000);
}
async function reabrir(f){
  var r = await sb.rpc('et_reabrir_dia', {p_fecha: f});
  if(r.error) throw r.error;
  S.abierto = null; E.ok('Día ' + f + ' reabierto.');
  await cargarResumen();
}
async function fondoOk(){
  var v = num(val('fnV')); if(isNaN(v) || v < 0) throw new Error('Monto inválido.');
  var r = await sb.from('ajustes').update({valor:v}).eq('clave','fondo_caja').select();
  if(r.error) throw r.error;
  S.ajustes.fondo_caja = v; S.abierto = null; E.ok('Fondo de caja guardado.');
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
var CAMPO = {precio:'Precio', precio_grande:'Precio grande', costo:'Costo', costo_grande:'Costo grande', valor:'Valor', alta:'Alta', activo:'Visible'};
function vistaHistorial(){
  var h = '<h2 style="margin-bottom:12px">Historial de cambios</h2><div class="box"><div class="scroll"><table><tr><th>Cuándo</th><th>Quién</th><th>Dónde</th><th>Qué</th><th>Cambio</th></tr>';
  if(!S.hist.length) h += '<tr><td colspan="5">Todavía no hay cambios.</td></tr>';
  S.hist.forEach(function(x){
    var cambio;
    if(x.campo === 'alta') cambio = 'Agregado' + (x.despues != null ? ' con ' + fm(x.despues) : '');
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
    h += '<div class="row' + (p.activo ? '' : ' off') + '"><div class="nm"><b>' + esc(p.nombre) + (yo ? ' (tú)' : '') + '</b><small>' + (p.rol === 'trabajador' ? 'Empleado' : 'Administrador') + ' · ' + n + ' dispositivo(s) conectado(s)</small></div>' +
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
    '<div class="fld"><label>&nbsp;</label><button class="btn-r" data-a="invCrear" style="width:100%">Generar código</button></div></div>';
  if(S.codigoNuevo) h += '<div style="margin-top:12px">Comparte este código con tu equipo:<br><span class="code">' + esc(S.codigoNuevo) + '</span><div class="ctl"><button class="btn-y btn-s" data-a="invCopiar">Copiar</button><button class="btn-p btn-s" data-a="invWa">Enviar por WhatsApp</button></div></div>';
  h += '</div>';
  S.inv.forEach(function(i){
    var vig = i.activo && new Date(i.expira) > new Date() && i.usos < i.usos_max;
    h += '<div class="row' + (vig ? '' : ' off') + '"><div class="nm"><b style="font-family:monospace;letter-spacing:2px">' + esc(i.codigo) + '</b><small>Usado ' + i.usos + ' de ' + i.usos_max + ' · vence ' + E.fechaHoraMX(i.expira) + '</small></div>' +
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
  var r = await sb.rpc('et_crear_invitacion', {p_dias:d, p_usos:u}); if(r.error) throw r.error;
  S.codigoNuevo = r.data; E.ok('Código generado.'); await cargarEquipo();
}
async function invOff(c){ var r = await sb.from('invitaciones').update({activo:false}).eq('codigo', c); if(r.error) throw r.error; await cargarEquipo(); }
function invTexto(){ return 'Te invito al panel de El Taller Repostería. Entra a ' + location.origin + location.pathname + ', elige "Soy nuevo: tengo un código" y usa este código: ' + S.codigoNuevo; }

Object.assign(E.VISTAS, {resumen:vistaResumen, costos:vistaCostos, historial:vistaHistorial, equipo:vistaEquipo});
Object.assign(E.CARGAS, {resumen:cargarResumen, costos:cargarCostos, historial:cargarHistorial, equipo:cargarEquipo});
Object.assign(E, {excel:excel, reabrir:reabrir, fondoOk:fondoOk, desOk:desOk, react:react, sesCerrar:sesCerrar, invCrear:invCrear, invOff:invOff, invTexto:invTexto, cargarResumen:cargarResumen});
})();

/* ================= Bloque 4: eventos ================= */
(function(){
'use strict';
var E = window.__ET, S = E.S;
var ocupado = false;

async function correr(btn, fn, recargar){
  if(ocupado) return;
  ocupado = true;
  var txt = btn ? btn.textContent : '';
  if(btn){ btn.disabled = true; btn.textContent = 'Guardando…'; }
  S.msg = null;
  try{ await fn(); if(recargar) await E.CARGAS[S.tab](); }
  catch(e){ E.fallo(e); }
  finally{ ocupado = false; if(btn && document.body.contains(btn)){ btn.disabled = false; btn.textContent = txt; } E.pintar(); }
}

var ACC = {
  login: function(b){ return E.accionLogin('login'); }, alta: function(){ return E.accionLogin('alta'); },
  olvido: function(){ return E.accionLogin('olvido'); }, nueva: function(){ return E.accionLogin('nueva'); },
  modo: function(b){ S.modo = b.getAttribute('data-m'); S.msg = null; E.pintar(); },
  salir: function(){ return E.salir(); },
  tab: function(b){ S.tab = b.getAttribute('data-t'); S.abierto = null; S.msg = null; S.ultimo = null; S.codigoNuevo = null; E.$('app').innerHTML = '<div class="loading">Cargando…</div>'; E.pintar(); return E.cargarTab(); },
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
  reabrir: function(b){ return correr(b, function(){ return E.reabrir(b.getAttribute('data-f')); }); },
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

E.iniciar();
})();
