/* El Taller Repostería — catálogo y almacén compartido (demo)
   Lo usan index.html (sitio público) y admin.html (panel).
   Los datos base viven aquí. Los cambios hechos desde el panel se guardan
   en el navegador (localStorage) y se aplican encima de estos datos.
   Cuando conectemos Supabase, este archivo se sustituye por lecturas a la base. */
(function(){
'use strict';

var KEY = 'eltaller_demo_v1';
var BASE_DEFAULT = 900;

/* ---------- datos base ---------- */
const pasteles = [
  {nombre:"Nuria Cake", precio:1350, desc:"Tres capas de chocolate semiamargo, marshmello y galleta de mantequilla con vainilla.", badge:"Especialidad", base:"Chocolate", relleno:"Chocolate semiamargo", cobertura:"Ganache", img:"nuria-titulo", diagrama:"nuria-diagrama"},
  {nombre:"Matilda Cake", precio:1180, desc:"Un pastel intenso, húmedo y profundamente chocolatoso. Capas suaves de bizcocho de chocolate, creando una experiencia densa y rica. Es el sueño de cualquier amante del chocolate.", base:"Chocolate", relleno:"Chocolate semiamargo", cobertura:"Ganache", img:"real-matilda"},
  {nombre:"3 Leches", precio:1050, desc:"Un pastel esponjoso y ultra húmedo, bañado en una mezcla de tres leches que lo hace suave y jugoso en cada bocado. Ligero pero lleno de sabor.", base:"Vainilla", relleno:"Dulce de leche", cobertura:"Merengue", img:"real-3leches"},
  {nombre:"Red Velvet", precio:1150, desc:"Bizcocho aterciopelado de ligero sabor a cacao, con su característico color rojo intenso, combinado con un relleno suave y ligeramente ácido que equilibra perfectamente la dulzura. Delicado, romántico y simplemente irresistible.", base:"Red Velvet", relleno:"Frosting de queso crema", cobertura:"Buttercream", img:"real-redvelvet"},
  {nombre:"Birthday Cake", precio:1100, desc:"Bizcocho de vainilla con confeti, relleno de dulce de leche y buttercream — la clásica de cumpleaños.", base:"Vainilla", relleno:"Dulce de leche", cobertura:"Buttercream", img:"real-birthday"},
  {nombre:"Moka", precio:1200, desc:"Delicioso pastel de chocolate combinado con el intenso sabor del café, relleno y cubierto con cremosa mousse o betún moka. Su equilibrio entre dulce y café lo convierte en una opción elegante e irresistible para los amantes del café y el chocolate.", base:"Chocolate", relleno:"Chocolate semiamargo", cobertura:"Buttercream", img:"real-moka"},
  {nombre:"Tiramisu", precio:1250, desc:"Pastel inspirado en el clásico italiano, con suaves capas de bizcocho humedecido en café espresso, relleno cremoso de queso mascarpone y un delicado toque de cacao. Elegante, suave y perfecto para amantes del café.", base:"Vainilla", relleno:"Frosting de queso crema", cobertura:"Chocolate blanco", img:"real-tiramisu"},
  {nombre:"Cookies and Cream", precio:1150, desc:"Esponjoso pastel de vainilla mezclado con trozos de galleta de chocolate tipo sándwich, acompañado de cremosa cobertura cookies & cream. Dulce, crujiente y favorito de chicos y grandes.", base:"Vainilla", relleno:"Frosting de queso crema", cobertura:"Chocolate blanco", img:"real-cookiescream"},
  {nombre:"Zanahoria", precio:1100, desc:"Pastel húmedo y especiado elaborado con zanahoria natural, nuez y un toque de canela, cubierto con betún de queso crema. Casero, suave y lleno de sabor tradicional.", base:"Marble", relleno:"Frosting de queso crema", cobertura:"Buttercream", img:"real-zanahoria"},
];

const disenos = [
  {nombre:"Maceta", precio:380, desc:"Diseño en forma de maceta con flores naturales.", img:"diseno-maceta"},
  {nombre:"Elegante", precio:380, desc:"Acabado limpio con flores y hojas de temporada.", img:"diseno-elegante"},
  {nombre:"Vintage", precio:300, desc:"Detalles clásicos en tonos rosas.", img:"diseno-vintage"},
  {nombre:"Dulce Amor", precio:320, desc:"Con mensaje personalizado y flores.", img:"diseno-dulceamor"},
];

const especiales = [
  {nombre:"Ramo Sweet Bloom", precio:500, desc:"7 cupcakes decorados a mano en forma de ramo. Sabor vainilla o chocolate, relleno de nutella o dulce de leche."},
  {nombre:"Pastel con foto personalizada", precio:950, desc:"Pastel individual o para compartir con foto comestible y mensaje — ideal para regalos y fechas especiales.", img:"cake-foto"},
];

/* Stock del día: un solo inventario, agrupado por categoría.
   En producción esto vendría del Panel iPad / dashboard. */
const stockHoy = [
  // --- PAN ---
  {cat:"Pan", nombre:"Chocolatine XXL", precio:55, desc:"Croissant de chocolate tamaño grande, hojaldrado y recién horneado.", badge:"XXL", img:"chocolatines-xxl", disp:7},
  {cat:"Pan", nombre:"Croissant", precio:28, img:"bg3", disp:8},
  {cat:"Pan", nombre:"Concha Rellena", precio:38, desc:"Rellena de frutos rojos o fresa, espolvoreada con azúcar glass.", img:"bg4", disp:6},
  {cat:"Pan", nombre:"Pan de Chocolate", precio:35, disp:5},
  {cat:"Pan", nombre:"Concha Tradicional", precio:20, disp:12},
  {cat:"Pan", nombre:"Roles de Canela", precio:30, disp:0},
  {cat:"Pan", nombre:"Brownie Bite", precio:32, desc:"Soft choco — suave y húmedo por dentro.", img:"brownies-bites", disp:10},

  // --- GALLETAS ---
  {cat:"Galletas", nombre:"Crookie Nutella", precio:58, desc:"Croissant-cookie relleno de Nutella.", badge:"Crookie's", img:"crookie-nutella", disp:4},
  {cat:"Galletas", nombre:"Crookie Red Velvet y Oreo", precio:58, desc:"Croissant-cookie red velvet coronado con Oreo.", badge:"Crookie's", img:"crookie-redvelvet", disp:3},
  {cat:"Galletas", nombre:"Crookie Pistacho", precio:58, desc:"Croissant-cookie con glaseado y pistacho picado.", badge:"Crookie's", img:"crookie-pistacho", disp:2},
  {cat:"Galletas", nombre:"Caja de galletas", precio:260, desc:"Selección surtida de las galletas del día.", img:"galletas-charola", disp:3},
  {cat:"Galletas", nombre:"Leo Cookie", precio:52, desc:"Masa clásica con relleno de ricotta y durazno, crumble de avena.", disp:6},
  {cat:"Galletas", nombre:"Pantone Red Velvet", precio:45, desc:"Red velvet con toque de queso crema.", disp:5},
  {cat:"Galletas", nombre:"Pantone Marble", precio:45, desc:"Marmoleada con chocolate Hershey's.", disp:0},

  // --- BEBIDAS Y BOWLS ---
  // --- BEBIDAS Y BOWLS (menú real de Plaza Pascal) ---
  {cat:"Bebidas y Bowls", sub:"Café caliente", nombre:"Americano", precio:40, precioGrande:50},
  {cat:"Bebidas y Bowls", sub:"Café caliente", nombre:"Capuchino", precio:60, precioGrande:70},
  {cat:"Bebidas y Bowls", sub:"Café caliente", nombre:"Latte", precio:65, precioGrande:75},
  {cat:"Bebidas y Bowls", sub:"Café caliente", nombre:"Moka", precio:70, precioGrande:80},
  {cat:"Bebidas y Bowls", sub:"Café caliente", nombre:"Flat White", precio:65},
  {cat:"Bebidas y Bowls", sub:"Café frío", nombre:"Americano frío", precio:60},
  {cat:"Bebidas y Bowls", sub:"Café frío", nombre:"Latte frío", precio:120},
  {cat:"Bebidas y Bowls", sub:"Café frío", nombre:"Moka frío", precio:120},
  {cat:"Bebidas y Bowls", sub:"Matcha", nombre:"Matcha Latte", precio:120},
  {cat:"Bebidas y Bowls", sub:"Matcha", nombre:"Pink Matcha", precio:120, desc:"Leche, matcha y cold foam de cereza.", img:"bebidas-matcha"},
  {cat:"Bebidas y Bowls", sub:"Matcha", nombre:"Mango Matcha", precio:120, desc:"Leche, matcha y cold foam de mango."},
  {cat:"Bebidas y Bowls", sub:"Matcha", nombre:"Plátano Matcha", precio:120, desc:"Puré de plátano, leche, matcha y cold foam de plátano."},
  {cat:"Bebidas y Bowls", sub:"Matcha", nombre:"Pistacho Matcha", precio:120, desc:"Leche, matcha y cold foam de pistache."},
  {cat:"Bebidas y Bowls", sub:"Smoothies", nombre:"Açai", precio:140, desc:"Açaí, frutos rojos, miel y leche de almendra."},
  {cat:"Bebidas y Bowls", sub:"Smoothies", nombre:"Green Tropical", precio:140, desc:"Piña, mango, plátano, espinaca, matcha, miel y leche de almendra."},
  {cat:"Bebidas y Bowls", sub:"Smoothies", nombre:"Monkey Strength", precio:140, desc:"Plátano, avena, cocoa, leche de almendra, peanut butter y miel."},
  {cat:"Bebidas y Bowls", sub:"No coffee", nombre:"Taro", precio:120},
  {cat:"Bebidas y Bowls", sub:"No coffee", nombre:"Chai Latte", precio:120},
  {cat:"Bebidas y Bowls", sub:"No coffee", nombre:"Dubai Latte", precio:120},
  {cat:"Bebidas y Bowls", sub:"Seltzer", nombre:"Seltzer Mango", precio:105, desc:"Agua mineral Topo Chico® con compota de fruta natural."},
  {cat:"Bebidas y Bowls", sub:"Seltzer", nombre:"Seltzer Cereza", precio:105, desc:"Agua mineral Topo Chico® con compota de fruta natural.", img:"seltzer-cereza"},
  {cat:"Bebidas y Bowls", sub:"Seltzer", nombre:"Seltzer Frutos Rojos", precio:105, desc:"Agua mineral Topo Chico® con compota de fruta natural."},
  {cat:"Bebidas y Bowls", sub:"Seltzer", nombre:"Seltzer Maracuyá", precio:105, desc:"Agua mineral Topo Chico® con compota de fruta natural.", img:"seltzer-maracuya"},
  {cat:"Bebidas y Bowls", sub:"Seltzer", nombre:"Seltzer de temporada", precio:105, desc:"Agua mineral Topo Chico® con fruta de temporada."},
  {cat:"Bebidas y Bowls", sub:"Frappé", nombre:"Frappé Nutella", precio:130, img:"bebidas-vasos"},
  {cat:"Bebidas y Bowls", sub:"Frappé", nombre:"Frappé Lotus", precio:130},
  {cat:"Bebidas y Bowls", sub:"Frappé", nombre:"Frappé Caramelo", precio:130},
  {cat:"Bebidas y Bowls", sub:"Frappé", nombre:"Frappé Cajeta", precio:130},
  {cat:"Bebidas y Bowls", sub:"Frappé", nombre:"Frappé Taro", precio:130},
  {cat:"Bebidas y Bowls", sub:"Frappé", nombre:"Frappé Vainilla", precio:130},
  {cat:"Bebidas y Bowls", sub:"Frappé", nombre:"Frappé Dubai", precio:130},
  {cat:"Bebidas y Bowls", sub:"Frappé", nombre:"Frappé Matcha", precio:130},
  {cat:"Bebidas y Bowls", sub:"Frappé", nombre:"Frappé Cookie and Cream", precio:130},
  {cat:"Bebidas y Bowls", sub:"Frappé", nombre:"Frappé Café", precio:130},
  {cat:"Bebidas y Bowls", sub:"Extras", nombre:"Scoop de proteína", precio:30},
  {cat:"Bebidas y Bowls", sub:"Extras", nombre:"Espresso sencillo", precio:30},
  {cat:"Bebidas y Bowls", sub:"Extras", nombre:"Espresso doble", precio:30},
  {cat:"Bebidas y Bowls", sub:"Bowls", nombre:"Açai Bowl", precio:95, desc:"Açaí, plátano y frutos rojos. Coronado con granola, plátano y fruta de temporada. Dulce, frutal y súper refrescante.", img:"bowl-acai", disp:7},
  {cat:"Bebidas y Bowls", sub:"Bowls", nombre:"Green Bowl", precio:90, desc:"Matcha, mango, piña, espinaca y plátano. Decorado con granola, plátano y fruta de temporada. Fresco, ligero y lleno de sabor.", img:"bowl-green", disp:5},
  {cat:"Bebidas y Bowls", sub:"Bowls", nombre:"Peanut Bowl", precio:90, desc:"Plátano, espresso, avena, cacao y crema de cacahuate. Decorado con granola, plátano y fruta de temporada. Cremoso, chocolatoso y con un toque de café para arrancar el día.", img:"bowl-peanut", disp:4},
];


const steps = [
  {key:'base', label:'Base', title:'1. Elige tu bizcocho',
    options:[
      {name:'Vainilla', price:0, icon:'🟡', desc:'Bizcocho suave y esponjoso con delicado aroma a vainilla, perfecto para cualquier ocasión y ideal para combinar con distintos rellenos y coberturas.', img:'bizc-vainilla'},
      {name:'José Antonio', price:50, icon:'🟤', desc:'Bizcocho suave y aromático con el fresco sabor de naranja natural y el toque cremoso de la mantequilla, perfecto para acompañar con café o té.', img:'bizc-joseantonio'},
      {name:'Chocolate', price:80, icon:'🟫', desc:'Bizcocho húmedo y esponjoso elaborado con cacao, de sabor intenso y textura suave que encanta a los amantes del chocolate.', img:'bizc-chocolate'},
      {name:'Red Velvet', price:100, icon:'🔴', desc:'Bizcocho aterciopelado con ligero toque de cacao y vainilla, famoso por su color rojo intenso y su textura suave y elegante.', img:'bizc-redvelvet'},
      {name:'Marble', price:80, icon:'⚫', desc:'Deliciosa combinación de vainilla y chocolate en un solo bizcocho, creando un marmoleado suave, esponjoso y lleno de sabor.', img:'bizc-marble'},
      {name:'Queso', price:90, icon:'⚪', desc:'Bizcocho cremoso y suave con un delicado sabor a queso, de textura húmeda.', img:'bizc-queso'},
      {name:'Plátano', price:60, icon:'🟠', desc:'Bizcocho suave elaborado con plátano natural maduro, de sabor dulce y aroma irresistible. Perfecto para disfrutar solo o acompañado de nuez y chocolate.', img:'bizc-platano'},
      {name:'Poppy Seed', price:70, icon:'🔵', desc:'Bizcocho delicado y esponjoso con semillas de amapola, que aportan una textura ligera y un sabor sutil y sofisticado.', img:'bizc-poppyseed'},
    ]},
  {key:'relleno', label:'Relleno', title:'2. Elige tu relleno',
    options:[
      {name:'Compota de cereza negra', price:45, icon:'🍒', img:'rell-cerezanegra'},
      {name:'Fresas', price:40, icon:'🍓', img:'rell-fresas'},
      {name:'Compota de mango', price:45, icon:'🥭', img:'rell-mango'},
      {name:'Chocolate semiamargo', price:55, icon:'🍫', img:'rell-chocsemi'},
      {name:'Compota de fresa', price:45, icon:'🍓', img:'rell-fresa'},
      {name:'Curd de limón', price:50, icon:'🍋', img:'rell-curdlimon'},
      {name:'Crema pastelera', price:45, icon:'🟡', img:'rell-cremapastelera'},
      {name:'Chocolate amargo', price:55, icon:'🍫', img:'rell-chocamargo'},
      {name:'Nutella', price:60, icon:'🟤', img:'rell-nutella'},
      {name:'Dulce de leche', price:50, icon:'🟡', img:'rell-dulcedeleche'},
      {name:'Frosting de queso crema', price:55, icon:'⚪', img:'rell-frostingqueso'},
      {name:'Lotus', price:65, icon:'🟠', img:'rell-lotus'},
      {name:'Compota de frutos rojos', price:45, icon:'🍇', img:'rell-frutosrojos'},
      {name:'Ganache de pistacho', price:70, icon:'🟢', img:'rell-ganachepistacho'},
      {name:'Chocolate blanco', price:55, icon:'⚪', img:'rell-chocblanco'},
    ]},
  {key:'cobertura', label:'Cobertura', title:'3. Elige tu cobertura',
    options:[
      {name:'Buttercream', price:0, icon:'🎂'},{name:'Merengue', price:60, icon:'☁️'},
      {name:'Chocolate', price:70, icon:'🍫'},{name:'Ganache', price:80, icon:'🟤'},
      {name:'Chocolate blanco', price:70, icon:'⚪'},
    ]},
  {key:'tamano', label:'Tamaño', title:'4. Elige el tamaño',
    options:[
      {name:'8 personas', price:0, icon:'🎂'},{name:'15 personas', price:300, icon:'🎂'},
      {name:'25 personas', price:650, icon:'🎂'},{name:'40 personas', price:1100, icon:'🎂'},
    ]},
  {key:'decoracion', label:'Decoración', title:'5. Elige la decoración',
    options:[
      {name:'Vintage', price:150, icon:'💐'},{name:'Moderna', price:120, icon:'✨'},
      {name:'Infantil', price:100, icon:'🎈'},{name:'Minimalista', price:80, icon:'⚪'},
    ]},
  {key:'color', label:'Color', title:'6. Elige el color principal',
    options:[
      {name:'Rosa', price:0, icon:'🩷'},{name:'Rojo', price:0, icon:'❤️'},
      {name:'Amarillo', price:0, icon:'💛'},{name:'Blanco', price:0, icon:'🤍'},
    ]},
  {key:'extras', label:'Añadidos', title:'7. Añadidos (opcional)', multi:true,
    options:[
      {name:'Perlas comestibles', price:80, icon:'⚪'},
      {name:'Merengue', price:90, icon:'☁️'},
      {name:'Flores naturales', price:180, icon:'🌸'},
      {name:'Flores de azúcar', price:150, icon:'🌷'},
      {name:'Topper personalizado', price:120, icon:'🎉'},
      {name:'Foto comestible', price:180, icon:'🖼️'},
      {name:'Chispas doradas', price:60, icon:'✨'},
      {name:'Vela número', price:40, icon:'🕯️'},
      {name:'Frutos rojos frescos', price:110, icon:'🍓'},
      {name:'Drip de chocolate', price:90, icon:'🍫'},
    ]},
  {key:'resumen', label:'Resumen', title:'8. Mensaje y detalles finales'},
];

/* ---------- utilidades ---------- */
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function num(v){ return typeof v === 'number' && isFinite(v); }

function leer(){
  try {
    var s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return (s && typeof s === 'object') ? s : {};
  } catch(e){ return {}; }
}
function guardar(s){
  try { localStorage.setItem(KEY, JSON.stringify(s)); return true; }
  catch(e){ return false; }
}
function reiniciar(){
  try { localStorage.removeItem(KEY); return true; } catch(e){ return false; }
}

function claveStock(p){ return p.cat + '|' + p.nombre; }
function claveOpcion(stepKey, nombre){ return stepKey + '|' + nombre; }
function claveDiseno(p){ return 'Diseño|' + p.nombre; }
function claveEspecial(p){ return 'Especial|' + p.nombre; }

function precioOpcion(stepsArr, stepKey, nombre){
  var st = stepsArr.filter(function(s){ return s.key === stepKey; })[0];
  if(!st || !st.options) return null;
  var o = st.options.filter(function(x){ return x.name === nombre; })[0];
  return o ? o.price : null;
}

/* Precio de lista de un pastel del catálogo:
   base + bizcocho + relleno + cobertura + tamaño más chico. */
function precioLista(pastel, stepsArr, base){
  var b = precioOpcion(stepsArr, 'base', pastel.base);
  var r = precioOpcion(stepsArr, 'relleno', pastel.relleno);
  var c = precioOpcion(stepsArr, 'cobertura', pastel.cobertura);
  var tam = stepsArr.filter(function(s){ return s.key === 'tamano'; })[0];
  var t0 = (tam && tam.options && tam.options.length) ? tam.options[0].price : 0;
  if(b === null || r === null || c === null) return pastel.precio;
  return base + b + r + c + t0;
}

/* Datos con los cambios del panel aplicados (sin filtrar). */
function aplicar(store){
  var s = store || leer();
  var d = {
    pasteles: clone(pasteles),
    disenos: clone(disenos),
    especiales: clone(especiales),
    stock: clone(stockHoy),
    steps: clone(steps),
    base: (num(s.base) && s.base > 0) ? s.base : BASE_DEFAULT
  };
  var pr = s.precios || {};
  var st = s.stock || {};
  var op = s.opciones || {};

  d.stock.forEach(function(p){
    var k = claveStock(p);
    var o = st[k];
    if(o){
      if(o.on === false) p._off = true;
      if(num(o.disp) && p.disp !== undefined) p.disp = Math.max(0, Math.floor(o.disp));
    }
    var q = pr[k];
    if(q){
      if(num(q.p) && q.p > 0) p.precio = q.p;
      if(num(q.pg) && q.pg > 0 && p.precioGrande !== undefined) p.precioGrande = q.pg;
    }
  });
  d.disenos.forEach(function(p){
    var q = pr[claveDiseno(p)];
    if(q && num(q.p) && q.p > 0) p.precio = q.p;
  });
  d.especiales.forEach(function(p){
    var q = pr[claveEspecial(p)];
    if(q && num(q.p) && q.p > 0) p.precio = q.p;
  });
  d.steps.forEach(function(step){
    if(!step.options) return;
    step.options.forEach(function(o){
      var v = op[claveOpcion(step.key, o.name)];
      if(num(v) && v >= 0) o.price = v;
    });
  });
  d.pasteles.forEach(function(p){ p.precio = precioLista(p, d.steps, d.base); });
  return d;
}

var FOTO_OK = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/;

/* Datos para el sitio público: solo lo disponible, más los especiales del día. */
function publico(){
  var s = leer();
  var d = aplicar(s);
  d.stock = d.stock.filter(function(p){ return !p._off; });
  (Array.isArray(s.especiales) ? s.especiales : []).forEach(function(e){
    if(!e || e.on === false) return;
    if(typeof e.nombre !== 'string' || !e.nombre) return;
    if(!num(e.precio) || e.precio <= 0) return;
    d.stock.push({
      cat: 'Especial del día',
      nombre: e.nombre,
      precio: e.precio,
      desc: (typeof e.desc === 'string') ? e.desc : '',
      disp: num(e.disp) ? Math.max(0, Math.floor(e.disp)) : 0,
      fotoData: (typeof e.foto === 'string' && FOTO_OK.test(e.foto)) ? e.foto : ''
    });
  });
  return d;
}

window.ElTaller = {
  KEY: KEY,
  BASE_DEFAULT: BASE_DEFAULT,
  leer: leer,
  guardar: guardar,
  reiniciar: reiniciar,
  completo: aplicar,
  publico: publico,
  defaults: function(){
    return { pasteles: clone(pasteles), disenos: clone(disenos), especiales: clone(especiales),
             stock: clone(stockHoy), steps: clone(steps), base: BASE_DEFAULT };
  },
  claveStock: claveStock,
  claveOpcion: claveOpcion,
  claveDiseno: claveDiseno,
  claveEspecial: claveEspecial,
  precioLista: precioLista
};
})();
