export type Lang = "es" | "en";

export type StepId =
  | "welcome"
  | "keys"
  | "folders"
  | "profile"
  | "actions"
  | "inspector"
  | "library"
  | "integrations"
  | "plugins"
  | "more"
  | "settings"
  | "help"
  | "finish";

export type StepText = { eyebrow?: string; title: string; body: string; tip?: string };

export type TourText = {
  ui: {
    aria: string;
    step: (current: number, total: number) => string;
    next: string;
    back: string;
    skip: string;
    start: string;
    finish: string;
    close: string;
    language: string;
    tip: string;
    helpButton: string;
  };
  steps: Record<StepId, StepText>;
};

const LANG_KEY = "nexora.tourLanguage";

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "es" || saved === "en") return saved;
  } catch { /* localStorage no disponible: se usa el idioma del sistema. */ }
  return (navigator.language || "es").toLowerCase().startsWith("es") ? "es" : "en";
}

export function saveLang(lang: Lang) {
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* sin persistencia */ }
}

export const TOUR_TEXT: Record<Lang, TourText> = {
  es: {
    ui: {
      aria: "Recorrido guiado de NEXORA",
      step: (current, total) => `PASO ${current} DE ${total}`,
      next: "Siguiente",
      back: "Atrás",
      skip: "Omitir recorrido",
      start: "Empezar recorrido",
      finish: "¡Empezar a usar NEXORA!",
      close: "Cerrar recorrido",
      language: "Idioma del recorrido",
      tip: "Consejo",
      helpButton: "Recorrido guiado",
    },
    steps: {
      welcome: {
        eyebrow: "BIENVENIDO A NEXORA",
        title: "Tu DisplayPad, listo para ti",
        body: "Te enseño lo esencial en un par de minutos: dónde están tus teclas, cómo darles acciones e imágenes y cómo conectar OBS y plugins.",
        tip: "Puedes omitirlo cuando quieras y repetirlo desde el botón de la brújula, arriba a la derecha.",
      },
      keys: {
        title: "Tus 12 teclas",
        body: "Cada cuadro es una tecla física del DisplayPad. Haz clic para seleccionarla y editarla. También puedes soltar encima imágenes, GIF, archivos o acciones.",
        tip: "Arrastra una tecla sobre otra para moverla. Si sueltas con Ctrl pulsado, la copias.",
      },
      folders: {
        title: "Páginas y carpetas",
        body: "«Principal» es la página inicial. Con «+ Carpeta» creas páginas extra; si asignas una acción de carpeta a una tecla, el DisplayPad salta a ella. Así tienes muchas más de 12 teclas.",
      },
      profile: {
        title: "Perfiles",
        body: "Cambia de perfil desde aquí. Cada perfil guarda sus propias teclas, por ejemplo uno para streaming y otro para trabajar.",
        tip: "En Más → Perfiles puedes duplicarlos, reordenarlos arrastrando o eliminarlos.",
      },
      actions: {
        title: "Biblioteca de acciones",
        body: "Todo lo que una tecla puede hacer: OBS, sistema, multimedia, perfiles, carpetas y plugins. Haz clic en una acción para asignarla a la tecla seleccionada, o arrástrala a la tecla que quieras.",
        tip: "«Básico» muestra lo esencial y «Todo» el catálogo completo. Tienes buscador arriba.",
      },
      inspector: {
        title: "Configura la tecla",
        body: "Ponle nombre, revisa su acción y ajústala. Con «Probar» la ejecutas al momento, y en «Apariencia» eliges imagen o GIF, texto y color.",
        tip: "Todo se guarda automáticamente: no hay botón de guardar.",
      },
      library: {
        title: "Biblioteca de recursos",
        body: "Importa imágenes PNG, JPG, WEBP o GIF una sola vez y reutilízalas en cualquier tecla o carpeta. También puedes traer los recursos de Base Camp.",
      },
      integrations: {
        title: "Integraciones",
        body: "Conecta OBS Studio y VOXORA. Una vez conectados, sus escenas y acciones aparecen en la biblioteca de acciones para asignarlas a tus teclas.",
      },
      plugins: {
        title: "Plugins",
        body: "Instala plugins del catálogo verificado o importa un paquete ZIP o .streamDeckPlugin. Importar nunca autoriza su ejecución: tú decides con «Autorizar ejecución». Después arrastra sus acciones a una tecla.",
      },
      more: {
        title: "Más herramientas",
        body: "Este menú esconde Perfiles, Pantalla inicial (lo que muestra el DisplayPad al arrancar) y Automatizaciones (macros avanzadas).",
      },
      settings: {
        title: "Configuración del dispositivo",
        body: "Cambia entre modo hardware y simulación, y vuelve a detectar el DisplayPad si no aparece conectado.",
        tip: "Si no lo detecta, prueba a cerrar Mountain Base Camp y detecta de nuevo.",
      },
      help: {
        title: "Repite el recorrido cuando quieras",
        body: "Este botón vuelve a lanzar el recorrido guiado. El icono «?» de al lado abre «Acerca de».",
      },
      finish: {
        eyebrow: "¡TODO LISTO!",
        title: "NEXORA sigue activa en segundo plano",
        body: "Al cerrar la ventana, NEXORA se queda en la bandeja del sistema para que tu DisplayPad siga funcionando.",
        tip: "Para cerrarla del todo, usa «Salir completamente» en el menú de la bandeja.",
      },
    },
  },
  en: {
    ui: {
      aria: "NEXORA guided tour",
      step: (current, total) => `STEP ${current} OF ${total}`,
      next: "Next",
      back: "Back",
      skip: "Skip tour",
      start: "Start tour",
      finish: "Start using NEXORA!",
      close: "Close tour",
      language: "Tour language",
      tip: "Tip",
      helpButton: "Guided tour",
    },
    steps: {
      welcome: {
        eyebrow: "WELCOME TO NEXORA",
        title: "Your DisplayPad, ready to go",
        body: "A quick two-minute look at the essentials: where your keys are, how to give them actions and images, and how to connect OBS and plugins.",
        tip: "You can skip it any time and replay it from the compass button at the top right.",
      },
      keys: {
        title: "Your 12 keys",
        body: "Each square is a physical key on the DisplayPad. Click one to select and edit it. You can also drop images, GIFs, files or actions right onto it.",
        tip: "Drag a key onto another to move it. Hold Ctrl while dropping to copy it instead.",
      },
      folders: {
        title: "Pages and folders",
        body: "“Principal” is the home page. “+ Carpeta” adds extra pages, and if you give a key a folder action, the DisplayPad jumps to it. That gives you far more than 12 keys.",
      },
      profile: {
        title: "Profiles",
        body: "Switch profiles from here. Each profile keeps its own keys, for example one for streaming and another for work.",
        tip: "Under Más → Perfiles you can duplicate, drag to reorder, or delete them.",
      },
      actions: {
        title: "Action library",
        body: "Everything a key can do: OBS, system, media, profiles, folders and plugins. Click an action to assign it to the selected key, or drag it onto any key.",
        tip: "“Básico” shows the essentials and “Todo” the full catalog. There's a search box at the top.",
      },
      inspector: {
        title: "Configure the key",
        body: "Name it, check its action and tweak it. “Probar” runs it right away, and under “Apariencia” you pick an image or GIF, text and color.",
        tip: "Everything saves automatically: there's no save button.",
      },
      library: {
        title: "Asset library",
        body: "Import PNG, JPG, WEBP or GIF images once and reuse them on any key or folder. You can also bring in your Base Camp assets.",
      },
      integrations: {
        title: "Integrations",
        body: "Connect OBS Studio and VOXORA. Once connected, their scenes and actions show up in the action library, ready to assign to your keys.",
      },
      plugins: {
        title: "Plugins",
        body: "Install plugins from the verified catalog or import a ZIP or .streamDeckPlugin package. Importing never authorizes execution: you decide with “Autorizar ejecución”. Then drag its actions onto a key.",
      },
      more: {
        title: "More tools",
        body: "This menu holds Perfiles (profiles), Pantalla inicial (what the DisplayPad shows at startup) and Automatizaciones (advanced macros).",
      },
      settings: {
        title: "Device settings",
        body: "Switch between hardware and simulation mode, and re-detect the DisplayPad if it doesn't show up as connected.",
        tip: "If it isn't detected, try closing Mountain Base Camp and detect again.",
      },
      help: {
        title: "Replay the tour any time",
        body: "This button relaunches the guided tour. The “?” icon next to it opens “Acerca de” (About).",
      },
      finish: {
        eyebrow: "ALL SET!",
        title: "NEXORA keeps running in the background",
        body: "When you close the window, NEXORA stays in the system tray so your DisplayPad keeps working.",
        tip: "To quit it completely, choose “Salir completamente” (Quit completely) in the tray menu.",
      },
    },
  },
};
