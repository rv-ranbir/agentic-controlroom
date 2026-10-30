import * as THREE from 'three';

export type CampusRoomKind = 'meeting' | 'planning' | 'debate' | 'workflows' | 'results';

export const CAMPUS_ROOMS: Array<{ id: string; label: string; x: number; z: number; kind: CampusRoomKind }> = [
  { id: 'research-center', label: 'Research library', x: -9, z: -5, kind: 'meeting' },
  { id: 'strategy', label: 'Strategy room', x: 0, z: -5, kind: 'planning' },
  { id: 'lab', label: 'Experiment lab', x: 9, z: -5, kind: 'workflows' },
  { id: 'review', label: 'Review room', x: -9, z: 5, kind: 'debate' },
  { id: 'gallery', label: 'Results gallery', x: 9, z: 5, kind: 'results' },
];

const mat = (color: number, roughness = 0.82, metalness = 0): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

const M = {
  ground: mat(0x655e50),
  stone: mat(0xa49479),
  stoneJoint: mat(0x726a59),
  garden: mat(0x64735a),
  ivory: mat(0xf1eadb),
  wall: mat(0xe7ddca),
  wallSide: mat(0xd7cbb4),
  oak: mat(0x9c7049),
  oakLight: mat(0xb88c60),
  oakDark: mat(0x65462f),
  sage: mat(0x87977b),
  sageDark: mat(0x63745f),
  black: mat(0x202322, 0.52),
  screen: mat(0x343a37, 0.38),
  brass: mat(0xb29460, 0.38, 0.55),
  leaf: mat(0x58765b),
  leafLight: mat(0x7d956c),
  soil: mat(0x554535),
  frame: mat(0x292b29),
  paper: mat(0xe8e2d5),
  book1: mat(0x8c5542),
  book2: mat(0x6e7c69),
  book3: mat(0xc09a62),
  book4: mat(0x4f5c60),
  skin: [mat(0xd6a17e), mat(0xb97858), mat(0xe1b997), mat(0x96654d)],
  hair: [mat(0x47382d), mat(0x282723), mat(0x9a7149), mat(0x665041)],
  cloth: [mat(0x75816a), mat(0xb77758), mat(0x53676d), mat(0xd0b98e), mat(0x706358)],
  shoe: mat(0x453b34),
};

const box = new THREE.BoxGeometry(1, 1, 1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
const sphere = new THREE.SphereGeometry(1, 14, 10);
const cone = new THREE.ConeGeometry(1, 1, 10);
const detailGeo = new THREE.SphereGeometry(1, 8, 6);

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const item = new THREE.Mesh(geometry, material);
  item.name = name;
  item.castShadow = true;
  item.receiveShadow = true;
  return item;
}

function block(parent: THREE.Object3D, material: THREE.Material, name: string, x: number, y: number, z: number,
  sx: number, sy: number, sz: number): THREE.Mesh {
  const item = mesh(box, material, name);
  item.position.set(x, y, z);
  item.scale.set(sx, sy, sz);
  parent.add(item);
  return item;
}

function round(parent: THREE.Object3D, material: THREE.Material, name: string, x: number, y: number, z: number,
  sx: number, sy: number, sz: number, geometry = sphere): THREE.Mesh {
  const item = mesh(geometry, material, name);
  item.position.set(x, y, z);
  item.scale.set(sx, sy, sz);
  parent.add(item);
  return item;
}

function furnitureGroup(parent: THREE.Object3D, name: string, x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(x, 0, z);
  parent.add(group);
  return group;
}

function addPlant(parent: THREE.Object3D, x: number, z: number, scale = 1): void {
  const pot = mesh(cylinder, M.oakDark, 'terracotta planter');
  pot.position.set(x, 0.28 * scale, z);
  pot.scale.set(0.38 * scale, 0.56 * scale, 0.38 * scale);
  parent.add(pot);
  const soil = mesh(cylinder, M.soil, 'planter soil');
  soil.position.set(x, 0.56 * scale, z);
  soil.scale.set(0.32 * scale, 0.05 * scale, 0.32 * scale);
  parent.add(soil);
  for (let i = 0; i < 5; i++) {
    const angle = i * Math.PI * 0.4;
    const leaf = mesh(cone, i % 2 ? M.leaf : M.leafLight, 'plant foliage');
    leaf.position.set(x + Math.cos(angle) * 0.18 * scale, 0.93 * scale + (i % 2) * 0.08 * scale, z + Math.sin(angle) * 0.18 * scale);
    leaf.scale.set(0.18 * scale, 0.8 * scale, 0.18 * scale);
    leaf.rotation.z = Math.cos(angle) * 0.25;
    leaf.rotation.x = Math.sin(angle) * 0.25;
    parent.add(leaf);
  }
}

function addChair(parent: THREE.Object3D, x: number, z: number, rotation = 0): THREE.Group {
  const chair = furnitureGroup(parent, 'sage chair', x, z);
  chair.rotation.y = rotation;
  block(chair, M.sage, 'chair seat', 0, 0.56, 0, 0.72, 0.16, 0.68);
  block(chair, M.sageDark, 'chair back', 0, 0.99, -0.27, 0.72, 0.72, 0.14);
  for (const dx of [-0.26, 0.26]) for (const dz of [-0.22, 0.22]) {
    block(chair, M.oakDark, 'chair leg', dx, 0.28, dz, 0.07, 0.56, 0.07);
  }
  return chair;
}

function addTable(parent: THREE.Object3D, x: number, z: number, width: number, depth: number, name = 'oak worktable'): void {
  const table = furnitureGroup(parent, name, x, z);
  block(table, M.oakLight, 'solid oak tabletop', 0, 1.16, 0, width, 0.16, depth);
  block(table, M.oakDark, 'table apron', 0, 1.02, 0, width * 0.8, 0.16, depth * 0.78);
  for (const dx of [-width * 0.41, width * 0.41]) for (const dz of [-depth * 0.36, depth * 0.36]) {
    block(table, M.oakDark, 'tapered table leg', dx, 0.52, dz, 0.13, 1.04, 0.13);
  }
}

function addMonitor(parent: THREE.Object3D, x: number, z: number, rotation = 0): void {
  const monitor = furnitureGroup(parent, 'quiet desktop monitor', x, z);
  monitor.rotation.y = rotation;
  block(monitor, M.black, 'monitor casing', 0, 1.72, 0, 1.15, 0.72, 0.11);
  block(monitor, M.screen, 'blank dark monitor screen', 0, 1.73, 0.064, 1.02, 0.58, 0.018);
  block(monitor, M.black, 'monitor stem', 0, 1.31, -0.01, 0.09, 0.2, 0.09);
  block(monitor, M.black, 'monitor foot', 0, 1.2, 0.02, 0.42, 0.045, 0.25);
}

function addBookshelf(parent: THREE.Object3D, x: number, z: number, rotation = 0): void {
  const shelf = furnitureGroup(parent, 'filled oak bookshelf', x, z);
  shelf.rotation.y = rotation;
  block(shelf, M.oakDark, 'bookshelf back', 0, 1.18, -0.12, 2.55, 2.36, 0.18);
  for (const y of [0.08, 0.8, 1.52, 2.28]) block(shelf, M.oakLight, 'bookshelf shelf', 0, y, 0, 2.65, 0.12, 0.48);
  const bookMats = [M.book1, M.book2, M.book3, M.book4, M.ivory];
  for (let row = 0; row < 3; row++) {
    let xPos = -0.95;
    for (let i = 0; i < 7; i++) {
      const w = 0.12 + ((i + row) % 3) * 0.025;
      const h = 0.38 + ((i * 7 + row * 3) % 5) * 0.065;
      block(shelf, bookMats[(i + row) % bookMats.length], 'shelf book', xPos + w / 2, 0.27 + row * 0.72 + h / 2, 0.055, w, h, 0.32);
      xPos += w + 0.045;
    }
  }
}

function addRoomShell(room: typeof CAMPUS_ROOMS[number], root: THREE.Group): THREE.Group {
  const group = furnitureGroup(root, `room-${room.id}`, room.x, room.z);
  const width = 8, depth = 7;
  const perimeter = furnitureGroup(group, 'cream perimeter and oak floor', 0, 0);
  block(perimeter, M.ivory, 'raised cream perimeter base', 0, 0.1, 0, width + 0.36, 0.2, depth + 0.36);
  block(perimeter, M.oak, 'oak floor underlay', 0, 0.205, 0, width, 0.055, depth);
  for (let i = 0; i < 16; i++) {
    const x = -3.75 + i * 0.5;
    block(perimeter, i % 3 === 0 ? M.oakLight : M.oak, 'individual oak floor slat', x, 0.24, 0, 0.365, 0.035, 6.88);
  }
  // Rear wall and short side returns leave the entry facing the central corridor open.
  block(group, M.wall, 'rear cutaway wall', 0, 1.43, -3.43, 8, 2.4, 0.18);
  block(group, M.wallSide, 'left low cutaway wall', -3.91, 0.63, 0.1, 0.18, 1.0, 6.3);
  block(group, M.wallSide, 'right low cutaway wall', 3.91, 0.63, 0.1, 0.18, 1.0, 6.3);
  block(group, M.oakDark, 'rear oak skirting', 0, 0.34, -3.31, 7.85, 0.2, 0.09);
  block(group, M.oakDark, 'left oak skirting', -3.79, 0.3, 0, 0.1, 0.16, 6.0);
  block(group, M.oakDark, 'right oak skirting', 3.79, 0.3, 0, 0.1, 0.16, 6.0);
  return group;
}

function dressRoom(room: typeof CAMPUS_ROOMS[number], group: THREE.Group): void {
  const furniture = furnitureGroup(group, `furniture-${room.id}`, 0, 0);
  if (room.id === 'research-center') {
    addBookshelf(furniture, -2.55, -2.9);
    addBookshelf(furniture, 2.55, -2.9);
    addTable(furniture, 0, -0.4, 2.6, 1.4, 'research oak table');
    addChair(furniture, -1.9, -0.25, Math.PI / 2);
    addChair(furniture, 1.9, -0.25, -Math.PI / 2);
    addChair(furniture, 0, 1.1, Math.PI);
    addPlant(furniture, -3.25, 2.45, 0.9);
  } else if (room.id === 'strategy') {
    addTable(furniture, 0, -0.05, 3.5, 1.6, 'strategy planning table');
    for (const x of [-2.8, 2.8]) for (const z of [-0.3, 0.7]) addChair(furniture, x, z, x < 0 ? Math.PI / 2 : -Math.PI / 2);
    addBookshelf(furniture, 0, -2.95);
    addPlant(furniture, -3.25, 2.45, 0.88);
  } else if (room.id === 'lab') {
    for (const z of [-1.7, 1.15]) {
      addTable(furniture, -1.8, z, 2.7, 0.88, 'lab workstation');
      addMonitor(furniture, -1.8, z - 0.12);
      addChair(furniture, -1.8, z + 0.88, Math.PI);
      addTable(furniture, 1.65, z, 2.2, 0.88, 'lab workstation');
      addMonitor(furniture, 1.65, z - 0.12);
      addChair(furniture, 1.65, z + 0.88, Math.PI);
    }
    addBookshelf(furniture, 0, -2.95);
    addPlant(furniture, 3.25, 2.45, 0.85);
  } else if (room.id === 'review') {
    addTable(furniture, 0, -0.25, 3.4, 1.35, 'review table');
    addMonitor(furniture, 0, -0.55);
    for (const x of [-2.8, 2.8]) addTable(furniture, x, -1.35, 1.4, 0.8, 'review desk');
    for (const x of [-2.6, -0.9, 0.9, 2.6]) addChair(furniture, x, 1.0, Math.PI);
    addBookshelf(furniture, -2.6, -2.95);
    addPlant(furniture, 3.25, 2.45, 0.9);
  } else {
    // Blank charcoal gallery frames contain no invented content or graphs.
    for (const [x, z, angle] of [[-2.6, -2.9, 0], [0, -2.9, 0], [2.6, -2.9, 0], [-3.35, -0.2, Math.PI / 2], [3.35, -0.2, Math.PI / 2]] as const) {
      const frame = furnitureGroup(furniture, 'blank gallery artwork frame', x, z);
      frame.rotation.y = angle;
      block(frame, M.frame, 'charcoal gallery frame', 0, 1.55, 0, 1.45, 1.45, 0.12);
      block(frame, M.black, 'empty charcoal artwork field', 0, 1.55, 0.07, 1.2, 1.2, 0.02);
    }
    addTable(furniture, 0, 0.35, 2.2, 0.85, 'gallery reading table');
    addChair(furniture, 0, 1.65, Math.PI);
    addPlant(furniture, -3.15, 2.45, 0.95);
    addPlant(furniture, 3.15, 2.45, 0.95);
  }
}

function addCorridor(root: THREE.Group): void {
  const corridor = furnitureGroup(root, 'central corridor', 0, 0);
  block(corridor, M.stone, 'continuous sandstone corridor runner', 0, 0.055, 0, 27.6, 0.1, 2.4);
  block(corridor, M.oakLight, 'corridor inlay north', 0, 0.11, -1.1, 27.3, 0.035, 0.06);
  block(corridor, M.oakLight, 'corridor inlay south', 0, 0.11, 1.1, 27.3, 0.035, 0.06);
  for(let x=-12.6;x<=12.6;x+=1.4)block(corridor,M.stoneJoint,'corridor paving joint',x,.112,0,.022,.008,2.1);
  // Sparse recessed floor markers keep the long route legible without blocking room entries.
  for (const x of [-13.5, -7.5, -1.5, 4.5, 10.5, 13.5]) {
    const marker = mesh(cylinder, M.brass, 'small brass corridor floor marker');
    marker.position.set(x, 0.12, 0);
    marker.scale.set(0.08, 0.025, 0.08);
    corridor.add(marker);
  }
}

function addCourtyard(root:THREE.Group):void {
  const lounge=furnitureGroup(root,'central garden lounge',0,5.4);
  block(lounge,M.sageDark,'courtyard inset',0,.10,0,5.8,.18,5.1);
  // Leave both side passages and the main corridor clear.
  block(lounge,M.oakLight,'lounge deck',0,.22,.4,4.8,.12,3.6);
  block(lounge,M.oakDark,'left bench base',-1.8,.42,.4,.65,.55,2.8);
  block(lounge,M.sage,'left bench cushion',-1.8,.75,.4,.75,.18,2.8);
  block(lounge,M.sageDark,'left bench back',-2.15,1,.4,.15,.7,2.8);
  block(lounge,M.oakDark,'right bench base',1.8,.42,.4,.65,.55,2.8);
  block(lounge,M.sage,'right bench cushion',1.8,.75,.4,.75,.18,2.8);
  block(lounge,M.sageDark,'right bench back',2.15,1,.4,.15,.7,2.8);
  addTable(lounge,0,.6,1.5,.9,'courtyard coffee table');
  addPlant(lounge,-1.8,-1.8,.85);addPlant(lounge,1.8,-1.8,.85);
  addPlant(lounge,-1.8,2,.85);addPlant(lounge,1.8,2,.85);
}

function addExterior(root: THREE.Group): void {
  const outside = furnitureGroup(root, 'campus exterior and planting', 0, 0);
  // A quiet garden bed beyond the building footprint, kept outside the room and corridor bounds.
  for (const [x, z] of [[-13.8, -10.15], [-7.2, -10.15], [0, -10.15], [7.2, -10.15], [13.8, -10.15], [-13.8, 10.15], [-6.8, 10.15], [4, 10.15], [12.8, 10.15]] as const) {
    block(outside, M.sage, 'low exterior planting bed', x, 0.13, z, 1.65, 0.26, 0.74);
    for (let i = 0; i < 4; i++) {
      const tuft = mesh(cone, i % 2 ? M.leaf : M.leafLight, 'exterior ornamental grass');
      tuft.position.set(x - 0.48 + i * 0.32, 0.53, z + (i % 2 ? 0.08 : -0.08));
      tuft.scale.set(0.19, 0.56 + (i % 2) * 0.12, 0.19);
      outside.add(tuft);
    }
  }
  for (const [x, z] of [[-14.15, -2.15], [14.15, -2.15], [-14.15, 2.15], [14.15, 2.15]] as const) {
    addPlant(outside, x, z, 0.74);
  }
}

export function createCampusWorld(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'warm oak and ivory campus cutaway';

  const ground = mesh(box, M.ground, 'matte warm campus ground');
  ground.position.set(0, -0.16, 0);
  ground.scale.set(31, 0.3, 22.8);
  ground.receiveShadow = true;
  root.add(ground);

  const foundation = mesh(box, M.stone, 'continuous sandstone paving');
  foundation.position.set(0, 0.015, 0);
  foundation.scale.set(27.7, 0.13, 17.5);
  root.add(foundation);

  // Flush paving joints add scale without creating walking obstacles.
  for(let x=-13;x<=13;x+=1.3)block(root,M.stoneJoint,'paving vertical joint',x,.084,0,.018,.006,17.4);
  for(let z=-8;z<=8;z+=1.3)block(root,M.stoneJoint,'paving horizontal joint',0,.084,z,27.6,.006,.018);
  for(const z of [-9.7,9.7]){
    block(root,M.garden,'recessed perimeter garden',0,.01,z,29,.04,1.55);
    block(root,M.oakDark,'garden stone edging',0,.055,z+(z<0?.8:-.8),29,.08,.10);
  }
  for(const x of [-14.6,14.6])block(root,M.garden,'side garden strip',x,.01,0,.8,.04,18);
  addCorridor(root);
  for (const room of CAMPUS_ROOMS) {
    const shell = addRoomShell(room, root);
    shell.userData.room=room.kind;
    dressRoom(room, shell);
  }
  addCourtyard(root);
  addExterior(root);
  return ownResources(root);
}

export function createCampusPerson(index: number): THREE.Group {
  const person = new THREE.Group();
  person.name = `campus-person-${index}`;
  const skin = M.skin[Math.abs(index) % M.skin.length];
  const hair = M.hair[Math.abs(index * 3 + 1) % M.hair.length];
  const cloth = M.cloth[Math.abs(index + 2) % M.cloth.length];

  // Feet sit at y=0; articulated named limbs can be animated by the renderer.
  for (const [side, x] of [['left', -0.14], ['right', 0.14]] as const) {
    const leg = new THREE.Group();
    leg.name = `leg-${side}`;
    leg.position.set(x, 0.78, 0);
    block(leg, M.oakDark, 'trouser leg', 0, -0.28, 0, 0.17, 0.58, 0.2);
    block(leg, M.shoe, 'rounded leather shoe', 0, -0.66, 0.07, 0.22, 0.14, 0.34);
    person.add(leg);
  }

  const torso = round(person, cloth, 'softly tailored torso', 0, 1.15, 0, 0.31, 0.43, 0.2);
  torso.geometry = new THREE.CapsuleGeometry(0.22, 0.35, 4, 10);
  torso.scale.set(0.78, 1, 0.74);
  round(person, cloth, 'shoulder shape', 0, 1.42, 0, 0.31, 0.2, 0.2);

  for (const [side, x] of [['left', -0.39], ['right', 0.39]] as const) {
    const arm = new THREE.Group();
    arm.name = `arm-${side}`;
    arm.position.set(x, 1.39, 0);
    const upper = round(arm, cloth, 'upper sleeve', 0, -0.2, 0, 0.115, 0.26, 0.12, detailGeo);
    upper.rotation.z = side === 'left' ? 0.13 : -0.13;
    round(arm, skin, 'hand', 0, -0.49, 0.015, 0.09, 0.1, 0.085, detailGeo);
    person.add(arm);
  }

  round(person, skin, 'rounded head', 0, 1.78, 0, 0.235, 0.28, 0.225);
  round(person, hair, 'short sculpted hair', 0, 1.94, -0.015, 0.24, 0.15, 0.23);
  round(person, skin, 'left ear', -0.235, 1.78, 0, 0.05, 0.07, 0.05, detailGeo);
  round(person, skin, 'right ear', 0.235, 1.78, 0, 0.05, 0.07, 0.05, detailGeo);

  // A small warm collar and restrained facial marks add a crafted, approachable finish.
  round(person, M.ivory, 'shirt collar', 0, 1.48, 0.02, 0.105, 0.085, 0.1, detailGeo);
  const eyeMat = M.black;
  round(person, eyeMat, 'left eye', -0.075, 1.81, 0.204, 0.018, 0.022, 0.012, detailGeo);
  round(person, eyeMat, 'right eye', 0.075, 1.81, 0.204, 0.018, 0.022, 0.012, detailGeo);
  return ownResources(person);
}




// Each mounted world/person owns resources; shared templates never enter a renderer.
function ownResources(root:THREE.Group):THREE.Group {
  const geometry=new Map<THREE.BufferGeometry,THREE.BufferGeometry>();
  const materials=new Map<THREE.Material,THREE.Material>();
  const ownMaterial=(m:THREE.Material)=>{if(!materials.has(m))materials.set(m,m.clone());return materials.get(m)!;};
  root.traverse(node=>{const item=node as THREE.Mesh;if(!item.isMesh)return;
    if(!geometry.has(item.geometry))geometry.set(item.geometry,item.geometry.clone());
    item.geometry=geometry.get(item.geometry)!;
    item.material=Array.isArray(item.material)?item.material.map(ownMaterial):ownMaterial(item.material);
  });return root;
}
