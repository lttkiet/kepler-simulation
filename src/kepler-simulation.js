import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const TAU = Math.PI * 2;
const MODEL = {
  year: 228.776,
  siderealDay: 23.9344696 / 24,
  binaryPeriod: 41.0792,
  binaryA: 0.22431,
  binaryE: 0.15944,
  binaryOmega: 263.29 * Math.PI / 180,
  planetA: 0.7048,
  planetE: 0.0069,
  planetOmega: 318 * Math.PI / 180,
  planetPeriapsis: 34.3586873,
  moonPeriod: 40.5,
  moonDistanceKm: 499720,
  auKm: 149597870.7,
  starAMass: 0.6897,
  starBMass: 0.20255,
  starARadiusAu: 0.6489 * 0.00465046726096,
  starBRadiusAu: 0.2260 * 0.00465046726096,
  tilt: 23.44 * Math.PI / 180,
  visualScale: 42
};

const ui = {
  canvas: document.querySelector('#system-view'),
  yearRange: document.querySelector('#year-range'),
  dayRange: document.querySelector('#day-range'),
  hourRange: document.querySelector('#hour-range'),
  speed: document.querySelector('#speed-select'),
  play: document.querySelector('#play-toggle'),
  yearReadout: document.querySelector('#year-readout'),
  dayReadout: document.querySelector('#day-readout'),
  timeReadout: document.querySelector('#time-readout'),
  yearValue: document.querySelector('#year-value'),
  dayValue: document.querySelector('#day-value'),
  hourValue: document.querySelector('#hour-value'),
  statePanel: document.querySelector('.light-state'),
  lightState: document.querySelector('#light-state'),
  stateIcon: document.querySelector('#state-icon'),
  stateClock: document.querySelector('#state-clock'),
  altitudeA: document.querySelector('#altitude-a'),
  altitudeB: document.querySelector('#altitude-b'),
  trackA: document.querySelector('#track-a'),
  trackB: document.querySelector('#track-b'),
  skyA: document.querySelector('#sky-orb-a'),
  skyB: document.querySelector('#sky-orb-b'),
  phaseLabel: document.querySelector('#phase-label'),
  moonPercent: document.querySelector('#moon-percent'),
  moonPhaseName: document.querySelector('#moon-phase-name'),
  moonPreview: document.querySelector('#moon-preview'),
  loading: document.querySelector('#loading-state'),
  labels: {
    starA: document.querySelector('#label-large'),
    starB: document.querySelector('#label-small'),
    planet: document.querySelector('#label-planet'),
    moon: document.querySelector('#label-moon')
  }
};

const scene = new THREE.Scene();
scene.background = new THREE.Color('#080b13');
scene.fog = new THREE.FogExp2('#080b13', 0.0009);
const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 1200);
camera.position.set(0, 51, 69);
const renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(ui.canvas.clientWidth, ui.canvas.clientHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 28;
controls.maxDistance = 145;
controls.maxPolarAngle = Math.PI * 0.49;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.19;
controls.update();

scene.add(new THREE.AmbientLight('#6c789b', 0.34));
scene.add(new THREE.HemisphereLight('#a5bbec', '#10131b', 0.26));
const starALight = new THREE.PointLight('#ffd295', 5200, 220, 1.55);
const starBLight = new THREE.PointLight('#f17868', 850, 145, 1.65);
starALight.castShadow = true;
starALight.shadow.mapSize.set(512, 512);
scene.add(starALight, starBLight);
scene.add(starALight.target, starBLight.target);

const starField = makeStarField();
scene.add(starField);
const systemGroup = new THREE.Group();
scene.add(systemGroup);

const barycenter = new THREE.Mesh(
  new THREE.SphereGeometry(0.11, 12, 10),
  new THREE.MeshBasicMaterial({ color: '#a9b4c9', transparent: true, opacity: 0.5 })
);
systemGroup.add(barycenter);

const orbitMaterial = new THREE.LineBasicMaterial({ color: '#8b98b7', transparent: true, opacity: 0.25 });
const binaryOrbitMaterial = new THREE.LineBasicMaterial({ color: '#dcae72', transparent: true, opacity: 0.28 });
const secondaryOrbitMaterial = new THREE.LineBasicMaterial({ color: '#dd907f', transparent: true, opacity: 0.21 });
systemGroup.add(makeOrbit(MODEL.year, MODEL.planetA, MODEL.planetE, MODEL.planetOmega, MODEL.planetPeriapsis, orbitMaterial));
const totalMass = MODEL.starAMass + MODEL.starBMass;
const massA = MODEL.starAMass / totalMass;
const massB = MODEL.starBMass / totalMass;
systemGroup.add(makeOrbit(MODEL.binaryPeriod, MODEL.binaryA * massB, MODEL.binaryE, MODEL.binaryOmega, 0, binaryOrbitMaterial));
systemGroup.add(makeOrbit(MODEL.binaryPeriod, MODEL.binaryA * massA, MODEL.binaryE, MODEL.binaryOmega, 0, secondaryOrbitMaterial));

const starA = makeStar('#ffd18a', 1.35, 3.0);
const starB = makeStar('#ef866c', 0.76, 1.55);
systemGroup.add(starA, starB);

const planet = makePlanet();
systemGroup.add(planet.group);
const moonOrbit = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(Array.from({ length: 121 }, (_, index) => {
    const angle = TAU * index / 120;
    return new THREE.Vector3(Math.cos(angle) * 1.78, 0, Math.sin(angle) * 1.78);
  })),
  new THREE.LineDashedMaterial({ color: '#aab3c8', dashSize: 0.11, gapSize: 0.1, transparent: true, opacity: 0.45 })
);
moonOrbit.computeLineDistances();
planet.group.add(moonOrbit);
const moon = new THREE.Mesh(
  new THREE.SphereGeometry(0.23, 28, 22),
  new THREE.MeshStandardMaterial({ color: '#b7bdc9', roughness: 0.92, metalness: 0.01 })
);
planet.group.add(moon);

const orbitLabel = makeWorldLabel('PLANET ORBIT', 0x919cb4, 0.5);
orbitLabel.position.set(0.5, 0.1, -MODEL.planetA * MODEL.visualScale - 1.4);
systemGroup.add(orbitLabel);
const unitsLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.2, 0.07, 0), new THREE.Vector3(0.2, 0.07, 0)]),
  new THREE.LineBasicMaterial({ color: '#9aa5bb', transparent: true, opacity: 0.45 })
);
systemGroup.add(unitsLine);

let timeDays = 0;
let isPlaying = false;
let lastFrame = 0;
let frameHandle = 0;
let lastReadout = 0;

function positiveAngle(angle) {
  return ((angle % TAU) + TAU) % TAU;
}

function solveKepler(meanAnomaly, eccentricity) {
  let eccentric = meanAnomaly;
  for (let i = 0; i < 16; i += 1) {
    const error = (eccentric - eccentricity * Math.sin(eccentric) - meanAnomaly)
      / (1 - eccentricity * Math.cos(eccentric));
    eccentric -= error;
    if (Math.abs(error) < 1e-12) break;
  }
  return eccentric;
}

function orbitPosition(period, semiMajorAxis, eccentricity, omega, periapsis, time) {
  const mean = positiveAngle(TAU * (time - periapsis) / period);
  const eccentric = solveKepler(mean, eccentricity);
  const trueAnomaly = 2 * Math.atan2(
    Math.sqrt(1 + eccentricity) * Math.sin(eccentric / 2),
    Math.sqrt(1 - eccentricity) * Math.cos(eccentric / 2)
  );
  const radius = semiMajorAxis * (1 - eccentricity * Math.cos(eccentric));
  const theta = trueAnomaly + omega;
  return { x: radius * Math.cos(theta), y: radius * Math.sin(theta) };
}

function makeOrbit(period, semiMajorAxis, eccentricity, omega, periapsis, material) {
  const samples = Array.from({ length: 801 }, (_, index) => {
    const point = orbitPosition(period, semiMajorAxis, eccentricity, omega, periapsis, index * period / 800);
    return new THREE.Vector3(point.x * MODEL.visualScale, 0, -point.y * MODEL.visualScale);
  });
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(samples), material);
}

function makeStar(color, radius, glowSize) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 32, 28),
    new THREE.MeshBasicMaterial({ color, toneMapped: false })
  );
  group.add(mesh);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(color), color, transparent: true, opacity: 0.33,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  }));
  glow.scale.set(glowSize * 2.7, glowSize * 2.7, 1);
  group.add(glow);
  const corona = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.08, 24, 20),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.BackSide, toneMapped: false })
  );
  group.add(corona);
  return group;
}

function makePlanet() {
  const group = new THREE.Group();
  const tiltGroup = new THREE.Group();
  tiltGroup.rotation.x = -MODEL.tilt;
  const spinGroup = new THREE.Group();
  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(0.78, 56, 48),
    new THREE.MeshStandardMaterial({ map: makePlanetTexture(), roughness: 0.9, metalness: 0, color: '#e0e8eb' })
  );
  surface.castShadow = true;
  surface.receiveShadow = true;
  spinGroup.add(surface);
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.83, 48, 40),
    new THREE.MeshBasicMaterial({ color: '#69b9eb', transparent: true, opacity: 0.105, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  spinGroup.add(atmosphere);
  tiltGroup.add(spinGroup);
  group.add(tiltGroup);
  return { group, spinGroup, surface };
}

function makePlanetTexture() {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#173748';
  context.fillRect(0, 0, width, height);
  const ocean = context.createLinearGradient(0, 0, 0, height);
  ocean.addColorStop(0, '#254657');
  ocean.addColorStop(0.5, '#1a4050');
  ocean.addColorStop(1, '#273f4a');
  context.fillStyle = ocean;
  context.fillRect(0, 0, width, height);
  context.globalAlpha = 0.42;
  context.fillStyle = '#7c9877';
  const landmasses = [
    [[105,92],[137,65],[186,72],[215,95],[205,119],[224,139],[202,164],[191,196],[161,215],[151,257],[125,251],[109,222],[91,207],[82,175],[63,155],[78,126]],
    [[180,264],[209,273],[226,304],[217,343],[201,373],[190,421],[170,442],[153,409],[157,370],[143,336],[151,298]],
    [[391,102],[422,83],[460,89],[482,111],[476,131],[451,140],[439,164],[418,151],[403,131]],
    [[438,180],[475,166],[510,181],[527,215],[513,255],[494,289],[482,339],[459,365],[440,333],[431,291],[411,258],[418,218]],
    [[521,117],[564,95],[614,100],[657,83],[699,102],[727,128],[714,157],[683,159],[663,181],[629,170],[605,193],[572,176],[544,155]],
    [[665,207],[696,201],[718,220],[725,246],[708,268],[685,258],[671,238]],
    [[756,301],[795,278],[834,291],[856,319],[844,351],[815,365],[788,347],[762,331]],
    [[308,82],[328,74],[345,84],[337,101],[319,105]],
    [[327,393],[346,385],[361,402],[354,427],[335,432],[322,414]]
  ];
  for (const polygon of landmasses) {
    context.beginPath();
    polygon.forEach(([x, y], index) => index === 0 ? context.moveTo(x, y) : context.lineTo(x, y));
    context.closePath();
    context.fill();
    context.strokeStyle = 'rgba(197,205,161,.18)';
    context.lineWidth = 3;
    context.stroke();
  }
  context.globalAlpha = 1;
  context.fillStyle = 'rgba(197,220,224,.18)';
  context.fillRect(0, 0, width, 28);
  context.fillRect(0, height - 27, width, 27);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

function makeGlowTexture(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 63);
  gradient.addColorStop(0, `${color}66`);
  gradient.addColorStop(0.24, `${color}36`);
  gradient.addColorStop(1, `${color}00`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeStarField() {
  const count = 1600;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const radius = 105 + Math.random() * 250;
    const theta = Math.random() * TAU;
    const vertical = (Math.random() * 2 - 1) * 0.82;
    const planar = Math.sqrt(1 - vertical * vertical);
    positions[i * 3] = radius * planar * Math.cos(theta);
    positions[i * 3 + 1] = radius * vertical;
    positions[i * 3 + 2] = radius * planar * Math.sin(theta);
    sizes[i] = 0.36 + Math.random() * 0.95;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#c6d0e9', size: 0.45, sizeAttenuation: true, transparent: true, opacity: 0.52, depthWrite: false }));
}

function makeWorldLabel(text, color, size) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  context.font = '500 22px monospace';
  context.letterSpacing = '4px';
  context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  context.textAlign = 'center';
  context.fillText(text, 256, 39);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(size * 6.2, size * 0.78, 1);
  return sprite;
}

function setWorldPosition(object, point, vertical = 0) {
  object.position.set(point.x * MODEL.visualScale, vertical, -point.y * MODEL.visualScale);
}

function unit(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z || 0);
  if (!length) return { x: 0, y: 0, z: 0 };
  return { x: vector.x / length, y: vector.y / length, z: (vector.z || 0) / length };
}

function dot(left, right) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function getSystemState(time) {
  const planetPosition = orbitPosition(MODEL.year, MODEL.planetA, MODEL.planetE, MODEL.planetOmega, MODEL.planetPeriapsis, time);
  const binaryPosition = orbitPosition(MODEL.binaryPeriod, MODEL.binaryA, MODEL.binaryE, MODEL.binaryOmega, 0, time);
  const sunA = { x: -massB * binaryPosition.x, y: -massB * binaryPosition.y };
  const sunB = { x: massA * binaryPosition.x, y: massA * binaryPosition.y };
  const planetAngle = Math.atan2(planetPosition.y, planetPosition.x);
  const moonAngle = positiveAngle(planetAngle + TAU * time / MODEL.moonPeriod);
  const moonDistanceAu = MODEL.moonDistanceKm / MODEL.auKm;
  const moonPosition = {
    x: planetPosition.x + moonDistanceAu * Math.cos(moonAngle),
    y: planetPosition.y + moonDistanceAu * Math.sin(moonAngle)
  };
  const epochPlanet = orbitPosition(MODEL.year, MODEL.planetA, MODEL.planetE, MODEL.planetOmega, MODEL.planetPeriapsis, 0);
  const epochBinary = orbitPosition(MODEL.binaryPeriod, MODEL.binaryA, MODEL.binaryE, MODEL.binaryOmega, 0, 0);
  const epochSunA = { x: -massB * epochBinary.x - epochPlanet.x, y: -massB * epochBinary.y - epochPlanet.y, z: 0 };
  const epochDirection = unit(epochSunA);
  const midnightPhase = Math.atan2(Math.cos(MODEL.tilt) * epochDirection.y, epochDirection.x) + Math.PI;
  const spin = midnightPhase + TAU * time / MODEL.siderealDay;
  const observerNormal = {
    x: Math.cos(spin),
    y: Math.sin(spin) * Math.cos(MODEL.tilt),
    z: Math.sin(spin) * Math.sin(MODEL.tilt)
  };
  const directionA = unit({ x: sunA.x - planetPosition.x, y: sunA.y - planetPosition.y, z: 0 });
  const directionB = unit({ x: sunB.x - planetPosition.x, y: sunB.y - planetPosition.y, z: 0 });
  const altitudeA = Math.asin(THREE.MathUtils.clamp(dot(observerNormal, directionA), -1, 1)) * 180 / Math.PI;
  const altitudeB = Math.asin(THREE.MathUtils.clamp(dot(observerNormal, directionB), -1, 1)) * 180 / Math.PI;
  const fromMoonToPlanet = unit({ x: planetPosition.x - moonPosition.x, y: planetPosition.y - moonPosition.y, z: 0 });
  const fromMoonToA = unit({ x: sunA.x - moonPosition.x, y: sunA.y - moonPosition.y, z: 0 });
  const fromMoonToB = unit({ x: sunB.x - moonPosition.x, y: sunB.y - moonPosition.y, z: 0 });
  const phaseA = THREE.MathUtils.clamp((1 + dot(fromMoonToPlanet, fromMoonToA)) / 2, 0, 1);
  const phaseB = THREE.MathUtils.clamp((1 + dot(fromMoonToPlanet, fromMoonToB)) / 2, 0, 1);
  const illumination = (phaseA + phaseB) / 2;
  return { planetPosition, sunA, sunB, moonPosition, moonAngle, spin, altitudeA, altitudeB, illumination, phaseA, phaseB };
}

function formatTime(hours) {
  const totalMinutes = Math.min(1439, Math.floor(hours * 60 + 1e-8));
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

function currentYear() { return Math.floor(timeDays / MODEL.year); }
function withinYear() { return timeDays - currentYear() * MODEL.year; }
function currentHour() {
  const elapsed = withinYear();
  return (elapsed - Math.floor(elapsed)) * 24;
}

function setTime(nextTime) {
  timeDays = Math.max(0, nextTime);
  const year = currentYear();
  const day = withinYear();
  const hour = currentHour();
  if (year > Number(ui.yearRange.max) - 10) ui.yearRange.max = String(Math.min(100000, year + 100));
  ui.yearRange.value = String(Math.min(Number(ui.yearRange.max), year));
  ui.dayRange.value = String(day);
  ui.hourRange.value = String(hour);
  refreshScene(false);
}

function updateSliderProgress(input) {
  const percent = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100;
  input.style.setProperty('--progress', `${THREE.MathUtils.clamp(percent, 0, 100)}%`);
}

function phaseName(fraction) {
  if (fraction < 0.035) return 'NEW MOON';
  if (fraction > 0.965) return 'FULL MOON';
  if (fraction < 0.47) return 'CRESCENT';
  if (fraction < 0.53) return 'QUARTER';
  return 'GIBBOUS';
}

function setAltitudeTrack(element, altitude) {
  element.style.left = `${THREE.MathUtils.mapLinear(altitude, -90, 90, 2, 98)}%`;
}

function setSkyMarker(element, altitude, x) {
  const clamped = THREE.MathUtils.clamp(altitude, -10, 80);
  const y = THREE.MathUtils.mapLinear(clamped, -10, 80, 69, 11);
  element.style.left = `${x}%`;
  element.style.top = `${y}px`;
}

function refreshScene(announce = true) {
  const state = getSystemState(timeDays);
  const date = new Date(Math.round(timeDays * 86400000));
  const year = currentYear();
  const day = withinYear();
  const hour = currentHour();
  const clock = formatTime(hour);
  ui.yearReadout.textContent = `YEAR ${String(year).padStart(4, '0')}`;
  ui.dayReadout.textContent = `DAY ${String(Math.floor(day)).padStart(3, '0')}`;
  ui.timeReadout.textContent = clock;
  ui.stateClock.textContent = clock;
  ui.yearValue.textContent = String(year);
  ui.dayValue.textContent = day.toFixed(2);
  ui.hourValue.textContent = clock;
  [ui.yearRange, ui.dayRange, ui.hourRange].forEach(updateSliderProgress);

  setWorldPosition(starA, state.sunA, 0.52);
  setWorldPosition(starB, state.sunB, 0.38);
  setWorldPosition(planet.group, state.planetPosition, 0);
  const moonVisualRadius = 1.78;
  moon.position.set(Math.cos(state.moonAngle) * moonVisualRadius, 0, -Math.sin(state.moonAngle) * moonVisualRadius);
  planet.spinGroup.rotation.y = state.spin;
  const starAVector = new THREE.Vector3(state.sunA.x * MODEL.visualScale, 0.52, -state.sunA.y * MODEL.visualScale);
  const starBVector = new THREE.Vector3(state.sunB.x * MODEL.visualScale, 0.38, -state.sunB.y * MODEL.visualScale);
  starALight.position.copy(starAVector);
  starBLight.position.copy(starBVector);

  const upA = state.altitudeA > 0;
  const upB = state.altitudeB > 0;
  let lighting;
  let phaseDescription;
  let icon;
  if (upA && upB) {
    lighting = 'BINARY DAYLIGHT';
    phaseDescription = 'Both suns above horizon';
    icon = '☼';
    ui.statePanel.dataset.state = 'day';
  } else if (upA || upB) {
    lighting = upA ? 'LARGE SUNLIGHT' : 'SMALL SUNLIGHT';
    phaseDescription = upA ? 'Large sun above horizon' : 'Small sun above horizon';
    icon = upA ? '◐' : '◑';
    ui.statePanel.dataset.state = 'split';
  } else {
    lighting = 'TRUE NIGHT';
    phaseDescription = 'Both stars below horizon';
    icon = '☾';
    ui.statePanel.dataset.state = 'night';
  }
  ui.lightState.textContent = lighting;
  ui.stateIcon.textContent = icon;
  ui.phaseLabel.textContent = phaseDescription;
  ui.altitudeA.textContent = `${state.altitudeA >= 0 ? '+' : ''}${state.altitudeA.toFixed(1)}°`;
  ui.altitudeB.textContent = `${state.altitudeB >= 0 ? '+' : ''}${state.altitudeB.toFixed(1)}°`;
  setAltitudeTrack(ui.trackA, state.altitudeA);
  setAltitudeTrack(ui.trackB, state.altitudeB);
  setSkyMarker(ui.skyA, state.altitudeA, 39);
  setSkyMarker(ui.skyB, state.altitudeB, 63);

  const moonPercent = Math.round(state.illumination * 100);
  ui.moonPercent.textContent = `${moonPercent}%`;
  ui.moonPhaseName.textContent = phaseName(state.illumination);
  const terminator = Math.abs(2 * state.illumination - 1) * 100;
  ui.moonPreview.style.setProperty('--phase-width', `${Math.max(6, terminator)}%`);
  ui.moonPreview.style.setProperty('--phase-x', state.illumination > 0.5 ? '35%' : '65%');
  ui.moonPreview.dataset.illumination = String(state.illumination);

  if (announce) {
    ui.dayReadout.setAttribute('aria-label', `Day ${Math.floor(day)} of year ${year}`);
  }
  if (date.getUTCFullYear() > 1) document.documentElement.dataset.simulationYear = String(year);
}

function placeLabel(element, object, offsetX = 0, offsetY = -16) {
  const position = object.getWorldPosition(new THREE.Vector3());
  position.y += 1.2;
  position.project(camera);
  const visible = position.z > -1 && position.z < 1 && Math.abs(position.x) < 1.14 && Math.abs(position.y) < 1.12;
  if (!visible) {
    element.style.opacity = '0';
    return;
  }
  const rect = ui.canvas.getBoundingClientRect();
  element.style.left = `${(position.x * 0.5 + 0.5) * rect.width + offsetX}px`;
  element.style.top = `${(-position.y * 0.5 + 0.5) * rect.height + offsetY}px`;
  element.style.opacity = '1';
}

function renderFrame(timestamp) {
  frameHandle = requestAnimationFrame(renderFrame);
  const delta = lastFrame ? Math.min(0.1, (timestamp - lastFrame) / 1000) : 0;
  lastFrame = timestamp;
  if (isPlaying && delta > 0) setTime(timeDays + delta * Number(ui.speed.value) / 24);
  controls.update();
  renderer.render(scene, camera);
  if (timestamp - lastReadout > 120 || delta === 0) {
    placeLabel(ui.labels.starA, starA, -30, -18);
    placeLabel(ui.labels.starB, starB, 24, -13);
    placeLabel(ui.labels.planet, planet.group, 26, -10);
    placeLabel(ui.labels.moon, moon, 16, 0);
    lastReadout = timestamp;
  }
}

function updateRendererSize() {
  const width = Math.max(1, ui.canvas.clientWidth);
  const height = Math.max(1, ui.canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function togglePlaying(force) {
  isPlaying = typeof force === 'boolean' ? force : !isPlaying;
  ui.play.setAttribute('aria-pressed', String(isPlaying));
  ui.play.setAttribute('aria-label', isPlaying ? 'Pause simulation' : 'Play simulation');
  document.querySelector('#play-text').textContent = isPlaying ? 'PAUSE' : 'PLAY';
  lastFrame = 0;
}

ui.yearRange.addEventListener('input', () => {
  const targetYear = Number(ui.yearRange.value);
  setTime(targetYear * MODEL.year + withinYear());
});
ui.dayRange.addEventListener('input', () => {
  setTime(currentYear() * MODEL.year + Number(ui.dayRange.value) + currentHour() / 24);
});
ui.hourRange.addEventListener('input', () => {
  setTime(currentYear() * MODEL.year + Math.floor(withinYear()) + Number(ui.hourRange.value) / 24);
});
ui.play.addEventListener('click', () => togglePlaying());
document.querySelector('#view-home').addEventListener('click', () => {
  controls.reset();
  camera.position.set(0, 51, 69);
  controls.target.set(0, 0, 0);
  controls.update();
});
document.querySelector('#view-motion').addEventListener('click', (event) => {
  controls.autoRotate = !controls.autoRotate;
  event.currentTarget.setAttribute('aria-pressed', String(!controls.autoRotate));
  event.currentTarget.setAttribute('aria-label', controls.autoRotate ? 'Pause camera movement' : 'Resume camera movement');
  event.currentTarget.title = controls.autoRotate ? 'Pause camera movement' : 'Resume camera movement';
});
window.addEventListener('resize', updateRendererSize);
window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && !['INPUT', 'SELECT', 'BUTTON'].includes(document.activeElement.tagName)) {
    event.preventDefault();
    togglePlaying();
  }
});

updateRendererSize();
setTime(0);
ui.loading.classList.add('hidden');
frameHandle = requestAnimationFrame(renderFrame);
