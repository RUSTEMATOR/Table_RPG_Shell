// Оформление карточки (§12 артефакта «Переход в Зеленогорье»): дословный перенос из reference/randomizer-v5.17.html,
// строки 735–736, 741, 2465–2881, 2371–2391, 4915–5126. Правки при переносе помечены «// ZG:».
// Код как в артефакте — JS без DOM (кроме частиц внизу); типы — в engine.d.ts. Не переписывать: при обновлении артефакта
// переносить заново тем же способом.
/* eslint-disable */

function hashStr(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const DEMAND_WORDS=["","почти не нужна","пригодится","нарасхват"];
const dot=s=>{s=String(s==null?"":s).trim();return !s||/[.!?…]$/.test(s)?s:s+"."};
const CARD_FONTS={display:"'Oranienbaum', Georgia, 'Times New Roman', serif",body:"'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"};
const FALLBACK_COLORS={
  light:{bg:"#f3f5ef",panel:"#ffffff",fg:"#1d241c",muted:"#5d6a5a",line:"#d5dccf",accent:"#1f7a4d",cursed:"#8a2b2b",common:"#4d5a63",dual:"#9a6a12",legend:"#5b3d9a"},
  dark:{bg:"#141a15",panel:"#1c241e",fg:"#e6ebe2",muted:"#9aa897",line:"#2e3a31",accent:"#4fc38a",cursed:"#e07a7a",common:"#a9b7c0",dual:"#e2b35a",legend:"#b89cf0"}};

/* ---------- CARD THEMES (§12): registry, colour maths, pictograms, procedural patterns, theme CSS. DOM-free, tested in node ----------
   THEMES keys = SOURCES keys (genres; "other" = the app's own look) + UNIVERSES keys. themeFor(x) = x.cardTheme || x.universe || x.source || "other".
   Brief fields: label, bg, panel (slot background), ink, muted, line, accent, accent2, display, body, frame, pattern, ornament, chip, radius, segment.
   Extra optional fields: glyph (motif pictogram, also the mark of this theme's setting traits), hink/hmuted (text on bg when the slots are light
   on a dark bg), grad ([top,bottom] of the bg), loud (decorative display face: character name only, trait names use the body face), nameFont,
   dscale/nscale (size factors), dw/nw (weights), hand (face of the GM stamps). Every theme is a self-contained look; the app chrome keeps app tokens. */
const THEMES={
real:{label:"Паспорт",bg:"#e8e3d6",panel:"#f8f5ee",ink:"#1f2f47",muted:"#56637a",line:"#bcc3cf",accent:"#2c5a88",accent2:"#a3402b",display:"Oswald",body:"IBM Plex Sans",frame:"form",pattern:"grid",ornament:"rule",chip:"stamp",radius:2,segment:"gauge",glyph:"doc",dw:600},
fantasy:{label:"Пергамент",bg:"#eadbb8",panel:"#f6ebd0",ink:"#3a2814",muted:"#6b5232",line:"#c8a874",accent:"#9c6f17",accent2:"#7a2c1b",display:"Cormorant SC",body:"Spectral",frame:"double",pattern:"fibers",ornament:"vignette",chip:"ribbon",radius:4,segment:"rune",glyph:"crown",dw:700,nw:700,hand:"Bad Script"},
scifi:{label:"Бортовой журнал",bg:"#0b1426",panel:"#111d36",ink:"#dbe8ff",muted:"#8ea3c7",line:"#2a3d66",accent:"#36d6f0",accent2:"#7f8cff",display:"Exo 2",body:"Jura",frame:"hud",pattern:"stars",ornament:"brackets",chip:"tag",radius:3,segment:"gauge",glyph:"planet",dw:600,nw:600},
cyber:{label:"Неон",bg:"#0a0710",panel:"#140d1f",ink:"#f2e9ff",muted:"#a996c4",line:"#3a2752",accent:"#ff2bd6",accent2:"#22e4ff",display:"Rubik Glitch",body:"Exo 2",loud:1,frame:"cut",pattern:"scan",ornament:"glitch",chip:"tag",radius:0,segment:"slash",glyph:"circuit"},
post:{label:"Пустошь",bg:"#3b3326",panel:"#4a4131",ink:"#f1e6cf",muted:"#c2b393",line:"#6d604a",accent:"#d6913a",accent2:"#8fa05a",display:"Rubik Distressed",body:"PT Mono",loud:1,frame:"rivet",pattern:"scratch",ornament:"stencil",chip:"stamp",radius:2,segment:"notch",glyph:"radiation"},
steam:{label:"Латунь",bg:"#2b1d14",panel:"#3a281b",ink:"#f4e4c8",muted:"#c9ad85",line:"#6b4c2f",accent:"#d1a24a",accent2:"#b86b3c",display:"Ruslan Display",body:"PT Serif",loud:1,frame:"brass",pattern:"gears",ornament:"gearline",chip:"plate",radius:4,segment:"gauge",glyph:"gear",hand:"Bad Script"},
horror:{label:"Ночь",bg:"#17171a",panel:"#222226",ink:"#ecebe8",muted:"#a7a5a0",line:"#3d3c40",accent:"#c42a33",accent2:"#6e7380",display:"Rubik Wet Paint",body:"PT Serif",loud:1,frame:"torn",pattern:"fog",ornament:"drip",chip:"plate",radius:2,segment:"notch",glyph:"moon"},
hero:{label:"Комикс",bg:"#fffdf4",panel:"#ffffff",ink:"#111111",muted:"#4a4a4a",line:"#c9c9c9",accent:"#ffd21f",accent2:"#e3262d",seg:"#e3262d",display:"Rubik Mono One",body:"IBM Plex Sans",loud:1,dscale:.74,frame:"comic",pattern:"bendots",ornament:"burst",chip:"bubble",radius:2,segment:"bar",glyph:"bolt"},
game:{label:"Пиксель",bg:"#1d1033",panel:"#2a1748",ink:"#f3ecff",muted:"#b7a6d9",line:"#4b2f7a",accent:"#7cff6b",accent2:"#ff5c8a",display:"Press Start 2P",body:"PT Mono",loud:1,dscale:.52,frame:"pixel",pattern:"pixels",ornament:"pixel",chip:"pixel",radius:0,segment:"hp",glyph:"pad"},
hist:{label:"Летопись",bg:"#ecdcb4",panel:"#f6ead0",ink:"#2e1e10",muted:"#67502f",line:"#b8935a",accent:"#b2341f",accent2:"#a87a2a",display:"Old Standard TT",body:"PT Serif",frame:"chronicle",pattern:"ornate",ornament:"diamond",chip:"plate",radius:0,segment:"rune",glyph:"tower",dw:700,hand:"Bad Script"},
myth:{label:"Фреска",bg:"#e9dccb",panel:"#f5ece0",ink:"#241612",muted:"#6a4d40",line:"#c7a58e",accent:"#b4532a",accent2:"#1e1714",display:"Forum",body:"Spectral",frame:"meander",pattern:"marble",ornament:"meander",chip:"plate",radius:2,segment:"bar",glyph:"column"},
anime:{label:"Сёнен",bg:"#fff7f0",panel:"#ffffff",ink:"#1a1420",muted:"#5e5468",line:"#e2d4cf",accent:"#ff4f3a",accent2:"#2a6cff",display:"Unbounded",body:"IBM Plex Sans",dscale:.8,dw:600,nw:600,nscale:.86,frame:"manga",pattern:"speed",ornament:"burst",chip:"bubble",radius:6,segment:"petal",glyph:"burst"},
other:{label:"Зеленогорье",bg:"#f3f5ef",panel:"#ffffff",ink:"#1d241c",muted:"#5d6a5a",line:"#d5dccf",accent:"#1f7a4d",accent2:"#9a6a12",display:"Oranienbaum",body:"IBM Plex Sans",frame:"plain",pattern:"sprout",ornament:"line",chip:"pill",radius:10,segment:"bar",glyph:"green"},
naruto:{label:"Свиток",bg:"#fff3e3",panel:"#fffaf2",ink:"#1b2240",muted:"#545b7a",line:"#f0c9a0",accent:"#f26b0f",accent2:"#1f2f6b",display:"Russo One",body:"IBM Plex Sans",frame:"scroll",pattern:"spiral",ornament:"double",chip:"ribbon",radius:6,segment:"bar",glyph:"spiral"},
fate:{label:"Командная печать",bg:"#0f1838",panel:"#17224a",ink:"#eef0fb",muted:"#a7b0d6",line:"#33427a",accent:"#d9b350",accent2:"#d0485a",display:"Cormorant Garamond",body:"Spectral",dw:700,nw:700,frame:"seal",pattern:"sigil",ornament:"diamond",chip:"seal",radius:4,segment:"rune",glyph:"sigil"},
ftm:{label:"Созвездия",bg:"#0d1430",panel:"#141d40",ink:"#eaf0ff",muted:"#a3b0d8",line:"#2f3c70",accent:"#9fd2ff",accent2:"#c9d3e6",display:"Philosopher",body:"Philosopher",dw:700,nw:700,frame:"double",pattern:"constel",ornament:"dots",chip:"pill",radius:8,segment:"dot",glyph:"constel"},
wh40k:{label:"Империум",bg:"#141210",panel:"#ece2c8",ink:"#26190d",muted:"#6a5434",line:"#a88b55",accent:"#a7802c",accent2:"#8c1c13",hink:"#ece2c8",hmuted:"#b8a985",display:"Kelly Slab",body:"PT Serif",frame:"gothic",pattern:"lattice",ornament:"diamond",chip:"plate",radius:0,segment:"rune",glyph:"aquila"},
sw:{label:"Голограмма",bg:"#050608",panel:"#0e1116",ink:"#f5f1e0",muted:"#a9a48f",line:"#2a2f38",accent:"#ffe81f",accent2:"#4fb3ff",display:"Russo One",body:"IBM Plex Sans",frame:"hud",pattern:"holo",ornament:"line",chip:"tag",radius:2,segment:"gauge",glyph:"saber"},
masseffect:{label:"Омни-интерфейс",bg:"#121418",panel:"#1b1e24",ink:"#eef0f2",muted:"#a3a9b3",line:"#353a44",accent:"#ff7a1a",accent2:"#4aa3ff",display:"Exo 2",body:"Exo 2",dw:600,nw:600,frame:"hud",pattern:"hex",ornament:"chevron",chip:"hex",radius:2,segment:"slash",glyph:"hex"},
tes:{label:"Драконий свиток",bg:"#3a3630",panel:"#e8dfcc",ink:"#2a2117",muted:"#675841",line:"#b09a72",accent:"#9a6b2f",accent2:"#4b4f55",hink:"#efe7d6",hmuted:"#c4b9a2",display:"Cormorant SC",body:"Spectral",dw:700,nw:700,frame:"torn",pattern:"runecircle",ornament:"diamond",chip:"plate",radius:2,segment:"rune",glyph:"runecircle",hand:"Bad Script"},
witcher:{label:"Медальон",bg:"#1e1814",panel:"#2a221c",ink:"#ece6dd",muted:"#b0a597",line:"#4d4037",accent:"#c0c5cc",accent2:"#c23a42",display:"Kurale",body:"PT Serif",frame:"double",pattern:"leather",ornament:"diamond",chip:"plate",radius:4,segment:"rune",glyph:"wolf"},
mha:{label:"Агентство",bg:"#f2f6ff",panel:"#ffffff",ink:"#101a3a",muted:"#4b5675",line:"#c9d4ef",accent:"#1d4fd8",accent2:"#e3262d",display:"Unbounded",body:"IBM Plex Sans",dscale:.8,dw:600,nw:600,nscale:.86,frame:"comic",pattern:"burst",ornament:"burst",chip:"bubble",radius:6,segment:"slash",glyph:"burst"},
hp:{label:"Письмо из школы",bg:"#5a1420",panel:"#f4e9cf",ink:"#2b1a10",muted:"#6b5233",line:"#c9a86a",accent:"#b8902f",accent2:"#7a1424",hink:"#f6e7c4",hmuted:"#e0c79a",display:"Marck Script",nameFont:"Prata",body:"PT Serif",dscale:1.15,frame:"seal",pattern:"fibers",ornament:"double",chip:"seal",radius:4,segment:"bar",glyph:"seal",hand:"Bad Script"},
theboys:{label:"Корпорация",bg:"#f4f7fb",panel:"#ffffff",ink:"#0f1d33",muted:"#4e5d75",line:"#cfd8e6",accent:"#1c4b9c",accent2:"#9e1b1b",display:"Oswald",body:"IBM Plex Sans",dw:600,frame:"form",pattern:"drip",ornament:"rule",chip:"pill",radius:4,segment:"bar",glyph:"drip"},
souls:{label:"Костёр",bg:"#1a1512",panel:"#241d18",ink:"#ebe0d2",muted:"#a89a88",line:"#40352c",accent:"#e0873a",accent2:"#8a7a66",display:"Cormorant Garamond",body:"Spectral",dw:500,nw:700,frame:"double",pattern:"embers",ornament:"line",chip:"plate",radius:2,segment:"dot",glyph:"flame"},
minecraft:{label:"Блоки",bg:"#5b3e24",panel:"#2e2a26",ink:"#f3efe6",muted:"#c4b9a6",line:"#5e5446",accent:"#6abf3a",accent2:"#a0682f",hink:"#f3efe6",hmuted:"#e2d3b8",display:"Press Start 2P",body:"PT Mono",loud:1,dscale:.52,frame:"pixel",pattern:"blocks",ornament:"pixel",chip:"pixel",radius:0,segment:"hp",glyph:"block"},
fallout:{label:"Терминал",bg:"#07130a",panel:"#0b1c10",ink:"#8dff9e",muted:"#4fbf62",line:"#1f5a2b",accent:"#8dff9e",accent2:"#ffc94d",display:"PT Mono",body:"PT Mono",frame:"terminal",pattern:"crt",ornament:"bars",chip:"tag",radius:0,segment:"gauge",glyph:"vault"},
stalker:{label:"Зона",bg:"#2c2f22",panel:"#383c2b",ink:"#ebe8d6",muted:"#b5b294",line:"#5a5d44",accent:"#e8c21f",accent2:"#9aa352",display:"Rubik Burned",body:"PT Mono",loud:1,frame:"stripes",pattern:"hazard",ornament:"stencil",chip:"stamp",radius:2,segment:"notch",glyph:"radiation"},
johnwick:{label:"Ар-деко",bg:"#0b0b0c",panel:"#141416",ink:"#f1ebdc",muted:"#b3a98f",line:"#3a352a",accent:"#d4af37",accent2:"#8c7a4a",display:"Playfair Display",body:"PT Serif",frame:"deco",pattern:"coins",ornament:"diamond",chip:"coin",radius:0,segment:"bar",glyph:"coin"},
breakingbad:{label:"Таблица",bg:"#e9dca0",panel:"#f6efcd",ink:"#1d2a14",muted:"#4f5a35",line:"#c4b26a",accent:"#2f7a3a",accent2:"#8c6d1a",display:"Oswald",body:"IBM Plex Sans",dw:600,frame:"form",pattern:"periodic",ornament:"rule",chip:"cell",radius:2,segment:"bar",glyph:"flask"},
spn:{label:"Ловушка",bg:"#1c1b1a",panel:"#2b2723",ink:"#ede6db",muted:"#ada293",line:"#4a423a",accent:"#f2c12e",accent2:"#c0453a",display:"Underdog",body:"PT Serif",frame:"double",pattern:"pentagram",ornament:"line",chip:"stamp",radius:4,segment:"notch",glyph:"pentagram"},
silenthill:{label:"Туман",bg:"#e6e4df",grad:["#f3f2ef","#cfae97"],panel:"#f4f2ee",ink:"#2a211c",muted:"#5f544c",line:"#bdb3a8",accent:"#8a3b22",accent2:"#6b6b66",display:"Rubik Distressed",body:"PT Serif",loud:1,frame:"torn",pattern:"fogrust",ornament:"line",chip:"plate",radius:2,segment:"notch",glyph:"tri"},
lovecraft:{label:"Глубина",bg:"#0d1f1d",panel:"#132a27",ink:"#e3efe6",muted:"#9bb5ab",line:"#29463f",accent:"#5fb39b",accent2:"#b9a46a",display:"Old Standard TT",body:"PT Serif",dw:700,frame:"double",pattern:"tentacle",ornament:"wave",chip:"plate",radius:2,segment:"petal",glyph:"tentacle"},
cp2077:{label:"Найт-Сити",bg:"#f3e600",panel:"#0d0d0d",ink:"#f6f1cf",muted:"#b9b48a",line:"#3b3b2a",accent:"#ff003c",accent2:"#00f0ff",hink:"#0d0d0d",hmuted:"#3d3a00",display:"Stalinist One",body:"Exo 2",loud:1,dscale:.6,frame:"cut",pattern:"slash",ornament:"bars",chip:"tag",radius:0,segment:"slash",glyph:"barcode"},
deusex:{label:"Аугментация",bg:"#0e0c08",panel:"#1a160e",ink:"#f3e7c9",muted:"#b9a579",line:"#3e3420",accent:"#e3a82b",accent2:"#8a6a2a",display:"Jura",body:"Jura",dw:600,nw:600,frame:"cut",pattern:"trihex",ornament:"chevron",chip:"hex",radius:0,segment:"slash",glyph:"trihex"},
gits:{label:"Сеть",bg:"#071a1f",panel:"#0c262c",ink:"#d9f6f6",muted:"#86b9bb",line:"#1f4a52",accent:"#3fe0d0",accent2:"#8fb8ff",display:"Exo 2",body:"Exo 2",dw:600,nw:600,frame:"hud",pattern:"rain",ornament:"line",chip:"tag",radius:2,segment:"gauge",glyph:"rain"},
arcane:{label:"Хекстек",bg:"#1a1030",panel:"#24163f",ink:"#f6ecff",muted:"#c0a9df",line:"#46306e",accent:"#ff5fb7",accent2:"#3fb6ff",display:"Rubik Wet Paint",body:"IBM Plex Sans",loud:1,frame:"double",pattern:"splatter",ornament:"drip",chip:"tag",radius:4,segment:"rune",glyph:"crystal"},
dishonored:{label:"Ворвань",bg:"#2a2c2a",panel:"#ebe4d3",ink:"#1d1f1c",muted:"#5e5c52",line:"#b6ad97",accent:"#5f7a6f",accent2:"#121212",hink:"#ebe4d3",hmuted:"#b8b6a8",display:"Yeseva One",body:"PT Serif",frame:"double",pattern:"bone",ornament:"line",chip:"plate",radius:2,segment:"petal",glyph:"outsider",hand:"Bad Script"},
ac:{label:"Анимус",bg:"#f4f1ec",panel:"#ffffff",ink:"#1c1c1c",muted:"#5a5a5a",line:"#d8d2c8",accent:"#b5121b",accent2:"#1c1c1c",display:"Cormorant SC",body:"PT Serif",dw:700,nw:700,frame:"glitch",pattern:"glitch",ornament:"diamond",chip:"plate",radius:0,segment:"slash",glyph:"ac"},
tsushima:{label:"Тушь",bg:"#efe8da",panel:"#f8f4ea",ink:"#1b1915",muted:"#5c564c",line:"#cfc5b2",accent:"#b3201a",accent2:"#1b1915",display:"Amatic SC",body:"PT Serif",dw:700,nw:700,dscale:1.3,nscale:1.3,frame:"brush",pattern:"inksun",ornament:"brush",chip:"seal",radius:0,segment:"petal",glyph:"sun",hand:"Bad Script"},
gow:{label:"Руны",bg:"#dfe5ea",panel:"#f4f6f8",ink:"#1a2026",muted:"#4f5a66",line:"#b9c3cc",accent:"#9e1b1b",accent2:"#5b6b7a",display:"Ruslan Display",body:"PT Serif",loud:1,frame:"chronicle",pattern:"runes",ornament:"rule",chip:"plate",radius:2,segment:"rune",glyph:"axe"},
percy:{label:"Море",bg:"#e6f2f8",panel:"#f7fbfd",ink:"#0f2a3d",muted:"#47657a",line:"#b5d3e3",accent:"#1f6fa8",accent2:"#c99a2e",display:"Forum",body:"Spectral",frame:"meander",pattern:"waves",ornament:"meander",chip:"plate",radius:4,segment:"petal",glyph:"trident"},
/* v5.12 universes (review/THEMES.md «Новые вселенные (v5.12)») */
fh:{label:"Гниль",bg:"#1a110b",grad:["#2e1c0f","#140c07"],panel:"#dccba2",ink:"#24150b",muted:"#5a4329",line:"#a38c5d",accent:"#8c1d14",accent2:"#2a170c",hink:"#ecdfc0",hmuted:"#b9a47c",display:"Rubik Burned",body:"PT Serif",loud:1,frame:"brush",pattern:"rot",ornament:"drip",chip:"seal",radius:0,segment:"dot",glyph:"flipcoin",hand:"Bad Script"},
tc:{label:"Крестовый поход",bg:"#29231b",panel:"#f0e7d0",ink:"#221a10",muted:"#5e5038",line:"#b8a067",accent:"#a8822a",accent2:"#7d1c1c",hink:"#f0e7d0",hmuted:"#c2b596",display:"Cormorant SC",body:"PT Serif",dw:700,nw:700,frame:"chronicle",pattern:"glass",ornament:"wire",chip:"plate",radius:0,segment:"bar",glyph:"crusade"},
ersatz:{label:"Бункер",bg:"#474b49",panel:"#efede7",ink:"#1d211d",muted:"#525a4d",line:"#b7bbae",accent:"#5b6a33",accent2:"#9b2d20",hink:"#f1efe9",hmuted:"#c9cbc3",display:"Rubik Distressed",body:"IBM Plex Sans",loud:1,frame:"rivet",pattern:"filter",ornament:"stencil",chip:"tag",radius:2,segment:"gauge",glyph:"gasmask"},
trenchface:{label:"Ракета",bg:"#181b1d",grad:["#20262a","#121416"],panel:"#262a2c",ink:"#ebe8de",muted:"#a7a89f",line:"#45494b",accent:"#ece3a2",accent2:"#d8642e",display:"Underdog",body:"PT Mono",frame:"seal",pattern:"flare",ornament:"brackets",chip:"stamp",radius:2,segment:"notch",glyph:"reticle"}
};
const THEME_FRAMES=["plain","form","double","hud","cut","rivet","brass","torn","comic","pixel","chronicle","meander","manga","scroll","seal","gothic","terminal","stripes","deco","brush","glitch"];
const THEME_SEGMENTS=["bar","pixel","hp","rune","gauge","petal","slash","notch","dot"];
const THEME_CHIPS=["pill","stamp","ribbon","tag","plate","pixel","bubble","seal","hex","coin","cell"];
const THEME_ORNAMENTS=["wire","rule","vignette","brackets","glitch","stencil","gearline","drip","burst","pixel","diamond","meander","double","dots","wave","chevron","bars","brush","line"];
const isTheme=k=>typeof k==="string"&&Object.prototype.hasOwnProperty.call(THEMES,k);
function themeFor(x){x=x||{};for(const k of [x.cardTheme,x.universe,x.source])if(isTheme(k))return k;return "other"}
// ZG: справочника вселенных на клиенте нет — имя темы берётся из реестра тем.
const themeName=id=>(THEMES[id]||THEMES.other).label;
/* Theme of a setting trait: its universe, else its genre. */
// ZG: вместо TRAITS[traitId] — {universe, genre} сеттинговой черты, приходят с сервера.
function settingThemeOf(t){return t?(isTheme(t.universe)?t.universe:isTheme(t.genre)?t.genre:"other"):"other"}

/* Fonts: Google Fonts css2 family parameter + fallback class. All faces have Cyrillic. Loaded lazily per theme (DOM side: requestFonts). */
const FONT_SPEC={"Oswald":["Oswald:wght@400;600","sans"],"IBM Plex Sans":["IBM+Plex+Sans:wght@400;500;600","sans"],"IBM Plex Mono":["IBM+Plex+Mono:wght@400;500","mono"],
  "Cormorant SC":["Cormorant+SC:wght@500;700","serif"],"Cormorant Garamond":["Cormorant+Garamond:wght@500;700","serif"],"Spectral":["Spectral:wght@400;600","serif"],
  "Exo 2":["Exo+2:wght@400;600","sans"],"Jura":["Jura:wght@400;600","sans"],"Rubik Glitch":["Rubik+Glitch","sans"],"Rubik Distressed":["Rubik+Distressed","sans"],
  "Rubik Wet Paint":["Rubik+Wet+Paint","sans"],"Rubik Burned":["Rubik+Burned","sans"],"Rubik Mono One":["Rubik+Mono+One","sans"],"Press Start 2P":["Press+Start+2P","mono"],
  "PT Mono":["PT+Mono","mono"],"PT Serif":["PT+Serif:wght@400;700","serif"],"Ruslan Display":["Ruslan+Display","serif"],"Old Standard TT":["Old+Standard+TT:wght@400;700","serif"],
  "Forum":["Forum","serif"],"Unbounded":["Unbounded:wght@400;600","sans"],"Oranienbaum":["Oranienbaum","serif"],"Russo One":["Russo+One","sans"],
  "Philosopher":["Philosopher:wght@400;700","sans"],"Kelly Slab":["Kelly+Slab","serif"],"Kurale":["Kurale","serif"],"Marck Script":["Marck+Script","script"],
  "Prata":["Prata","serif"],"Playfair Display":["Playfair+Display:wght@400;700","serif"],"Underdog":["Underdog","sans"],"Stalinist One":["Stalinist+One","sans"],
  "Yeseva One":["Yeseva+One","serif"],"Amatic SC":["Amatic+SC:wght@400;700","sans"],"Neucha":["Neucha","script"],"Bad Script":["Bad+Script","script"]};
const FONT_FALLBACK={sans:"system-ui, -apple-system, 'Segoe UI', Arial, sans-serif",serif:"Georgia, 'Times New Roman', serif",mono:"ui-monospace, Menlo, Consolas, monospace",script:"'Segoe Print', 'Comic Sans MS', cursive"};
const PRELOADED_FONTS=new Set(["Oranienbaum","IBM Plex Sans","IBM Plex Mono"]);   // the page head already links these three
const fontStack=f=>`'${f}', ${FONT_FALLBACK[(FONT_SPEC[f]||[0,"sans"])[1]]}`;
/* faces a theme needs: display, body, trait-name face, and the stamp face for the GM (players never see stamps) */
function themeFamilies(id,gm){const T=THEMES[id]||THEMES.other;return [...new Set([T.display,T.body,T.nameFont,gm?(T.hand||"Neucha"):null].filter(Boolean))]}
function fontsHref(fams){const f=[...new Set(fams)].filter(x=>FONT_SPEC[x]&&!PRELOADED_FONTS.has(x));return f.length?"https://fonts.googleapis.com/css2?"+f.map(x=>"family="+FONT_SPEC[x][0]).join("&")+"&display=swap":""}
/* resolved faces of a theme: display (character name), name (trait names), body, hand */
function themeFonts(id){
  const T=THEMES[id]||THEMES.other;
  const name=T.nameFont||(T.loud?T.body:T.display);
  return {display:fontStack(T.display),name:fontStack(name),body:fontStack(T.body),hand:fontStack(T.hand||"Neucha"),
    dw:T.dw||400,nw:T.nameFont?400:(T.loud?600:(T.nw||T.dw||400)),ds:T.dscale||1,ns:T.nscale||1};
}

/* Colour maths (WCAG 2.x relative luminance and contrast). */
const hex2rgb=h=>{h=String(h).replace("#","");if(h.length===3)h=h.split("").map(c=>c+c).join("");const n=parseInt(h.slice(0,6),16)||0;return [n>>16&255,n>>8&255,n&255]};
const rgb2hex=a=>"#"+a.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join("");
const mixHex=(a,b,t)=>{const x=hex2rgb(a),y=hex2rgb(b);return rgb2hex(x.map((v,i)=>v+(y[i]-v)*t))};
const relLum=h=>{const c=hex2rgb(h).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*c[0]+.7152*c[1]+.0722*c[2]};
const contrast=(a,b)=>{const x=relLum(a),y=relLum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
/* c moved toward black or white (away from `against`) until the contrast reaches min */
function fitContrast(c,against,min){
  if(contrast(c,against)>=min)return c;
  const to=relLum(against)>.18?"#000000":"#ffffff";
  for(let k=1;k<=20;k++){const m=mixHex(c,to,k/20);if(contrast(m,against)>=min)return m}
  return to;
}
const rgba=(h,a)=>{const c=hex2rgb(h);return `rgba(${c[0]},${c[1]},${c[2]},${a})`};
const isDarkTheme=T=>relLum(T.panel)<.2;
/* stage segments: off = line softened toward the panel; on = accent (or accent2, or an explicit seg) at >= 3:1 on the panel, the one that differs most from off */
function segColors(T){
  const off=mixHex(T.line,T.panel,.35);
  const cands=(T.seg?[T.seg]:[T.accent,T.accent2]).map(c=>fitContrast(c,T.panel,3));
  const on=cands.reduce((b,c)=>contrast(c,off)>contrast(b,off)+.4?c:b);
  return {on,off};
}
const hinkOf=T=>T.hink||T.ink,hmutedOf=T=>T.hmuted||T.muted;

/* Tier chip palettes (§12.2). Every fg/bg pair is fitted to >= 4.8:1 (harness7 checks >= 4.5). Gold is one for all themes. */
const GOLD={a:"#c9971f",b:"#f4df8c",sheen:"#fff3c4",fg:"#2a1c00",edge:"#8a6410"};
const TP_CACHE={};
function tierPalette(id){
  if(TP_CACHE[id])return TP_CACHE[id];
  const T=THEMES[id]||THEMES.other,dark=isDarkTheme(T);
  const pickFg=bgs=>{let best="#ffffff",bv=-1;for(const f of ["#ffffff","#141414",T.ink,T.panel]){const v=Math.min(...bgs.map(b=>contrast(f,b)));if(v>bv){bv=v;best=f}}return best};
  const cfg="#fbeeea",cbg=fitContrast(dark?"#8e2328":"#7a1d1d",cfg,4.8);
  const mbg=mixHex(T.panel,T.ink,.08),mfg=fitContrast(T.ink,mbg,4.8);
  const dfg=pickFg([T.accent,T.accent2]),da=fitContrast(T.accent,dfg,4.8),db=fitContrast(T.accent2,dfg,4.8);
  const ffg=pickFg([T.accent]),fbg=fitContrast(T.accent,ffg,4.8);
  return TP_CACHE[id]={
    cursed:{bg:cbg,fg:cfg,edge:dark?mixHex(cbg,"#ffffff",.35):mixHex(cbg,"#000000",.3)},
    common:{bg:mbg,fg:mfg,edge:T.line},
    dual:{bg:da,bg2:db,fg:dfg},
    legend:{bg:GOLD.a,bg2:GOLD.b,fg:GOLD.fg,edge:GOLD.edge},
    fixed:{bg:fbg,fg:ffg}};
}
/* The app's own look ("other" on canvas): chips from the app tokens of the light or dark palette (mirrors the :root --tc-* tokens). */
function appTierPalette(col){
  return {cursed:{bg:col.cursed,fg:col.panel,edge:col.cursed},common:{bg:mixHex(col.panel,col.common,.12),fg:col.common,edge:col.line},
    dual:{bg:col.dual,bg2:col.accent,fg:col.panel},legend:{bg:GOLD.a,bg2:GOLD.b,fg:GOLD.fg,edge:GOLD.edge},fixed:{bg:col.accent,fg:col.panel}};
}
/* Category chip colours in a theme: tinted panel, ink text, accent pictogram (>= 3:1 as a graphic). */
function catChipColors(id){
  const T=THEMES[id]||THEMES.other,bg=fitContrast(mixHex(T.panel,T.accent,.14),T.ink,4.8);
  return {bg,fg:T.ink,ic:fitContrast(T.accent,bg,3)};
}
/* A setting chip carries the colours of its own theme (panel, ink, accent), whatever theme the card is in. */
function settingChipColors(id){const S=THEMES[id]||THEMES.other;return {bg:S.panel,fg:S.ink,ln:S.accent,ic:fitContrast(S.accent,S.panel,3)}}

/* Pictograms (§12.2): one set of 24x24 stroke paths, drawn as inline <svg> in the DOM and as Path2D on the canvas. No emoji. */
const PICTO={
  class:"M12 3l7 3v5c0 4.5-3 8-7 10c-4-2-7-5.5-7-10V6z",
  green:"M12 21v-8M12 13c0-4 3-6.5 7-6.5c0 4-3 6.5-7 6.5zM12 16c0-3-2.5-5.5-6-5.5c0 3 2.5 5.5 6 5.5z",
  mark:"M12 3l7 9-7 9-7-9zM12 8.5l3 3.5-3 3.5-3-3.5z",
  relation:"M8 11a3 3 0 1 0 0-6a3 3 0 0 0 0 6zM3 20c0-3 2.2-5 5-5s5 2 5 5M16.5 10a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5zM15 14.3c.5-.2 1-.3 1.5-.3c2.5 0 4.5 1.8 4.5 4.5",
  lang:"M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7M7 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2M9.5 16l2.5-7 2.5 7M10.4 13.6h3.2",
  ability:"M12 2v6M12 16v6M2 12h6M16 12h6M5.6 5.6l3.2 3.2M15.2 15.2l3.2 3.2M18.4 5.6l-3.2 3.2M8.8 15.2l-3.2 3.2",
  flaw:"M15.3 4.7A8 8 0 0 1 19.3 15.2M16.9 18.1A8 8 0 0 1 4.5 15.3M4.1 10.6A8 8 0 0 1 10.8 4.1M13.4 3.2l-1 3.6 2 1.8-1.2 3",
  old:"M6 21V10a6 6 0 0 1 12 0v11M4 21h16M14.5 14.5v1.5",
  setting:"M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6-4.5-4.1 6-.7z",
  cursed:"M12 3c3 4.5 5 7.4 5 10a5 5 0 0 1-10 0c0-2.6 2-5.5 5-10z",
  common:"M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7z",
  dual:"M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 3a4.5 4.5 0 0 0 0 9a4.5 4.5 0 0 1 0 9M12 7.4v.2M12 16.4v.2",
  legend:"M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6-4.5-4.1 6-.7z",
  fixed:"M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16zM12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7z",
  scales:"M12 4v16M8 20h8M5 7h14M5 7l-3 6h6zM19 7l-3 6h6z",
  crack:"M2 2l6 5-2 4 5 3 1 6M8 7l6-1 4 3M6 11l-3 4M14 6l2-4",
  sparkle:"M12 3v6M12 15v6M3 12h6M15 12h6M18 4v3M16.5 5.5h3",
  manual:"M4 20l4-1L19 8l-3-3L5 16zM14 7l3 3",
  extra:"M12 5v14M5 12h14",
  craft:"M13 3l8 8-2.5 2.5-8-8zM12.5 8.5L4 17l3 3 8.5-8.5M15.8 5.8l2.4-2.4",
  summary:"M20 3c-6 1-11 5-13 11l-2 6 6-2c6-2 10-7 11-13zM7 17l6-6M5 21h6",
  power:"M4 20h4v-6H4zM10 20h4V9h-4zM16 20h4V4h-4z",
  doc:"M6 3h9l3 3v15H6zM15 3v3h3M9 10h6M9 14h6M9 18h4",
  crown:"M4 18h16M4 18L3 8l5 4 4-7 4 7 5-4-1 10",
  planet:"M12 7a5 5 0 1 0 0 10a5 5 0 0 0 0-10zM3 15.5c1.5 2 17-2.5 18-7",
  circuit:"M3 12h5l2-3h4l2 3h5M8 12v6M16 12v-6M8 19.5v.1M16 4.5v.1",
  radiation:"M12 10.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3zM10 8.5L7.5 4a9 9 0 0 1 9 0L14 8.5zM9.7 14l-4.6 3.5a9 9 0 0 1-2.8-7.8l5.5.9zM14.3 14l4.6 3.5a9 9 0 0 0 2.8-7.8l-5.5.9z",
  gear:"M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6zM12 5a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1",
  moon:"M15 3a9 9 0 1 0 6 13a7 7 0 0 1-6-13z",
  bolt:"M13 2L5 13h6l-1 9 8-11h-6z",
  pad:"M6 8h12a4 4 0 0 1 4 4v2a3 3 0 0 1-5 2l-2-2H9l-2 2a3 3 0 0 1-5-2v-2a4 4 0 0 1 4-4zM7 11v3M5.5 12.5h3M16 12v.1M18 13.5v.1",
  tower:"M6 21V8l2-2V3h2v2h4V3h2v3l2 2v13zM10 21v-5h4v5",
  column:"M5 4h14M6 7h12M8 7v11M12 7v11M16 7v11M5 18h14M4 21h16",
  burst:"M12 2l2 6 6-2-3 5 5 3-6 1 1 6-5-4-5 4 1-6-6-1 5-3-3-5 6 2z",
  spiral:"M12 12a1 1 0 0 1 2 0a3 3 0 0 1-5 2a5 5 0 0 1 3-8a7 7 0 0 1 7 8a9 9 0 0 1-12 6",
  sigil:"M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 5.5l5.6 9.7H6.4zM12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z",
  constel:"M4 18l5-6 4 3 7-10M4 18v.1M9 12v.1M13 15v.1M20 5v.1",
  aquila:"M12 6v13M12 8C9 5 5 5 2 6c2 1 3 3 4 5c2-1 4-1 6 0M12 8c3-3 7-3 10-2c-2 1-3 3-4 5c-2-1-4-1-6 0M10 19h4",
  saber:"M5 19L17 7M15.5 5.5l3 3M4 20l1.5-1.5",
  hex:"M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 8l4 2.3v4.4L12 17l-4-2.3v-4.4z",
  runecircle:"M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM8.5 8.5l7 7M15.5 8.5L12 12M12 6.5v11",
  wolf:"M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM7 8l2 3 3-2 3 2 2-3M8.5 14l2 3M15.5 14l-2 3M10 14h4",
  seal:"M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16zM13 7l-3 5h4l-3 5",
  drip:"M4 4h16M7 4v5a1.5 1.5 0 0 0 3 0V4M13 4v9a1.5 1.5 0 0 0 3 0V4",
  flame:"M12 21c-4 0-6-3-6-6c0-4 4-6 4-11c3 2 5 5 5 8c1-1 1-2 1-3c2 2 2 4 2 6c0 3-2 6-6 6z",
  block:"M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8",
  vault:"M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10a5 5 0 0 0 0-10zM12 3v4M12 17v4M3 12h4M17 12h4",
  coin:"M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16zM12 7a5 5 0 1 0 0 10a5 5 0 0 0 0-10zM10 10l4 4M14 10l-4 4",
  flask:"M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7.5 15h9",
  pentagram:"M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 4.5l4.6 14L4.8 9.6h14.4L7.4 18.5z",
  tri:"M12 3l9 17H3zM12 9v6",
  tentacle:"M6 21c0-6 6-6 6-11a3 3 0 0 0-6 0M12 21c0-5 6-5 6-10a3 3 0 0 0-6 0",
  barcode:"M4 5v14M7 5v14M9 5v14M12 5v14M15 5v14M16.5 5v14M19 5v14",
  trihex:"M12 3l9 16H3zM12 9l4 7H8z",
  rain:"M6 4v4M6 11v2M12 6v6M12 15v3M18 4v2M18 9v7",
  crystal:"M12 2l5 7-5 13-5-13zM7 9h10",
  outsider:"M12 4c-4 0-7 3-7 6l7 10 7-10c0-3-3-6-7-6zM8 9l4 4 4-4",
  ac:"M12 3L4 19l8-5 8 5zM12 9l-3 6 3-2 3 2z",
  sun:"M12 5a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM3 21h18",
  axe:"M7 21L17 4M14 6c3-1 6 1 7 4c-3 0-5 0-7-1M14 6c-1 2-1 4 0 6",
  trident:"M12 21V4M7 4v5a5 5 0 0 0 10 0V4M12 2l-1.5 2h3z",
  flipcoin:"M12 4c2.8 0 5 3.6 5 8s-2.2 8-5 8s-5-3.6-5-8s2.2-8 5-8zM12 4c1.4 0 2.5 3.6 2.5 8s-1.1 8-2.5 8M3.5 8.5c-.8 1.6-.8 3.4 0 5M20.5 10.5c.8 1.6.8 3.4 0 5",
  crusade:"M10 2h4v6h6v4h-6v10h-4V12H4V8h6z",
  gasmask:"M12 3c-4 0-7 2.8-7 7c0 3.4 2 5.6 4.5 6.6h5C17 15.6 19 13.4 19 10c0-4.2-3-7-7-7zM7.2 9.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0M13.2 9.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0M10 16.6h4V21h-4zM10 19h4",
  reticle:"M12 6a6 6 0 1 0 0 12a6 6 0 0 0 0-12zM12 2v6M12 16v6M2 12h6M16 12h6M12 11.6v.8"
};
const pictoSvg=(key,cls)=>`<svg class="${cls||"pi"}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${PICTO[key]||PICTO.setting}"/></svg>`;

/* ---- procedural patterns: deterministic primitives seeded by the theme id; the same list feeds the screen (SVG data URI) and the canvas ----
   prim = {t:"l",x1,y1,x2,y2} | {t:"p",pts:[x,y,...],z (closed),f (filled)} | {t:"c",x,y,r,f} | {t:"r",x,y,w,h,f} | {t:"g",d,x,y,s} (pictogram);
   every prim has c (colour role: ink, muted, accent, accent2, line, bg, panel, gold), a (alpha), sw (stroke width). */
const PAT_TILE={glass:[120,120],filter:[168,145.492],hex:[346.41,360],trihex:[360,374.12],blocks:[176,176],bendots:[120,120],rain:[180,360],crt:[360,90],scan:[360,180]};       // tile sizes that keep the repeat seamless
const PAT_COMP={rot:"cover",flare:"cover",fog:"cover",fogrust:"cover",drip:"cover",burst:"cover",speed:"cover",sigil:"badge",runecircle:"badge",pentagram:"badge",inksun:"badge"};
const TAU2=Math.PI*2;
const PAT_TOP=["drip","burst","speed","rot","flare"];      // cover patterns anchored at the top of the card (the rest sit at the bottom)
const PATGEN={
  grid({L,w,h}){for(let x=0;x<=w;x+=12)L(x,0,x,h,"accent",x%60?.07:.16,x%60?.6:1);for(let y=0;y<=h;y+=12)L(0,y,w,y,"accent",y%60?.07:.16,y%60?.6:1)},
  fibers({R,Y,O,w,h}){for(let i=0;i<150;i++){const x=R(0,w),y=R(0,h),l=R(14,54),a=R(-.35,.35),pts=[];for(let k=0;k<4;k++){const t=k/3;pts.push(x+Math.cos(a)*l*t,y+Math.sin(a)*l*t+R(-1.5,1.5))}Y(pts,"ink",R(.05,.11),R(.4,.9))}
    for(let i=0;i<6;i++)O(R(0,w),R(0,h),R(18,60),"accent2",.035,1,true)},
  stars({R,L,O,w,h}){for(let i=0;i<130;i++)O(R(0,w),R(0,h),R(.4,1.5),"ink",R(.25,.75),1,true);for(let i=0;i<7;i++){const x=R(0,w),y=R(0,h);L(x-5,y,x+5,y,"accent",.6,.8);L(x,y-5,x,y+5,"accent",.6,.8);O(x,y,1.4,"ink",.9,1,true)}},
  scan({R,L,Q,w,h}){for(let y=0;y<h;y+=4)L(0,y,w,y,"accent",.05,1);for(let i=0;i<6;i++)Q(R(0,w-100),R(0,h),R(30,120),R(2,6),"accent2",.12)},
  scratch({R,L,O,w,h}){for(let i=0;i<70;i++){const x=R(0,w),y=R(0,h),a=R(0,TAU2),l=R(8,46);L(x,y,x+Math.cos(a)*l,y+Math.sin(a)*l,"ink",R(.06,.14),R(.5,1.1))}for(let i=0;i<120;i++)O(R(0,w),R(0,h),R(.4,1.2),"ink",R(.06,.16),1,true)},
  gears({r,R,Y,O,w,h}){for(let i=0;i<6;i++){const cx=R(0,w),cy=R(0,h),rad=R(16,46),n=8+Math.floor(r()*6),pts=[];for(let k=0;k<n*4;k++){const t=(k/(n*4))*TAU2,rr=(k%4<2)?rad*1.18:rad;pts.push(cx+Math.cos(t)*rr,cy+Math.sin(t)*rr)}Y(pts,"accent",.13,1.2,true);O(cx,cy,rad*.42,"accent",.13,1.2)}},
  fog({R,O,w,h}){for(let i=0;i<16;i++)O(R(0,w),R(h*.7,h*1.15),R(w*.17,w*.47),"ink",.035,1,true);for(let i=0;i<5;i++)O(R(0,w),R(-40,h*.3),R(w*.17,w*.4),"ink",.018,1,true)},
  bendots({O,w,h}){for(let y=0;y<h;y+=10)for(let x=(y/10%2)*5;x<w;x+=10){const k=(1+Math.sin(TAU2*x/120)*Math.cos(TAU2*y/120))/2;O(x,y,.5+2.2*k,"accent2",.16,1,true)}},
  pixels({r,R,Q,w,h}){for(let y=0;y<h;y+=12)for(let x=0;x<w;x+=12)if(r()<.22)Q(x,y,12,12,r()<.7?"accent":"accent2",R(.04,.11))},
  ornate({L,O,w,h}){for(let k=-h;k<w;k+=30){L(k,0,k+h,h,"accent",.08,.8);L(k+h,0,k,h,"accent",.08,.8)}for(let y=0;y<h;y+=30)for(let x=0;x<w;x+=30)O(x+15,y,1.4,"accent",.16,1,true)},
  marble({R,Y,w,h}){for(let i=0;i<9;i++){let x=-10,y=R(0,h);const pts=[x,y];while(x<w+10){x+=R(10,24);y+=R(-10,10);pts.push(x,y)}Y(pts,"ink",R(.05,.11),R(.6,1.6))}},
  speed({R,L,w,h}){const cx=w*.88,cy=h*.1,r1=Math.max(w,h)*1.3;for(let i=0;i<96;i++){const a=R(0,TAU2),r0=R(w*.14,w*.3);L(cx+Math.cos(a)*r0,cy+Math.sin(a)*r0,cx+Math.cos(a)*r1,cy+Math.sin(a)*r1,"ink",R(.05,.1),R(.5,1.8))}},
  sprout({r,R,Y,O,w,h}){for(let s=0;s<5;s++){const cx=R(20,w-20),cy=R(20,h-20),rays=8+Math.floor(r()*5),base=R(0,TAU2);for(let i=0;i<rays;i++){const a=base+i/rays*TAU2+R(-.12,.12),len=R(30,80),b=R(-.45,.45);Y([cx,cy,cx+Math.cos(a+b)*len*.55,cy+Math.sin(a+b)*len*.55,cx+Math.cos(a)*len,cy+Math.sin(a)*len],"accent",.08,1)}O(cx,cy,3,"accent",.1,1)}},
  spiral({R,Y,w,h}){for(let i=0;i<4;i++){const cx=R(0,w),cy=R(0,h),s=R(22,42),pts=[];for(let t=0;t<TAU2*2.5;t+=.25){const rr=s*t/(TAU2*2.5);pts.push(cx+Math.cos(t)*rr,cy+Math.sin(t)*rr)}Y(pts,"accent",.1,1.4)}},
  sigil({L,Y,O,poly,w}){const c=w/2;O(c,c,w*.46,"accent",.18,1.2);O(c,c,w*.39,"accent",.14,1);Y(poly(c,c,w*.39,3,-Math.PI/2),"accent",.16,1,true);Y(poly(c,c,w*.39,4,Math.PI/4),"accent",.12,1,true);
    for(let i=0;i<36;i++){const t=i/36*TAU2;L(c+Math.cos(t)*w*.39,c+Math.sin(t)*w*.39,c+Math.cos(t)*w*.46,c+Math.sin(t)*w*.46,"accent",.15,.8)}O(c,c,w*.13,"accent2",.2,1)},
  constel({r,R,Y,O,w,h}){for(let i=0;i<36;i++)O(R(0,w),R(0,h),R(.5,1.3),"accent2",R(.3,.7),1,true);for(let i=0;i<8;i++){let x=R(30,w-30),y=R(30,h-30);const pts=[x,y];for(let k=0;k<3+Math.floor(r()*3);k++){x+=R(-50,50);y+=R(-40,40);pts.push(x,y)}Y(pts,"accent",.22,.7);for(let j=0;j<pts.length;j+=2)O(pts[j],pts[j+1],1.6,"accent",.6,1,true)}},
  lattice({L,Y,w,h}){for(let x=0;x<w;x+=30)L(x,0,x,h,"accent",.07,.8);for(let y=0;y<h;y+=60)for(let x=0;x<w;x+=30)Y([x,y+30,x+3,y+16,x+15,y+6,x+27,y+16,x+30,y+30],"accent",.09,.8)},
  holo({R,L,O,w,h}){for(let y=0;y<h;y+=6)L(0,y,w,y,"accent2",.045,.6);for(let i=0;i<70;i++)O(R(0,w),R(0,h),R(.3,1.1),"ink",R(.2,.6),1,true)},
  hex({Y,w,h}){const s=20,dx=Math.sqrt(3)*s;for(let row=-1;row*1.5*s<h+s;row++)for(let col=-1;col*dx<w+dx;col++){const cx=col*dx+(row%2?dx/2:0),cy=row*1.5*s,pts=[];for(let k=0;k<6;k++){const t=Math.PI/6+k*Math.PI/3;pts.push(cx+Math.cos(t)*s,cy+Math.sin(t)*s)}Y(pts,"accent",.08,.8,true)}},
  runecircle({R,L,O,w}){const c=w/2;O(c,c,w*.46,"accent",.18,1.4);O(c,c,w*.38,"accent",.14,1);for(let i=0;i<16;i++){const t=i/16*TAU2,x=c+Math.cos(t)*w*.42,y=c+Math.sin(t)*w*.42;L(x,y-6,x,y+6,"accent",.2,1.2);L(x,y-2,x+R(-5,5),y+R(1,5),"accent",.2,1.2)}},
  leather({R,L,O,w,h}){for(let i=0;i<300;i++)O(R(0,w),R(0,h),R(.5,1.6),"ink",R(.03,.07),1,true);for(let i=0;i<14;i++){const x=R(0,w),y=R(0,h),a=R(0,TAU2),l=R(20,70);L(x,y,x+Math.cos(a)*l,y+Math.sin(a)*l,"ink",.04,1.2)}},
  burst({Y,w,h}){const D=Math.hypot(w,h)*1.1,n=28;for(let i=0;i<n;i+=2){const a=i/n*Math.PI/2,b=(i+1)/n*Math.PI/2;Y([0,0,Math.cos(a)*D,Math.sin(a)*D,Math.cos(b)*D,Math.sin(b)*D],"accent",.05,1,true,true)}},
  drip({R,Q,O,w,h}){for(let i=0;i<9;i++){const x=R(0,w),len=R(30,Math.min(h*.35,260)),wd=R(3,8);Q(x-wd/2,0,wd,len,"accent2",.2);O(x,len,wd*.75,"accent2",.2,1,true)}},
  embers({R,O,w,h}){for(let i=0;i<70;i++)O(R(0,w),R(0,h),R(.6,2.2),"accent",R(.15,.55),1,true);for(let i=0;i<40;i++)O(R(0,w),R(0,h),R(.4,1.2),"muted",R(.1,.3),1,true)},
  blocks({r,R,Q,w,h}){for(let y=0;y<h;y+=16)for(let x=0;x<w;x+=16){const v=r();Q(x,y,16,16,v<.33?"accent2":v<.66?"ink":"bg",R(.05,.13));if(r()<.4)Q(x+4*Math.floor(r()*3),y+4*Math.floor(r()*3),4,4,"ink",.12)}},
  crt({L,w,h}){for(let y=0;y<h;y+=3)L(0,y,w,y,"accent",y%45?.05:.1,1)},
  hazard({Y,w,h}){for(let x=-h;x<w+h;x+=40)Y([x,0,x+20,0,x+20-h,h,x-h,h],"accent",.06,1,true,true)},
  coins({R,L,O,w,h}){for(let i=0;i<16;i++){const x=R(0,w),y=R(0,h);O(x,y,14,"accent",.14,1.2);O(x,y,10,"accent",.1,.8);L(x-4,y,x+4,y,"accent",.12,.8)}},
  periodic({Q,w,h}){for(let y=0;y<h;y+=40)for(let x=0;x<w;x+=40){Q(x+2,y+2,36,36,"accent",.1,false,1);Q(x+6,y+6,7,2,"accent",.18)}},
  pentagram({L,Y,O,poly,w}){const c=w/2,p=poly(c,c,w*.42,5,-Math.PI/2);O(c,c,w*.47,"accent2",.18,1.4);O(c,c,w*.42,"accent2",.14,1);Y([p[0],p[1],p[4],p[5],p[8],p[9],p[2],p[3],p[6],p[7]],"accent2",.18,1.2,true);
    for(let i=0;i<20;i++){const t=i/20*TAU2;L(c+Math.cos(t)*w*.435,c+Math.sin(t)*w*.435,c+Math.cos(t+.05)*w*.455,c+Math.sin(t+.05)*w*.455,"accent2",.2,1)}},
  fogrust({R,L,O,w,h}){for(let i=0;i<10;i++)O(R(0,w),R(-60,h*.22),R(w*.17,w*.42),"panel",.35,1,true);for(let i=0;i<260;i++){const y=h*(.55+.45*Math.pow(R(0,1),.6));O(R(0,w),y,R(.6,2.6),"accent",R(.06,.2),1,true)}for(let i=0;i<14;i++){const x=R(0,w),y=R(h*.6,h);L(x,y,x+R(-2,2),y+R(20,70),"accent",.08,R(1,3))}},
  tentacle({R,Y,w,h}){for(let i=0;i<8;i++){const side=i%2,y0=R(0,h),ph=R(0,TAU2),amp=R(10,22),len=R(.25,.4)*w,pts=[];for(let k=0;k<=24;k++){const t=k/24,x=side?w-t*len:t*len;pts.push(x,y0+Math.sin(t*TAU2*1.2+ph)*amp*(1-t*.5))}Y(pts,"accent",.12,R(1.4,3))}},
  slash({L,w,h}){for(let k=-h;k<w+h;k+=40)L(k,0,k+h,h,"ink",.05,5)},
  trihex({L,w,h}){const a=36,rh=a*Math.sqrt(3)/2;for(let y=0;y<=h+.5;y+=rh)L(0,y,w,y,"accent",.07,.8);for(let x0=-h;x0<w+h;x0+=a){L(x0,0,x0+h/Math.sqrt(3),h,"accent",.07,.8);L(x0,0,x0-h/Math.sqrt(3),h,"accent",.07,.8)}},
  rain({r,R,O,w,h}){for(let x=6;x<w;x+=12){let y=R(0,30);while(y<h){if(r()<.5){const n=3+Math.floor(r()*7);for(let k=0;k<n;k++)O(x,y+k*6,1,"accent",R(.08,.35),1,true);y+=n*6}y+=R(20,60)}}},
  splatter({R,Y,O,w,h}){for(let i=0;i<18;i++){const x=R(0,w),y=R(0,h),s=R(4,14),c=i%2?"accent":"accent2";O(x,y,s,c,.14,1,true);for(let k=0;k<7;k++){const a=R(0,TAU2),d=R(s*1.2,s*3);O(x+Math.cos(a)*d,y+Math.sin(a)*d,R(1,3),c,.14,1,true)}}for(let i=0;i<6;i++){const x=R(0,w),y=R(0,h),s=R(8,18);Y([x,y-s,x+s*.5,y,x,y+s*1.4,x-s*.5,y],"accent2",.22,1,true)}},
  bone({R,Y,w,h}){for(let i=0;i<6;i++){const cx=R(0,w),cy=R(0,h),rad=R(60,140),a0=R(0,TAU2),pts=[];for(let k=0;k<=12;k++){const t=a0+k/12*1.4;pts.push(cx+Math.cos(t)*rad,cy+Math.sin(t)*rad)}Y(pts,"ink",.07,R(3,6))}},
  glitch({r,R,Q,L,w,h}){for(let i=0;i<14;i++){const y=R(0,h),left=r()<.5,ww=R(20,80);Q(left?0:w-ww,y,ww,R(2,8),r()<.5?"accent":"accent2",R(.08,.16))}for(let k=-h;k<w;k+=60){L(k,0,k+h,h,"ink",.04,.8);L(k+h,0,k,h,"ink",.04,.8)}},
  inksun({R,Y,O,w}){O(w*.5,w*.42,w*.3,"accent",.22,1,true);for(let i=0;i<3;i++){const pts=[];for(let k=0;k<=20;k++){const t=k/20;pts.push(w*(.04+t*.92),w*(.66+i*.1)+Math.sin(t*6+i)*4)}Y(pts,"ink",.08,R(5,10))}},
  runes({r,R,L,O,w,h}){for(let i=0;i<24;i++){const x=R(0,w),y=R(0,h),n=2+Math.floor(r()*3);L(x,y,x,y+18,"accent2",.15,1.4);for(let k=0;k<n;k++){const yy=y+R(0,14);L(x,yy,x+R(-7,7),yy+R(3,8),"accent2",.15,1.4)}}for(let i=0;i<60;i++)O(R(0,w),R(0,h),R(.6,1.6),"muted",R(.1,.25),1,true)},
  waves({Y,w,h}){for(let y=0;y<h;y+=24){const pts=[];for(let x=0;x<=w;x+=10)pts.push(x,y+Math.sin(TAU2*x/120)*5);Y(pts,"accent",.1,1)}},
  /* fh: torchlight at both edges, caked blood with drips, the coin in the top-right corner (cover, anchored at the top) */
  rot({R,Y,O,Q,L,poly,w,h}){h=Math.min(h,w*1.5);for(const sx of [0,w]){const y=h*.18+R(-20,20);for(let k=0;k<10;k++)O(sx,y,40+k*18,"hink",.018,1,true)}
    for(let i=0;i<7;i++){const x=R(20,w-20),y=R(h*.25,h*.95),s=R(6,16),pts=[];for(let k=0;k<9;k++){const t=k/9*TAU2,rr=s*R(.6,1.3);pts.push(x+Math.cos(t)*rr,y+Math.sin(t)*rr)}Y(pts,"accent",.2,1,true,true);if(i%2){const l=R(16,46);Q(x-1.5,y,3,l,"accent",.2);O(x,y+l,2.4,"accent",.2,1,true)}}
    const cx=w-40,cy=40;O(cx,cy,30,"hink",.32,2.2);O(cx,cy,23,"hink",.22,1.2);Y(poly(cx,cy,9,4,0),"hink",.3,1.4,true);for(let i=0;i<24;i++){const t=i/24*TAU2;L(cx+Math.cos(t)*26.5,cy+Math.sin(t)*26.5,cx+Math.cos(t)*29,cy+Math.sin(t)*29,"hink",.26,1)}},
  /* tc: leaded stained glass, a cross in every pane (tile 120) */
  glass({L,Q,Y,w,h}){L(0,0,w,0,"accent",.16,2);L(0,0,0,h,"accent",.16,2);Y([60,8,112,60,60,112,8,60],"accent",.12,1.2,true);Q(55,24,10,72,"accent2",.09);Q(32,50,56,10,"accent2",.09);Q(55,24,10,72,"accent",.14,false,1);Q(32,50,56,10,"accent",.14,false,1);
    for(const [x,y] of [[0,0],[w,0],[0,h],[w,h]])Y([x,y-14,x+14,y,x,y+14,x-14,y],"accent",.1,1,true,true)},
  /* ersatz: gas-mask filter mesh, hex-packed perforation (tile 168 x 145.49, seamless) */
  filter({O,w,h}){const dx=12,dy=dx*Math.sqrt(3)/2;for(let r=0;r*dy<=h+.5;r++)for(let x=(r%2?dx/2:0)-dx;x<=w+dx;x+=dx)O(x,r*dy,3.2,"hink",.1,1)},
  /* trenchface: night sky, a pale flare with its trail, the object in the sky, stars (cover, anchored at the top) */
  flare({R,Y,O,L,w,h}){h=Math.min(h,w*1.5);for(let i=0;i<70;i++)O(R(0,w),R(0,h*.6),R(.4,1.2),"ink",R(.15,.45),1,true);
    const fx=w*.9,fy=h*.045;[150,110,76,46,22].forEach((r,k)=>O(fx,fy,r,"accent",[.035,.045,.06,.09,.22][k],1,true));O(fx,fy,4,"accent",.9,1,true);
    {const pts=[];for(let k=0;k<=16;k++){const t=k/16;pts.push(fx-90*(1-t),fy+(h*.3-fy)*(1-t)*(1-t)+Math.sin(t*9)*1.5)}Y(pts,"accent2",.28,1.4)}
    const ox=w*.62,oy=h*.17,el=[];for(let k=0;k<24;k++){const t=k/24*TAU2;el.push(ox+Math.cos(t)*38,oy+Math.sin(t)*6.5)}Y(el,"muted",.4,1,true,true);Y(el,"accent",.45,1,true);
    Y([ox-14,oy-4,ox-8,oy-13,ox+8,oy-13,ox+14,oy-4],"accent",.4,1);for(const d of [-20,0,20])O(ox+d,oy+9,1.8,"accent2",.7,1,true);L(ox-28,oy+12,ox-40,oy+60,"accent",.06,10);L(ox+28,oy+12,ox+40,oy+60,"accent",.06,10)}
};
/* pattern primitives of theme `id` for a w x h area (a tile for repeating patterns, the whole area for "cover", a square for "badge") */
function patPrims(id,w,h){
  const T=THEMES[id]||THEMES.other,gen=PATGEN[T.pattern];
  const P=[];if(!gen)return P;
  const r=mulberry(hashStr("pat:"+id)),R=(a,b)=>a+r()*(b-a);
  const L=(x1,y1,x2,y2,c,a,sw)=>P.push({t:"l",x1,y1,x2,y2,c,a,sw:sw||1});
  const Y=(pts,c,a,sw,z,f)=>P.push({t:"p",pts,c,a,sw:sw||1,z:!!z,f:!!f});
  const O=(x,y,rad,c,a,sw,f)=>P.push({t:"c",x,y,r:rad,c,a,sw:sw||1,f:!!f});
  const Q=(x,y,ww,hh,c,a,f,sw)=>P.push({t:"r",x,y,w:ww,h:hh,c,a,f:f!==false,sw:sw||1});
  const poly=(cx,cy,rad,n,rot)=>{const pts=[];for(let i=0;i<n;i++){const t=rot+i/n*TAU2;pts.push(cx+Math.cos(t)*rad,cy+Math.sin(t)*rad)}return pts};
  gen({r,R,L,Y,O,Q,poly,w,h});
  return P;
}
/* how a pattern repeats: tile (with its size), cover (one composition over the whole card) or badge (a square motif in the top-right corner) */
function patSpec(id){const k=(THEMES[id]||THEMES.other).pattern,m=PAT_COMP[k]||"tile";return {kind:k,mode:m,tile:PAT_TILE[k]||[360,360]}}

/* Header ornament and dividers (§12): primitives in a w x h strip, centred on h/2. The theme glyph sits in the middle (with a bg-coloured gap). */
function ornPrims(kind,w,h){
  const P=[],m=h/2,L=(x1,y1,x2,y2,c,a,sw)=>P.push({t:"l",x1,y1,x2,y2,c,a,sw}),Y=(pts,c,a,sw,z,f)=>P.push({t:"p",pts,c,a,sw,z:!!z,f:!!f}),O=(x,y,r,c,a,sw,f)=>P.push({t:"c",x,y,r,c,a,sw,f:!!f}),Q=(x,y,ww,hh,c,a)=>P.push({t:"r",x,y,w:ww,h:hh,c,a,f:true,sw:1});
  const dia=(x,y,s,c,f)=>Y([x,y-s,x+s,y,x,y+s,x-s,y],c,.9,1.2,true,f);
  let gap=true;
  switch(kind){
    case "rule":L(0,m,w,m,"line",1,1.2);Q(0,m-1.5,46,3,"accent",1);break;
    case "wire":{const a=[],b=[];for(let x=0;x<=w;x+=4){a.push(x,m+Math.sin(x/9)*2.6);b.push(x,m-Math.sin(x/9)*2.6)}Y(a,"accent",.85,1.3);Y(b,"accent",.85,1.3);
      for(let x=14;x<w;x+=36){L(x-4,m-5,x+4,m+5,"accent",.9,1.4);L(x+4,m-5,x-4,m+5,"accent",.9,1.4)}break}
    case "vignette":L(0,m,w/2-34,m,"accent",.8,1);L(w/2+34,m,w,m,"accent",.8,1);O(w/2-30,m,3.5,"accent",.85,1.2);O(w/2+30,m,3.5,"accent",.85,1.2);dia(4,m,3.5,"accent",true);dia(w-4,m,3.5,"accent",true);break;
    case "brackets":Y([10,2,1,2,1,h-2,10,h-2],"accent",.9,2);Y([w-10,2,w-1,2,w-1,h-2,w-10,h-2],"accent",.9,2);for(let x=20;x<w-26;x+=12)L(x,m,x+6,m,"accent",.6,1.2);break;
    case "glitch":L(0,m,w,m,"accent",.9,2);Q(w*.18,m-5,60,3,"accent2",.8);Q(w*.62,m+3,90,2,"accent2",.8);Q(w*.4,m-1.5,30,2,"ink",.5);break;
    case "stencil":for(let x=0;x<w;x+=30)Q(x,m-3,20,6,"accent",.85);break;
    case "gearline":L(0,m,w,m,"accent",.8,1.5);for(let x=24;x<w;x+=48)O(x,m,3.5,"accent",.9,1.5);break;
    case "drip":L(0,m-3,w,m-3,"accent",.9,2.5);for(let i=0;i<6;i++){const x=w*(.06+i*.18),l=(i%3+1)*2.5+2;Q(x-1.5,m-3,3,l,"accent",.9);O(x,m-3+l,2,"accent",.9,1,true)}break;
    case "burst":{const pts=[];for(let x=0,k=0;x<=w;x+=10,k++)pts.push(x,k%2?m-4:m+4);Y(pts,"accent2",.85,1.6);break}
    case "pixel":for(let x=0;x<w;x+=12)Q(x,m-3,8,6,(x/12)%3?"accent":"accent2",.9);gap=false;break;
    case "diamond":L(0,m,w,m,"accent",.7,1);dia(5,m,4,"accent",true);dia(w-5,m,4,"accent",true);dia(w*.25,m,3,"accent",false);dia(w*.75,m,3,"accent",false);break;
    case "meander":{L(0,2,w,2,"accent",.85,1.4);L(0,h-2,w,h-2,"accent",.85,1.4);for(let x=2;x+14<=w;x+=18)Y([x,h-5,x,5,x+13,5,x+13,h-8,x+6,h-8,x+6,9.5],"accent",.85,1.4);gap=false;break}
    case "double":L(0,m-3,w,m-3,"accent",.8,1);L(0,m+3,w,m+3,"accent",.8,1);break;
    case "dots":for(let x=4;x<w;x+=14)O(x,m,1.6,"accent",.8,1,true);break;
    case "wave":{const pts=[];for(let x=0;x<=w;x+=6)pts.push(x,m+Math.sin(x/14)*4);Y(pts,"accent",.8,1.4);break}
    case "chevron":for(let x=0;x+6<=w;x+=18)Y([x,m-5,x+6,m,x,m+5],"accent",.85,2);break;
    case "bars":{const rr=mulberry(7);let x=0;while(x<w){const ww=1+Math.floor(rr()*4);Q(x,m-6,ww,12,"ink",.8);x+=ww+2+Math.floor(rr()*3)}gap=false;break}
    case "brush":{const top=[],bot=[];for(let k=0;k<=24;k++){const t=k/24,x=t*w;top.push(x,m-1-3.5*Math.sin(t*Math.PI));bot.unshift(x,m+1+4.5*Math.sin(t*Math.PI)+(k%3?0:.8))}Y(top.concat(bot),"accent2",.85,1,true,true);gap=false;break}
    default:L(0,m,w,m,"line",1,1);
  }
  return {prims:P,gap};
}

/* SVG for primitives. cmap: colour role -> CSS colour (hex for data URIs, var(--ct-*) for inline SVG). Styles go in style attributes so var() works inline. */
const n1=v=>Math.round(v*10)/10;
function primsSvgBody(prims,cmap){
  let s="";
  for(const p of prims){
    const c=cmap[p.c]||p.c,a=Math.round(p.a*1000)/1000;
    const st=p.f?`fill:${c};fill-opacity:${a};stroke:none`:`fill:none;stroke:${c};stroke-opacity:${a};stroke-width:${n1(p.sw||1)};stroke-linecap:round;stroke-linejoin:round`;
    if(p.t==="l")s+=`<line x1="${n1(p.x1)}" y1="${n1(p.y1)}" x2="${n1(p.x2)}" y2="${n1(p.y2)}" style="fill:none;stroke:${c};stroke-opacity:${a};stroke-width:${n1(p.sw||1)};stroke-linecap:round"/>`;
    else if(p.t==="p")s+=`<${p.z||p.f?"polygon":"polyline"} points="${p.pts.map(n1).join(" ")}" style="${st}"/>`;
    else if(p.t==="c")s+=`<circle cx="${n1(p.x)}" cy="${n1(p.y)}" r="${n1(p.r)}" style="${st}"/>`;
    else if(p.t==="r")s+=`<rect x="${n1(p.x)}" y="${n1(p.y)}" width="${n1(p.w)}" height="${n1(p.h)}" style="${st}"/>`;
    else if(p.t==="g")s+=`<path d="${p.d}" transform="translate(${n1(p.x)} ${n1(p.y)}) scale(${Math.round(p.s/24*1000)/1000})" style="fill:none;stroke:${c};stroke-opacity:${a};stroke-width:${n1((p.sw||2)*24/p.s)};stroke-linecap:round;stroke-linejoin:round"/>`;
  }
  return s;
}
const svgDoc=(body,w,h)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${n1(w)}" height="${n1(h)}" viewBox="0 0 ${n1(w)} ${n1(h)}">${body}</svg>`;
const svgUrl=svg=>`url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
const themeCmap=T=>({ink:T.ink,muted:T.muted,accent:T.accent,accent2:T.accent2,line:T.line,bg:T.bg,panel:T.panel,gold:GOLD.a,hink:hinkOf(T)});
const CSS_CMAP={ink:"var(--ct-ink)",muted:"var(--ct-muted)",accent:"var(--ct-accent)",accent2:"var(--ct-accent2)",line:"var(--ct-line)",bg:"var(--ct-bg)",panel:"var(--ct-panel)",gold:"var(--gold-a)",hink:"var(--ct-hink)"};
/* the header ornament as inline SVG (colours through CSS variables, so the markup carries no colour values) */
function ornSvg(id){
  const T=THEMES[id]||THEMES.other,w=360,h=22,o=ornPrims(T.ornament,w,h);
  const g=o.gap?`<rect x="${w/2-17}" y="0" width="34" height="${h}" style="fill:var(--ct-bg)"/>`+primsSvgBody([{t:"g",d:PICTO[T.glyph]||PICTO.setting,x:w/2-10,y:1,s:20,c:"accent",a:1,sw:2}],CSS_CMAP):"";
  return `<svg class="ct-orn" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${primsSvgBody(o.prims,CSS_CMAP)}${g}</svg>`;
}
const glyphUrl=(key,color,a,sw)=>svgUrl(svgDoc(primsSvgBody([{t:"g",d:PICTO[key]||PICTO.setting,x:0,y:0,s:24,c:color,a:a==null?1:a,sw:sw||1.8}],{}),24,24));

/* One CSS rule per theme, injected the first time a card in that theme is rendered (ensureTheme). App tokens are remapped inside the wrapper so
   buttons, inputs, hints and labels follow the theme and stay readable. withTiers=false (player page) leaves the tier tokens out entirely. */
const THEME_CSS_CACHE={};
function themeCss(id,withTiers){
  id=isTheme(id)?id:"other";
  const key=id+(withTiers?"|t":"");
  if(THEME_CSS_CACHE[key])return THEME_CSS_CACHE[key];
  const T=THEMES[id],F=themeFonts(id),sel=`.card-theme[data-ct="${id}"]`,v=[];
  const put=(k,val)=>v.push(`--${k}:${val}`);
  const neutral="#8a8a8a";
  if(id==="other"){
    put("ct-bg","var(--bg)");put("ct-panel","var(--panel)");put("ct-ink","var(--fg)");put("ct-muted","var(--muted)");put("ct-line","var(--line)");put("ct-accent","var(--accent)");put("ct-accent2","var(--dual)");
    put("ct-hink","var(--fg)");put("ct-hmuted","var(--muted)");put("ct-seg","var(--accent)");put("ct-ok","var(--accent)");put("ct-warn","var(--dual)");put("ct-stamp","var(--muted)");
    put("ct-display",F.display);put("ct-name",F.name);put("ct-body",F.body);put("ct-hand",F.hand);put("ct-r","10px");
    put("cc-bg","var(--accent-soft)");put("cc-fg","var(--fg)");put("cc-ic","var(--accent)");
    if(withTiers){put("ct-crack",glyphUrl("crack",neutral,.55,1.4));put("ct-scales",glyphUrl("scales",neutral,.5));put("ct-spark",glyphUrl("sparkle",GOLD.a,.95,2))}
    return THEME_CSS_CACHE[key]=`${sel}{${v.join(";")}}`;
  }
  const link=fitContrast(T.accent,T.panel,4.6),onLink=contrast("#ffffff",link)>=contrast("#141414",link)?"#ffffff":"#141414";
  const soft=fitContrast(mixHex(T.panel,T.accent,.14),T.ink,4.6),field=fitContrast(mixHex(T.panel,T.ink,.06),T.ink,4.6);
  const cc=catChipColors(id),ps=patSpec(id);
  put("ct-bg",T.bg);put("ct-panel",T.panel);put("ct-ink",T.ink);put("ct-muted",T.muted);put("ct-line",T.line);put("ct-accent",T.accent);put("ct-accent2",T.accent2);
  put("ct-hink",hinkOf(T));put("ct-hmuted",hmutedOf(T));{const sc=segColors(T);put("ct-seg",sc.on);put("ct-seg-off",sc.off)}put("ct-glow",rgba(T.accent,.35));put("ct-hz",isDarkTheme(T)?"#0d0d0d":"#1a1a1a");
  put("ct-ok",fitContrast(T.accent,T.bg,4.6));put("ct-warn",fitContrast(T.accent2,T.bg,4.6));put("ct-stamp",fitContrast(T.accent2,T.panel,4.6));
  put("ct-display",F.display);put("ct-name",F.name);put("ct-body",F.body);put("ct-hand",F.hand);put("ct-dw",F.dw);put("ct-nw",F.nw);put("ct-ds",F.ds);put("ct-ns",F.ns);put("ct-r",(T.radius||0)+"px");
  put("cc-bg",cc.bg);put("cc-fg",cc.fg);put("cc-ic",cc.ic);
  put("bg",field);put("panel",T.panel);put("fg",T.ink);put("muted",fitContrast(T.muted,T.panel,4.6));put("line",T.line);put("accent",link);put("accent-soft",soft);put("on-accent",onLink);
  put("cursed",fitContrast("#c0392b",T.panel,4.6));put("display",F.name);put("body",F.body);
  put("ct-grad",T.grad?`linear-gradient(${T.grad[0]},${T.grad[1]})`:"none");
  if(ps.mode==="tile"){put("ct-pat",svgUrl(svgDoc(primsSvgBody(patPrims(id,ps.tile[0],ps.tile[1]),themeCmap(T)),ps.tile[0],ps.tile[1])));put("ct-pat-rep","repeat");put("ct-pat-pos","0 0");put("ct-pat-size","auto")}
  else if(ps.mode==="badge"){put("ct-pat",svgUrl(svgDoc(primsSvgBody(patPrims(id,360,360),themeCmap(T)),360,360)));put("ct-pat-rep","no-repeat");put("ct-pat-pos","right -70px top -70px");put("ct-pat-size","300px 300px")}
  else{const top=PAT_TOP.includes(ps.kind);put("ct-pat",svgUrl(svgDoc(primsSvgBody(patPrims(id,360,top?540:420),themeCmap(T)),360,top?540:420)));put("ct-pat-rep","no-repeat");put("ct-pat-pos",top?"0 0":"center bottom");put("ct-pat-size","100% auto")}
  if(["brass","gothic","seal"].includes(T.frame))put("ct-cg",glyphUrl(T.frame==="brass"?"gear":T.glyph,T.accent,.95,1.8));
  if(T.frame==="meander"){const o=ornPrims("meander",36,11);put("ct-band",svgUrl(svgDoc(primsSvgBody(o.prims,themeCmap(T)),36,11)))}
  if(T.frame==="brush"){const o=ornPrims("brush",240,12);put("ct-brush",svgUrl(svgDoc(primsSvgBody(o.prims,themeCmap(T)),240,12)))}
  if(withTiers){
    const tp=tierPalette(id);
    put("tc-cursed-bg",tp.cursed.bg);put("tc-cursed-fg",tp.cursed.fg);put("tc-cursed-edge",tp.cursed.edge);
    put("tc-common-bg",tp.common.bg);put("tc-common-fg",tp.common.fg);put("tc-common-edge",tp.common.edge);
    put("tc-dual-a",tp.dual.bg);put("tc-dual-b",tp.dual.bg2);put("tc-dual-fg",tp.dual.fg);
    put("tc-fixed-bg",tp.fixed.bg);put("tc-fixed-fg",tp.fixed.fg);
    put("ct-crack",glyphUrl("crack",T.ink,.4,1.4));put("ct-scales",glyphUrl("scales",T.ink,.35));put("ct-spark",glyphUrl("sparkle",GOLD.a,.95,2));
  }
  return THEME_CSS_CACHE[key]=`${sel}{${v.join(";")}}`;
}
/* data attributes of a themed wrapper; data-chip (the tier chip shape) only where tier chips can appear */
function themeAttrs(id,gm){id=isTheme(id)?id:"other";const T=THEMES[id];return `data-ct="${id}" data-frame="${T.frame}" data-seg="${T.segment}"${gm?` data-chip="${T.chip}"`:""}`}

/* ---- label markup (§12.2) ---- */
/* Category chip: pictogram + label; class "cat" kept for the old selectors. Setting chips wear the colours and glyph of their own theme. */
function catChipHtml(key,label,stid){
  if(key==="setting"){
    const id=isTheme(stid)?stid:"other",S=THEMES[id],c=settingChipColors(id);
    return `<span class="cat cchip" data-cat="setting" title="${esc(themeName(id))}" style="--sc-bg:${c.bg};--sc-fg:${c.fg};--sc-ln:${c.ln};--sc-ic:${c.ic}">${pictoSvg(S.glyph)}<span>${esc(label)}</span></span>`;
  }
  return `<span class="cat cchip" data-cat="${esc(key||"none")}">${pictoSvg(PICTO[key]?key:"setting")}<span>${esc(label)}</span></span>`;
}

function mdBlocks(t){
  const out=[];
  for(const raw of String(t==null?"":t).replace(/\r/g,"").split("\n")){
    const l=raw.replace(/\s+$/,"");
    if(/^##\s+/.test(l))out.push({k:"h",s:l.replace(/^##\s+/,"")});
    else if(/^-\s+/.test(l))out.push({k:"li",s:l.replace(/^-\s+/,"")});
    else if(!l.trim())out.push({k:"br"});
    else{const last=out[out.length-1];if(last&&last.k==="p")last.s+="\n"+l;else out.push({k:"p",s:l})}
  }
  return out.filter((b,i,a)=>b.k!=="br"||(i>0&&a[i-1].k!=="br"));
}
function mdLite(t){
  let h="",ul=false;
  for(const b of mdBlocks(t)){
    if(b.k!=="li"&&ul){h+="</ul>";ul=false}
    if(b.k==="h")h+=`<h4>${esc(b.s)}</h4>`;
    else if(b.k==="li"){if(!ul){h+="<ul>";ul=true}h+=`<li>${esc(b.s)}</li>`}
    else if(b.k==="p")h+=`<p>${esc(b.s).replace(/\n/g,"<br>")}</p>`;
  }
  return h+(ul?"</ul>":"");
}

const MAGIC_FAM={            // genre family -> particles (p), sound recipe (s), water-drop pitch in Hz
  real:{p:"dust",s:"real",pitch:1175},fantasy:{p:"mote",s:"fantasy",pitch:1046},scifi:{p:"star",s:"scifi",pitch:1200},cyber:{p:"rain",s:"cyber",pitch:1400},
  post:{p:"ash",s:"post",pitch:520},steam:{p:"spark",s:"steam",pitch:700},horror:{p:"dust",s:"horror",pitch:330},hero:{p:"comic",s:"hero",pitch:990},
  game:{p:"pixel",s:"game",pitch:1318},hist:{p:"ember",s:"hist",pitch:600},myth:{p:"mote",s:"myth",pitch:880},anime:{p:"petal",s:"anime",pitch:1568},
  other:{p:"spore",s:"other",pitch:932}};
const MAGIC_VARIANT={        // universes that are not just their genre (missing keys fall back to the genre family)
  souls:{p:"ember",s:"hist",pitch:440},silenthill:{p:"ash"},lovecraft:{p:"bubble",pitch:280},percy:{p:"bubble"},tsushima:{p:"petal"},gow:{p:"snow"},
  fh:{p:"ember",pitch:300},tc:{p:"ash"},ersatz:{p:"spore",pitch:360},trenchface:{p:"ash"},sw:{p:"star"},wh40k:{p:"ash"},hp:{p:"mote"},fallout:{p:"dust"},arcane:{p:"spark"}};
// ZG: жанр вселенной передаётся вторым аргументом (на клиенте нет UNIVERSES).
function magicFamily(id,genre){
  const g=MAGIC_FAM[id]?id:(genre||id),base=MAGIC_FAM[g]||MAGIC_FAM.other;
  return Object.assign({},base,MAGIC_VARIANT[id]||{});
}
/* a theme can later get a real ambience file: {themeId: url}. Empty: every theme uses its synth recipe. */

export {THEMES,isTheme,themeFor,themeName,settingThemeOf,themeFamilies,fontsHref,PRELOADED_FONTS,FALLBACK_COLORS,themeCss,themeAttrs,ornSvg,
  pictoSvg,PICTO,catChipHtml,mdLite,esc,dot,DEMAND_WORDS,magicFamily,isDarkTheme,mixHex,relLum,patPrims,patSpec,primsSvgBody,svgDoc,svgUrl,themeCmap};
