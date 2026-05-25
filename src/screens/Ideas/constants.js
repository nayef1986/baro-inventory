// Ideas/constants.js — ثوابت مشتركة

export const TYPES = [
  { key:"bundle",   icon:"🎁", label:"كومبو",   color:"#d4a853" },
  { key:"discount", icon:"🔥", label:"خصم",     color:"#e8855a" },
  { key:"buy3",     icon:"⭐", label:"اشتري 3", color:"#c9a96e" },
  { key:"seasonal", icon:"🌸", label:"موسمي",   color:"#b8976a" },
  { key:"clear",    icon:"💨", label:"تصفية",   color:"#8aab8e" },
  { key:"new",      icon:"✨", label:"جديد",    color:"#a89fc4" },
];

export const S = {
  bg:     "#0a0804",
  card:   "rgba(255,245,220,0.06)",
  border: "rgba(212,168,83,0.18)",
  gold:   "#d4a853",
  white:  "#ffffff",
  dim:    "rgba(255,255,255,0.55)",
  faint:  "rgba(255,255,255,0.12)",
  r:      "20px",
  rs:     "13px",
};

export const fm = n => Number(n||0).toLocaleString("en-US",{maximumFractionDigits:1});
export const fp = n => Number(n||0).toFixed(1) + "%";
export const todayAr = () => new Date().toLocaleDateString("ar-SA",{weekday:"long",day:"numeric",month:"long"});
