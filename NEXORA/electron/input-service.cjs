'use strict';

const { spawn } = require('node:child_process');

const MODIFIER_CODES = Object.freeze({ control: 0x11, shift: 0x10, alt: 0x12, meta: 0x5B });
const INLINE_MODIFIERS = Object.freeze({ CTRL: 'control', CONTROL: 'control', SHIFT: 'shift', ALT: 'alt', WIN: 'meta', WINDOWS: 'meta', META: 'meta' });
const SPECIAL_CODES = Object.freeze({
  ENTER: 0x0D, RETURN: 0x0D, ESC: 0x1B, ESCAPE: 0x1B, SPACE: 0x20, TAB: 0x09,
  BACKSPACE: 0x08, DELETE: 0x2E, INSERT: 0x2D, UP: 0x26, DOWN: 0x28, LEFT: 0x25,
  RIGHT: 0x27, HOME: 0x24, END: 0x23, PAGEUP: 0x21, PAGEDOWN: 0x22,
  PRINTSCREEN: 0x2C, PAUSE: 0x13, CAPSLOCK: 0x14, NUMLOCK: 0x90, SCROLLLOCK: 0x91,
  NUMPAD0: 0x60, NUMPAD1: 0x61, NUMPAD2: 0x62, NUMPAD3: 0x63, NUMPAD4: 0x64,
  NUMPAD5: 0x65, NUMPAD6: 0x66, NUMPAD7: 0x67, NUMPAD8: 0x68, NUMPAD9: 0x69,
  MULTIPLY: 0x6A, ADD: 0x6B, SUBTRACT: 0x6D, DECIMAL: 0x6E, DIVIDE: 0x6F,
});

function keyCode(rawKey) {
  const normalized = String(rawKey || '').trim().toUpperCase();
  if (SPECIAL_CODES[normalized]) return SPECIAL_CODES[normalized];
  if (/^[A-Z0-9]$/.test(normalized)) return normalized.charCodeAt(0);
  const functionMatch = /^F([1-9]|1\d|2[0-4])$/.exec(normalized);
  return functionMatch ? 0x6F + Number(functionMatch[1]) : 0;
}

function resolveHotkey(action = {}) {
  const parts = String(action.value || '').trim().toUpperCase().split('+').map((part) => part.trim()).filter(Boolean);
  const rawKey = parts.pop() || '';
  const resolvedKey = keyCode(rawKey);
  if (!resolvedKey) throw new Error('Selecciona una tecla válida antes de probar el atajo.');
  const inlineModifiers = parts.map((value) => INLINE_MODIFIERS[value]).filter(Boolean);
  if (inlineModifiers.length !== parts.length) throw new Error('La combinación contiene un modificador desconocido.');
  const configured = Array.isArray(action.settings?.modifiers) ? action.settings.modifiers : Array.isArray(action.modifiers) ? action.modifiers : [];
  const modifiers = [...new Set([...configured, ...inlineModifiers].map((value) => String(value).toLowerCase()))];
  const unknown = modifiers.find((value) => !MODIFIER_CODES[value]);
  if (unknown) throw new Error(`Modificador no compatible: ${unknown}.`);
  return {
    key: rawKey,
    modifiers,
    codes: [...modifiers.map((value) => MODIFIER_CODES[value]), resolvedKey],
    label: [...modifiers.map((value) => ({ control: 'Ctrl', shift: 'Shift', alt: 'Alt', meta: 'Windows' }[value])), rawKey].join(' + '),
  };
}

function powershellSendInput(codes) {
  const values = codes.map((value) => Number(value)).join(',');
  return `$source=@'\nusing System;\nusing System.Runtime.InteropServices;\npublic static class NXInput {\n [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public InputUnion U; }\n [StructLayout(LayoutKind.Explicit)] public struct InputUnion { [FieldOffset(0)] public KEYBDINPUT ki; }\n [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public UIntPtr dwExtraInfo; }\n [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);\n public static bool Send(ushort[] keys) {\n  INPUT[] data = new INPUT[keys.Length * 2];\n  for (int i=0;i<keys.Length;i++) { data[i].type=1; data[i].U.ki.wVk=keys[i]; }\n  for (int i=0;i<keys.Length;i++) { int n=keys.Length+i; data[n].type=1; data[n].U.ki.wVk=keys[keys.Length-1-i]; data[n].U.ki.dwFlags=2; }\n  return SendInput((uint)data.Length,data,Marshal.SizeOf(typeof(INPUT))) == data.Length;\n }\n}\n'@; Add-Type -TypeDefinition $source; if(-not [NXInput]::Send([ushort[]]@(${values}))){ exit 2 }`;
}

function sendWindowsCodes(codes, label, options = {}) {
  if ((options.platform || process.platform) !== 'win32') return Promise.reject(new Error('Los atajos configurables requieren Windows.'));
  const spawnImpl = options.spawnImpl || spawn;
  const script = powershellSendInput(codes)
    .replace('[ushort[]]', '[uint16[]]')
    .replace('[StructLayout(LayoutKind.Explicit)] public struct InputUnion', '[StructLayout(LayoutKind.Explicit, Size=32)] public struct InputUnion');
  const child = spawnImpl('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], { windowsHide: true, stdio: 'ignore' });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => code === 0
      ? resolve(`Windows aceptó ${label} mediante SendInput.`)
      : reject(new Error(code === 2 ? 'Windows rechazó la entrada SendInput. Prueba ejecutar NEXORA con el mismo nivel de permisos que la aplicación de destino.' : `Windows no pudo enviar el atajo (código ${code}).`)));
  });
}

function sendWindowsHotkey(action, options = {}) {
  const resolved = resolveHotkey(action);
  return sendWindowsCodes(resolved.codes, resolved.label, options);
}

module.exports = { SPECIAL_CODES, keyCode, resolveHotkey, sendWindowsCodes, sendWindowsHotkey };
