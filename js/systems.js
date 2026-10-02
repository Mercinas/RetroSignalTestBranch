export const INPUT_MAX = 0x7fff;

export const KEYBOARD_CONTROL_SLOTS = Object.freeze([
  [0, "A"], [1, "B"], [2, "X"], [3, "Y"], [4, "L1"], [5, "R1"], [6, "L2"], [7, "R2"],
  [8, "SELECT"], [9, "START"], [10, "UP"], [11, "DOWN"], [12, "LEFT"], [13, "RIGHT"],
  [14, "L3"], [15, "R3"], [16, "STICK UP"], [17, "STICK DOWN"], [18, "STICK LEFT"], [19, "STICK RIGHT"],
  [20, "C-UP"], [21, "C-DOWN"], [22, "C-LEFT"], [23, "C-RIGHT"], [24, "QUICK SAVE"], [25, "QUICK LOAD"],
]);

const COMMON_EXTENSIONS = ["zip", "7z"];

const standardButtons = [
  [0, 8],
  [1, 0],
  [2, 9],
  [3, 1],
  [8, 2],
  [9, 3],
  [12, 4],
  [13, 5],
  [14, 6],
  [15, 7],
  [4, 10],
  [5, 11],
  [6, 12],
  [7, 13],
  [10, 14],
  [11, 15],
];

const playStationButtons = [
  [0, 0],
  [1, 8],
  [2, 1],
  [3, 9],
  [8, 2],
  [9, 3],
  [12, 4],
  [13, 5],
  [14, 6],
  [15, 7],
  [4, 10],
  [5, 11],
  [6, 12],
  [7, 13],
  [10, 14],
  [11, 15],
];

const n64Buttons = [
  [0, 0],
  [2, 1],
  [9, 3],
  [12, 4],
  [13, 5],
  [14, 6],
  [15, 7],
  [4, 10],
  [5, 11],
  [6, 12],
];

const atariButtons = [
  [0, 0],
  [8, 2],
  [9, 3],
  [12, 4],
  [13, 5],
  [14, 6],
  [15, 7],
];

const sixButtonPad = standardButtons;

const keyboardSlots = Object.freeze({
  oneButton: Object.freeze([[0, "FIRE"], [8, "SELECT"], [9, "RESET/START"], [10, "UP"], [11, "DOWN"], [12, "LEFT"], [13, "RIGHT"]]),
  twoButton: Object.freeze([[0, "A"], [1, "B"], [8, "SELECT"], [9, "START"], [10, "UP"], [11, "DOWN"], [12, "LEFT"], [13, "RIGHT"]]),
  threeButton: Object.freeze([[0, "A"], [1, "B"], [2, "C"], [8, "SELECT"], [9, "START"], [10, "UP"], [11, "DOWN"], [12, "LEFT"], [13, "RIGHT"]]),
  snes: Object.freeze([[0, "A"], [1, "B"], [2, "X"], [3, "Y"], [4, "L"], [5, "R"], [8, "SELECT"], [9, "START"], [10, "UP"], [11, "DOWN"], [12, "LEFT"], [13, "RIGHT"]]),
  psx: Object.freeze([[0, "CROSS"], [1, "CIRCLE"], [2, "SQUARE"], [3, "TRIANGLE"], [4, "L1"], [5, "R1"], [6, "L2"], [7, "R2"], [8, "SELECT"], [9, "START"], [10, "UP"], [11, "DOWN"], [12, "LEFT"], [13, "RIGHT"]]),
  n64: Object.freeze([[0, "A"], [1, "B"], [2, "Z"], [3, "START"], [4, "L"], [5, "R"], [6, "C-UP"], [7, "C-DOWN"], [8, "C-LEFT"], [9, "C-RIGHT"], [10, "UP"], [11, "DOWN"], [12, "LEFT"], [13, "RIGHT"]]),
  sixButton: Object.freeze([[0, "A"], [1, "B"], [2, "C"], [3, "X"], [4, "Y"], [5, "Z"], [8, "SELECT"], [9, "START"], [10, "UP"], [11, "DOWN"], [12, "LEFT"], [13, "RIGHT"]]),
});

function keyboardSlotsForScheme(scheme) {
  if (scheme === "atari2600") return keyboardSlots.oneButton;
  if (["gb", "gba", "nes", "segaMS", "atari5200", "atari7800", "segaGG", "lynx", "vb"].includes(scheme)) return keyboardSlots.twoButton;
  if (scheme === "n64") return keyboardSlots.n64;
  if (scheme === "psx") return keyboardSlots.psx;
  if (["segaMD", "segaCD", "sega32x", "segaSaturn"].includes(scheme)) return keyboardSlots.sixButton;
  if (scheme === "snes") return keyboardSlots.snes;
  return keyboardSlots.threeButton;
}

function system(definition) {
  return Object.freeze({
    biosRequired: false,
    biosFileNames: null,
    biosNamePatterns: [],
    archiveContentExtensions: [],
    analog: false,
    stickAsDpad: true,
    buttons: standardButtons,
    mappingLines: ["A/B/X/Y: FACE BUTTONS", "VIEW: SELECT", "MENU: START", "D-PAD / LEFT STICK: MOVE"],
    keyboardMappingLines: ["X/S/V/ENTER: A/B/X/Y", "ARROW KEYS: D-PAD", "TAB/R: SELECT/START", "Z/A/Q/E: L1/R1/L2/R2"],
    keyboardControlSlots: keyboardSlotsForScheme(definition.controlScheme),
    ...definition,
  });
}

export const SYSTEMS = Object.freeze([
  system({
    id: "n64",
    shortName: "N64",
    name: "Nintendo 64",
    core: "mupen64plus_next",
    controlScheme: "n64",
    folder: "roms",
    property: "romFile",
    extensions: ["z64", "n64", "v64", ...COMMON_EXTENSIONS],
    biosRequired: false,
    buttons: n64Buttons,
    analog: true,
    stickAsDpad: false,
    mappingLines: ["A: A   X: B   LT: Z", "LB/RB: L/R", "LEFT STICK: STICK", "RIGHT STICK: C BUTTONS"],
  }),
  system({
    id: "gb",
    shortName: "GB / GBC",
    name: "Game Boy / Game Boy Color",
    core: "gambatte",
    controlScheme: "gb",
    folder: "roms/gb",
    property: "romGb",
    extensions: ["gb", "gbc", "dmg", ...COMMON_EXTENSIONS],
    biosRequired: false,
    buttons: standardButtons,
    analog: false,
    stickAsDpad: true,
    mappingLines: ["A: A   B: B", "VIEW: SELECT", "MENU: START", "D-PAD / LEFT STICK: MOVE"],
  }),
  system({
    id: "gba",
    shortName: "GBA",
    name: "Game Boy Advance",
    core: "mgba",
    controlScheme: "gba",
    folder: "roms/gba",
    property: "romGba",
    extensions: ["gba", ...COMMON_EXTENSIONS],
    biosRequired: false,
    buttons: standardButtons,
    analog: false,
    stickAsDpad: true,
    mappingLines: ["A: A   B: B", "LB/RB: L/R", "VIEW: SELECT   MENU: START", "D-PAD / LEFT STICK: MOVE"],
  }),
  system({
    id: "atari2600",
    shortName: "ATARI 2600",
    name: "Atari 2600",
    core: "stella2014",
    controlScheme: "atari2600",
    folder: "roms/atari2600",
    property: "romAtari2600",
    extensions: ["a26", "bin", ...COMMON_EXTENSIONS],
    biosRequired: false,
    buttons: atariButtons,
    analog: false,
    stickAsDpad: true,
    mappingLines: ["A: FIRE", "VIEW: SELECT", "MENU: RESET", "D-PAD / LEFT STICK: MOVE"],
  }),
  system({
    id: "atari5200",
    shortName: "ATARI 5200",
    name: "Atari 5200",
    core: "a5200",
    controlScheme: "atari5200",
    folder: "roms/atari5200",
    property: "romAtari5200",
    extensions: ["a52", "bin", "rom", ...COMMON_EXTENSIONS],
    buttons: atariButtons,
    mappingLines: ["A: FIRE", "VIEW: SELECT", "MENU: START", "D-PAD / LEFT STICK: MOVE"],
  }),
  system({
    id: "nes",
    shortName: "NES",
    name: "Nintendo Entertainment System",
    core: "fceumm",
    controlScheme: "nes",
    folder: "roms/nes",
    property: "romNes",
    extensions: ["nes", "unf", "unif", ...COMMON_EXTENSIONS],
    mappingLines: ["A: A   B: B", "VIEW: SELECT", "MENU: START", "D-PAD / LEFT STICK: MOVE"],
  }),
  system({
    id: "mastersystem",
    shortName: "MASTER SYSTEM",
    name: "Sega Master System",
    core: "smsplus",
    controlScheme: "segaMS",
    folder: "roms/mastersystem",
    property: "romMasterSystem",
    extensions: ["sms", "sg", "bin", ...COMMON_EXTENSIONS],
    mappingLines: ["A: BUTTON 1   B: BUTTON 2", "VIEW: PAUSE", "D-PAD / LEFT STICK: MOVE"],
  }),
  system({
    id: "atari7800",
    shortName: "ATARI 7800",
    name: "Atari 7800",
    core: "prosystem",
    controlScheme: "atari7800",
    folder: "roms/atari7800",
    property: "romAtari7800",
    extensions: ["a78", "bin", ...COMMON_EXTENSIONS],
    buttons: atariButtons,
    mappingLines: ["A/B: FIRE", "VIEW: SELECT", "MENU: RESET", "D-PAD / LEFT STICK: MOVE"],
  }),
  system({
    id: "tg16",
    shortName: "TURBOGRAFX-16",
    name: "TurboGrafx-16 / PC Engine",
    core: "mednafen_pce",
    controlScheme: "pce",
    folder: "roms/tg16",
    property: "romTg16",
    extensions: ["pce", "sgx", ...COMMON_EXTENSIONS],
    mappingLines: ["A: II   B: I", "VIEW: SELECT", "MENU: RUN", "D-PAD / LEFT STICK: MOVE"],
  }),
  system({
    id: "genesis",
    shortName: "GENESIS",
    name: "Sega Genesis / Mega Drive",
    core: "genesis_plus_gx",
    controlScheme: "segaMD",
    folder: "roms/genesis",
    property: "romGenesis",
    extensions: ["md", "smd", "gen", "bin", ...COMMON_EXTENSIONS],
    buttons: sixButtonPad,
    mappingLines: ["A/B/X: A/B/C", "Y/LB/RB: X/Y/Z", "MENU: START", "D-PAD / LEFT STICK: MOVE"],
  }),
  system({
    id: "tgcd",
    shortName: "TURBOGRAFX-CD",
    name: "TurboGrafx-CD / PC Engine CD",
    core: "mednafen_pce",
    controlScheme: "pce",
    folder: "roms/tgcd",
    property: "romTgcd",
    extensions: ["chd", "cue", "ccd", "iso", ...COMMON_EXTENSIONS],
    archiveContentExtensions: ["bin"],
    biosRequired: true,
    biosKey: "tgcd",
    biosFolder: "bios/tgcd",
    biosProperty: "tgcdBios",
    biosExtensions: ["pce", "rom", "bin"],
    biosLabel: "TurboGrafx-CD system card",
    mappingLines: ["A: II   B: I", "VIEW: SELECT", "MENU: RUN", "D-PAD / LEFT STICK: MOVE"],
  }),
  system({
    id: "snes",
    shortName: "SNES",
    name: "Super Nintendo",
    core: "snes9x",
    controlScheme: "snes",
    folder: "roms/snes",
    property: "romSnes",
    extensions: ["sfc", "smc", "fig", "swc", ...COMMON_EXTENSIONS],
    biosRequired: false,
    buttons: standardButtons,
    analog: false,
    stickAsDpad: true,
    mappingLines: ["A/B/X/Y: A/B/X/Y", "LB/RB: L/R", "VIEW: SELECT   MENU: START", "D-PAD / LEFT STICK: MOVE"],
  }),
  system({
    id: "cdi",
    shortName: "CD-i",
    name: "Philips CD-i",
    core: "same_cdi",
    controlScheme: "arcade",
    folder: "roms/cdi",
    property: "romCdi",
    extensions: ["chd", "cue", "iso", ...COMMON_EXTENSIONS],
    biosRequired: true,
    biosKey: "cdi",
    biosFolder: "bios/cdi",
    biosProperty: "cdiBios",
    biosExtensions: ["zip"],
    biosFileNames: ["cdimono1.zip"],
    biosLabel: "CD-i BIOS archive named cdimono1.zip",
  }),
  system({
    id: "segacd",
    shortName: "SEGA CD",
    name: "Sega CD / Mega-CD",
    core: "genesis_plus_gx",
    controlScheme: "segaCD",
    folder: "roms/segacd",
    property: "romSegaCd",
    extensions: ["chd", "cue", "iso", ...COMMON_EXTENSIONS],
    archiveContentExtensions: ["bin"],
    biosRequired: true,
    biosKey: "segacd",
    biosFolder: "bios/segacd",
    biosProperty: "segaCdBios",
    biosExtensions: ["bin", "rom"],
    biosLabel: "Sega CD BIOS",
    mappingLines: ["A/B/X: A/B/C", "MENU: START", "D-PAD / LEFT STICK: MOVE"],
  }),
  system({
    id: "jaguar",
    shortName: "JAGUAR",
    name: "Atari Jaguar",
    core: "virtualjaguar",
    controlScheme: "jaguar",
    folder: "roms/jaguar",
    property: "romJaguar",
    extensions: ["j64", "jag", "rom", "abs", "cof", "bin", ...COMMON_EXTENSIONS],
    analog: true,
    stickAsDpad: false,
  }),
  system({
    id: "sega32x",
    shortName: "SEGA 32X",
    name: "Sega 32X",
    core: "picodrive",
    controlScheme: "sega32x",
    folder: "roms/sega32x",
    property: "romSega32x",
    extensions: ["32x", "bin", "md", "smd", ...COMMON_EXTENSIONS],
    buttons: sixButtonPad,
    mappingLines: ["A/B/X: A/B/C", "Y/LB/RB: X/Y/Z", "MENU: START", "D-PAD / LEFT STICK: MOVE"],
  }),
  system({
    id: "saturn",
    shortName: "SATURN",
    name: "Sega Saturn",
    core: "yabause",
    controlScheme: "segaSaturn",
    folder: "roms/saturn",
    property: "romSaturn",
    extensions: ["chd", "cue", "ccd", "iso", ...COMMON_EXTENSIONS],
    archiveContentExtensions: ["bin"],
    biosRequired: true,
    biosKey: "saturn",
    biosFolder: "bios/saturn",
    biosProperty: "saturnBios",
    biosExtensions: ["bin", "rom"],
    biosLabel: "Saturn BIOS",
    buttons: sixButtonPad,
    analog: true,
    stickAsDpad: false,
  }),
  system({
    id: "psx",
    shortName: "PS1",
    name: "PlayStation 1",
    core: "pcsx_rearmed",
    controlScheme: "psx",
    folder: "roms/psx",
    property: "romPsx",
    extensions: ["chd", "pbp", "iso", ...COMMON_EXTENSIONS],
    archiveContentExtensions: ["bin", "cue", "img"],
    biosRequired: true,
    biosFolder: "bios/psx",
    biosProperty: "psxBios",
    biosExtensions: ["bin", "rom"],
    biosExpectedSizes: [512 * 1024],
    biosNamePatterns: ["scph", "psx", "ps1", "playstation", "ps-one", "psone", "ps-"],
    biosLabel: "PlayStation BIOS",
    buttons: playStationButtons,
    analog: true,
    stickAsDpad: false,
    mappingLines: ["A: CROSS   B: CIRCLE", "X: SQUARE   Y: TRIANGLE", "LB/RB: L1/R1   LT/RT: L2/R2", "STICKS / D-PAD: MOVE"],
  }),
  system({
    id: "lynx",
    shortName: "LYNX",
    name: "Atari Lynx",
    core: "handy",
    controlScheme: "lynx",
    folder: "roms/lynx",
    property: "romLynx",
    extensions: ["lnx", "lyx", ...COMMON_EXTENSIONS],
    buttons: atariButtons,
    mappingLines: ["A/B: A/B", "MENU: PAUSE", "D-PAD / LEFT STICK: MOVE"],
  }),
  system({
    id: "gamegear",
    shortName: "GAME GEAR",
    name: "Sega Game Gear",
    core: "genesis_plus_gx",
    controlScheme: "segaGG",
    folder: "roms/gamegear",
    property: "romGameGear",
    extensions: ["gg", "bin", ...COMMON_EXTENSIONS],
    mappingLines: ["A: BUTTON 1   B: BUTTON 2", "MENU: START", "D-PAD / LEFT STICK: MOVE"],
  }),
  system({
    id: "virtualboy",
    shortName: "VIRTUAL BOY",
    name: "Virtual Boy",
    core: "beetle_vb",
    controlScheme: "vb",
    folder: "roms/virtualboy",
    property: "romVirtualBoy",
    extensions: ["vb", "vboy", "bin", ...COMMON_EXTENSIONS],
    analog: true,
    stickAsDpad: false,
    mappingLines: ["A/B: A/B", "LB/RB: L/R", "STICKS / D-PAD: DUAL D-PADS"],
  }),
]);

export const UNSUPPORTED_SYSTEMS = Object.freeze([
  Object.freeze({ id: "dreamcast", name: "Sega Dreamcast", reason: "No supported EmulatorJS core." }),
  Object.freeze({ id: "jaguarcd", name: "Atari Jaguar CD", reason: "The Virtual Jaguar web core does not support Jaguar CD." }),
]);

export const SYSTEM_BY_ID = new Map(SYSTEMS.map((system) => [system.id, system]));
export const SYSTEM_BY_PROPERTY = new Map(SYSTEMS.map((system) => [system.property, system]));
export const SYSTEM_BY_BIOS_PROPERTY = new Map(
  SYSTEMS.filter((system) => system.biosProperty).map((system) => [system.biosProperty, system]),
);

export const DIRECT_INPUTS = Object.freeze(Array.from({ length: 24 }, (_, index) => index));

export function fileExtension(value) {
  const filename = String(value || "").replaceAll("\\", "/").split("/").pop() || "";
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

export function localAssetUrl(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function displayGameName(value) {
  const filename = String(value || "").replaceAll("\\", "/").split("/").pop() || "";
  return filename.replace(/\.[^.]+$/, "").replaceAll("_", " ").trim();
}

export function normalizeSystemFile(value, system) {
  if (!value || !system) return "";
  const normalized = String(value).replaceAll("\\", "/");
  const filename = normalized.split("/").pop();
  if (!filename || filename === "." || filename === "..") return "";
  if (!system.extensions.includes(fileExtension(filename))) return "";
  return `${system.folder}/${filename}`;
}

export function normalizeBiosFile(value, system) {
  if (!value || !system?.biosRequired) return "";
  const normalized = String(value).replaceAll("\\", "/");
  const filename = normalized.split("/").pop();
  if (!filename || !system.biosExtensions.includes(fileExtension(filename))) return "";
  if (Array.isArray(system.biosFileNames) && !system.biosFileNames.includes(filename.toLowerCase())) return "";
  return `${system.biosFolder}/${filename}`;
}

export function biosKey(system) {
  return system?.biosKey || system?.id || "";
}

export function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function gameIdentity(system, romPath) {
  const idSource = system.id === "n64" ? romPath : `${system.id}:${romPath}`;
  const gameId = hashString(idSource);
  const baseName = displayGameName(romPath) || "game";
  return {
    gameId,
    gameName: system.id === "n64" ? baseName : `${system.id}-${baseName}`,
    saveNamespace: system.id === "n64" ? "" : `${system.id}-${gameId.toString(16)}`,
  };
}

export function buildKeyboardControls(overrides = []) {
  const keys = [
    "x",
    "s",
    "v",
    "enter",
    "up arrow",
    "down arrow",
    "left arrow",
    "right arrow",
    "z",
    "a",
    "q",
    "e",
    "tab",
    "r",
    "",
    "",
    "h",
    "f",
    "g",
    "t",
    "l",
    "j",
    "k",
    "i",
    "1",
    "2",
    "3",
    "",
    "",
    "",
  ];
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof overrides?.[index] === "string") keys[index] = overrides[index].slice(0, 32);
  }
  const player = {};
  for (let index = 0; index < keys.length; index += 1) {
    player[index] = keys[index] ? { value: keys[index], value2: "" } : {};
  }
  return { 0: player, 1: {}, 2: {}, 3: {} };
}

export function emptyLibrary() {
  return Object.fromEntries(SYSTEMS.map((system) => [system.id, []]));
}

export function mergeLibraryEntries(target, system, entries) {
  if (!target[system.id]) target[system.id] = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const path = normalizeSystemFile(entry, system);
    if (path && !target[system.id].includes(path)) target[system.id].push(path);
  }
  target[system.id].sort((left, right) => displayGameName(left).localeCompare(displayGameName(right)));
  return target;
}
