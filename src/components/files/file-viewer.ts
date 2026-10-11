// Client side of FileExplorer: selection, 2D/3D tabs and the viewers.
// three.js is imported dynamically so it only downloads when a 3D model is opened.

type Segment = { type: "nose" | "tube" | "transition"; x: number; length: number; r0: number; r1: number; shape?: string; param?: number };
type FinSet = { x: number; count: number; root: number; tip: number; span: number; sweep: number; thickness: number; radius: number };
type Rocket = {
  name: string;
  length: number;
  diameter: number;
  noseShape?: string;
  finCount: number;
  motor?: string;
  stages: { name: string; start: number; end: number }[];
  segments: Segment[];
  fins: FinSet[];
};
type FileEntry = {
  id: string;
  name: string;
  ext: string;
  group: string;
  kind: string;
  view: "2d" | "3d" | "both" | "none";
  size?: number;
  images: { src: string; caption: string }[];
  model?: string;
  rocket?: Rocket;
  restricted?: boolean;
  note?: string;
};
type View = "2d" | "3d";

let dispose: (() => void) | undefined;

export function initFileExplorer() {
  const root = document.querySelector<HTMLElement>("[data-file-explorer]");
  const dataEl = document.getElementById("design-files-data");
  if (!root || !dataEl || root.dataset.ready) return;
  root.dataset.ready = "true";

  const files: FileEntry[] = JSON.parse(dataEl.textContent || "{}").files ?? [];
  const byId = new Map(files.map((file) => [file.id, file]));
  const stage = root.querySelector<HTMLElement>("[data-viewer-stage]")!;
  const title = root.querySelector<HTMLElement>("[data-viewer-title]")!;
  const kind = root.querySelector<HTMLElement>("[data-viewer-kind]")!;
  const facts = root.querySelector<HTMLElement>("[data-viewer-facts]")!;
  const note = root.querySelector<HTMLElement>("[data-viewer-note]")!;
  const items = [...root.querySelectorAll<HTMLButtonElement>("[data-file-id]")];
  const tabs = [...root.querySelectorAll<HTMLButtonElement>("[data-view-tab]")];

  let current: FileEntry | undefined;
  let view: View = "3d";

  const available = (file: FileEntry): View[] => {
    if (file.restricted) return [];
    if (file.rocket) return ["2d", "3d"];
    if (file.view === "3d") return file.images.length || file.model ? ["3d"] : [];
    return file.images.length ? ["2d"] : [];
  };

  function select(id: string, focusViewer = false) {
    const file = byId.get(id);
    if (!file) return;
    current = file;
    items.forEach((item) => item.setAttribute("aria-pressed", String(item.dataset.fileId === id)));
    title.textContent = file.name;
    kind.textContent = file.kind;

    const views = available(file);
    if (!views.includes(view)) view = views.includes("3d") ? "3d" : "2d";
    tabs.forEach((tab) => {
      const tabView = tab.dataset.viewTab as View;
      tab.disabled = !views.includes(tabView);
      tab.title = tab.disabled ? `No ${tabView.toUpperCase()} view for this file` : "";
    });

    renderFacts(file);
    note.textContent = file.restricted ? file.note ?? "" : "";
    render();

    const url = new URL(window.location.href);
    url.searchParams.set("file", id);
    history.replaceState(history.state, "", url);
    if (focusViewer && window.matchMedia("(max-width: 63.99rem)").matches) {
      stage.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function render() {
    dispose?.();
    dispose = undefined;
    stage.replaceChildren();
    const file = current;
    if (!file) return;
    const views = available(file);
    tabs.forEach((tab) => tab.setAttribute("aria-selected", String(views.includes(view) && tab.dataset.viewTab === view)));

    if (file.restricted) {
      stage.append(message("This file is confidential and is not shown on the website."));
      return;
    }
    if (!views.length) {
      stage.append(message("No preview is available for this file."));
      return;
    }
    if (file.rocket) {
      if (view === "2d") stage.append(rocketSvg(file.rocket));
      else mount3d(stage, (THREE, scene) => buildRocket(THREE, scene, file.rocket!), "Drag to rotate · scroll to zoom");
      return;
    }
    if (view === "3d" && file.model) {
      mount3d(stage, async (THREE, scene) => {
        const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
        const geometry = await new STLLoader().loadAsync(file.model!);
        geometry.center();
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xd9d6f2, metalness: 0.2, roughness: 0.45 }));
        geometry.computeBoundingSphere();
        mesh.scale.setScalar(1 / (geometry.boundingSphere?.radius || 1));
        scene.add(mesh);
        return 1;
      }, "Drag to rotate · scroll to zoom");
      return;
    }
    stage.append(gallery(file.images, view === "3d" ? "3D view" : "2D view"));
  }

  function renderFacts(file: FileEntry) {
    const rows: [string, string][] = [["Format", file.ext], ["Type", file.group]];
    if (file.size) rows.push(["Size", file.size >= 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${Math.round(file.size / 1024)} KB`]);
    if (file.rocket) {
      const r = file.rocket;
      rows.push(["Length", `${Math.round(r.length * 1000)} mm`], ["Body diameter", `${Math.round(r.diameter * 1000)} mm`]);
      if (r.noseShape) rows.push(["Nose cone", NOSE_NAMES[r.noseShape] ?? r.noseShape]);
      rows.push(["Fins", String(r.finCount)], ["Stages", String(r.stages.length)]);
      if (r.motor) rows.push(["Motor", r.motor]);
    }
    facts.replaceChildren(...rows.map(([label, value]) => {
      const wrap = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      wrap.append(dt, dd);
      return wrap;
    }));
  }

  items.forEach((item) => item.addEventListener("click", () => select(item.dataset.fileId!, true)));
  tabs.forEach((tab) => tab.addEventListener("click", () => {
    if (tab.disabled) return;
    view = tab.dataset.viewTab as View;
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    history.replaceState(history.state, "", url);
    render();
  }));
  document.addEventListener("astro:before-swap", () => dispose?.(), { once: true });

  const params = new URL(window.location.href).searchParams;
  const requested = params.get("file");
  if (params.get("view") === "2d" || params.get("view") === "3d") view = params.get("view") as View;
  const initial = (requested && byId.has(requested) ? requested : items.find((item) => item.getAttribute("aria-pressed") === "true")?.dataset.fileId) ?? files[0]?.id;
  if (initial) select(initial);
}

const NOSE_NAMES: Record<string, string> = {
  haack: "Von Kármán (Haack)",
  ogive: "Tangent ogive",
  conical: "Conical",
  ellipsoid: "Ellipsoid",
  power: "Power series",
  parabolic: "Parabolic",
};

function message(text: string) {
  const p = document.createElement("p");
  p.className = "file-explorer__placeholder";
  p.textContent = text;
  return p;
}

function gallery(images: FileEntry["images"], label: string) {
  const frag = document.createDocumentFragment();
  const main = document.createElement("img");
  const hint = document.createElement("p");
  hint.className = "file-explorer__hint";
  const show = (index: number) => {
    main.src = images[index].src;
    main.alt = images[index].caption;
    hint.textContent = `${label} · ${images[index].caption}`;
    thumbs?.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-current", String(i === index)));
  };
  let thumbs: HTMLDivElement | undefined;
  if (images.length > 1) {
    thumbs = document.createElement("div");
    thumbs.className = "file-explorer__thumbs";
    images.forEach((image, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", image.caption);
      const img = document.createElement("img");
      img.src = image.src;
      img.alt = "";
      img.loading = "lazy";
      button.append(img);
      button.addEventListener("click", () => show(index));
      thumbs!.append(button);
    });
  }
  frag.append(main, hint);
  if (thumbs) frag.append(thumbs);
  show(0);
  return frag;
}

// Radius of a nose cone at distance x from the tip (OpenRocket shape definitions).
function noseRadius(shape: string | undefined, x: number, length: number, radius: number, param = 0) {
  const t = Math.min(Math.max(x / length, 0), 1);
  switch (shape) {
    case "conical":
      return radius * t;
    case "ellipsoid":
      return radius * Math.sqrt(1 - (1 - t) ** 2);
    case "power":
      return radius * t ** (param || 0.5);
    case "parabolic": {
      const k = param || 1;
      return (radius * (2 * t - k * t * t)) / (2 - k);
    }
    case "haack": {
      const theta = Math.acos(1 - 2 * t);
      return (radius / Math.sqrt(Math.PI)) * Math.sqrt(Math.max(theta - Math.sin(2 * theta) / 2 + param * Math.sin(theta) ** 3, 0));
    }
    default: {
      const rho = (radius * radius + length * length) / (2 * radius);
      return Math.sqrt(Math.max(rho * rho - (length - x) ** 2, 0)) + radius - rho;
    }
  }
}

// Outline as [axial, radius] pairs from the nose tip to the aft end.
function profile(rocket: Rocket) {
  const points: [number, number][] = [];
  for (const seg of rocket.segments) {
    const steps = seg.type === "tube" ? 1 : 40;
    for (let i = 0; i <= steps; i += 1) {
      const local = (seg.length * i) / steps;
      const r = seg.type === "nose"
        ? noseRadius(seg.shape, local, seg.length, seg.r1, seg.param)
        : seg.r0 + ((seg.r1 - seg.r0) * local) / (seg.length || 1);
      points.push([seg.x + local, r]);
    }
  }
  return points;
}

function rocketSvg(rocket: Rocket) {
  const mm = (v: number) => v * 1000;
  const pts = profile(rocket);
  const maxR = Math.max(...pts.map(([, r]) => r));
  const maxSpan = Math.max(0, ...rocket.fins.map((f) => f.radius + f.span));
  const halfH = mm(Math.max(maxR, maxSpan));
  const L = mm(rocket.length);
  const pad = L * 0.06;
  const font = Math.max(L * 0.022, 8);
  const width = L + pad * 2;
  const height = halfH * 2 + font * 7;
  const cy = font * 2.5 + halfH;

  const top = pts.map(([x, r]) => `${pad + mm(x)},${cy - mm(r)}`);
  const bottom = [...pts].reverse().map(([x, r]) => `${pad + mm(x)},${cy + mm(r)}`);
  const fins = rocket.fins.flatMap((f) => [1, -1].map((dir) => {
    const x0 = pad + mm(f.x);
    const r = mm(f.radius) * dir;
    const s = mm(f.span) * dir;
    return `<polygon points="${x0},${cy - r} ${x0 + mm(f.sweep)},${cy - r - s} ${x0 + mm(f.sweep + f.tip)},${cy - r - s} ${x0 + mm(f.root)},${cy - r}" />`;
  })).join("");
  const stageLines = rocket.stages.slice(1).map((s) => `<line x1="${pad + mm(s.start)}" x2="${pad + mm(s.start)}" y1="${cy - halfH}" y2="${cy + halfH}" stroke-dasharray="${font / 2}" />`).join("");
  const dimY = cy + halfH + font * 2;
  const d = Math.round(rocket.diameter * 1000);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="2D side profile of ${rocket.name}">
    <g fill="#e9e6f7" stroke="#161616" stroke-width="${font / 8}" stroke-linejoin="round">
      ${fins}
      <polygon points="${top.join(" ")} ${bottom.join(" ")}" />
    </g>
    <g stroke="#b98b6e" stroke-width="${font / 10}" fill="none">${stageLines}
      <line x1="${pad}" x2="${pad + L}" y1="${cy}" y2="${cy}" stroke-dasharray="${font} ${font / 2}" opacity="0.6" />
      <line x1="${pad}" x2="${pad + L}" y1="${dimY}" y2="${dimY}" />
      <line x1="${pad}" x2="${pad}" y1="${dimY - font / 2}" y2="${dimY + font / 2}" />
      <line x1="${pad + L}" x2="${pad + L}" y1="${dimY - font / 2}" y2="${dimY + font / 2}" />
    </g>
    <g fill="#f1efe9" font-family="system-ui, sans-serif" font-size="${font}" text-anchor="middle">
      <text x="${pad + L / 2}" y="${dimY + font * 1.5}">Length ${Math.round(L)} mm · Ø ${d} mm</text>
      <text x="${pad + L / 2}" y="${font * 1.4}">${escapeXml(rocket.name)}</text>
    </g>
  </svg>`;
  const wrap = document.createElement("div");
  wrap.style.width = "100%";
  wrap.style.padding = "1rem";
  wrap.innerHTML = svg;
  return wrap;
}

function escapeXml(text: string) {
  return text.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
}

type Three = typeof import("three");

// Shared three.js scene setup; build() adds the model and returns its rough size.
function mount3d(stage: HTMLElement, build: (THREE: Three, scene: import("three").Scene) => number | Promise<number>, hintText: string) {
  const loading = message("Loading 3D model…");
  stage.append(loading);
  let cancelled = false;
  let cleanup: (() => void) | undefined;
  dispose = () => {
    cancelled = true;
    cleanup?.();
  };

  (async () => {
    const THREE = await import("three");
    const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
    if (cancelled) return;
    const scene = new THREE.Scene();
    const size = await build(THREE, scene);
    if (cancelled) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const camera = new THREE.PerspectiveCamera(35, 1, size / 100, size * 50);
    camera.position.set(size * 0.25, size * 0.45, size * 1.6);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2f2e5a, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(size, size * 2, size * 1.5);
    scene.add(sun);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.autoRotateSpeed = 1.2;
    controls.addEventListener("start", () => { controls.autoRotate = false; });

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = stage;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);

    loading.remove();
    const hint = document.createElement("p");
    hint.className = "file-explorer__hint";
    hint.textContent = hintText;
    stage.append(renderer.domElement, hint);
    resize();

    let frame = 0;
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    tick();

    cleanup = () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((obj) => {
        const mesh = obj as import("three").Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material as import("three").Material | undefined;
        mat?.dispose?.();
      });
      renderer.dispose();
    };
  })().catch(() => {
    loading.textContent = "The 3D view could not be loaded in this browser.";
  });
}

function buildRocket(THREE: Three, scene: import("three").Scene, rocket: Rocket) {
  const body = new THREE.Group();
  const points = profile(rocket).map(([x, r]) => new THREE.Vector2(Math.max(r, 0.0001), x));
  points.push(new THREE.Vector2(0.0001, rocket.length));
  const lathe = new THREE.LatheGeometry(points, 72);
  body.add(new THREE.Mesh(lathe, new THREE.MeshStandardMaterial({ color: 0xe9e6f7, metalness: 0.15, roughness: 0.45, side: THREE.DoubleSide })));

  // Nose highlighted in the accent colour.
  const nose = rocket.segments.find((s) => s.type === "nose");
  if (nose) {
    const nosePts: import("three").Vector2[] = [];
    for (let i = 0; i <= 40; i += 1) {
      const x = (nose.length * i) / 40;
      nosePts.push(new THREE.Vector2(noseRadius(nose.shape, x, nose.length, nose.r1, nose.param) * 1.002 + 0.00005, nose.x + x));
    }
    body.add(new THREE.Mesh(new THREE.LatheGeometry(nosePts, 72), new THREE.MeshStandardMaterial({ color: 0xb98b6e, metalness: 0.25, roughness: 0.4, side: THREE.DoubleSide })));
  }

  const finMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3950, metalness: 0.2, roughness: 0.5 });
  for (const fin of rocket.fins) {
    const shape = new THREE.Shape();
    shape.moveTo(fin.radius * 0.98, fin.x);
    shape.lineTo(fin.radius + fin.span, fin.x + fin.sweep);
    shape.lineTo(fin.radius + fin.span, fin.x + fin.sweep + fin.tip);
    shape.lineTo(fin.radius * 0.98, fin.x + fin.root);
    shape.closePath();
    const depth = Math.max(fin.thickness, rocket.length * 0.002);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geometry.translate(0, 0, -depth / 2);
    for (let i = 0; i < fin.count; i += 1) {
      const mesh = new THREE.Mesh(geometry, finMaterial);
      mesh.rotation.y = (Math.PI * 2 * i) / fin.count;
      body.add(mesh);
    }
  }

  // Lay the rocket horizontally, centred on the origin.
  body.position.y = -rocket.length / 2;
  const holder = new THREE.Group();
  holder.add(body);
  holder.rotation.z = Math.PI / 2;
  scene.add(holder);
  return rocket.length * 0.75;
}
