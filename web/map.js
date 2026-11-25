import { locations } from './fixtures.js';

const defaultCenter = locations[0].coordinates;
const normalize = (text) => String(text || '').toLowerCase().replace(/[\s.,·()]/g, '');

export function demoSearch(query) {
  const term = normalize(query);
  return locations.filter((location) => [location.name, location.area, ...location.keywords, ...location.addresses]
    .some((text) => normalize(text).includes(term)));
}

function matchDemoLocation(result) {
  return locations.find((location) => {
    const closeEnough = location.coordinates.every((coordinate, index) =>
      Math.abs(coordinate - result.coordinates[index]) < 0.004);
    const matchingName = [location.name, ...location.keywords].some((name) => normalize(result.name) === normalize(name));
    const matchingAddress = location.addresses.some((address) => result.addresses.some((candidate) =>
      normalize(candidate).endsWith(normalize(address))));
    return closeEnough && (matchingName || matchingAddress);
  });
}

function normalizeResult(result) {
  const addresses = [result.road_address_name, result.address_name].filter(Boolean);
  const item = {
    id: `search:${result.id || `${result.y},${result.x}`}`,
    name: result.place_name || result.road_address?.address_name || result.address_name,
    area: addresses[0] || '',
    coordinates: [Number(result.y), Number(result.x)],
    addresses,
  };
  const fixture = matchDemoLocation(item);
  return fixture ? { ...item, id: fixture.id, subtitle: fixture.subtitle } : item;
}

export async function connectKakaoMap(container, onSelect) {
  const response = await fetch('/map-config.json');
  if (!response.ok) throw new Error('지도 설정을 불러오지 못했습니다.');
  const { javascriptKey } = await response.json();
  if (!javascriptKey) return null;

  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => reject(new Error('지도 응답 시간이 초과됐습니다.')), 8000);
    const fail = () => {
      clearTimeout(timeout);
      reject(new Error('카카오맵을 불러오지 못했습니다.'));
    };
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(javascriptKey)}&libraries=services&autoload=false`;
    script.onerror = fail;
    script.onload = () => {
      if (!window.kakao?.maps?.load) return fail();
      window.kakao.maps.load(() => {
        clearTimeout(timeout);
        resolve();
      });
    };
    document.head.append(script);
  });

  const { maps } = window.kakao;
  container.hidden = false;
  const map = new maps.Map(container, { center: new maps.LatLng(...defaultCenter), level: 4 });
  await new Promise((resolve, reject) => {
    const onTilesLoaded = () => {
      clearTimeout(timeout);
      maps.event.removeListener(map, 'tilesloaded', onTilesLoaded);
      resolve();
    };
    const timeout = setTimeout(() => {
      maps.event.removeListener(map, 'tilesloaded', onTilesLoaded);
      reject(new Error('지도 타일을 불러오지 못했습니다.'));
    }, 8000);
    maps.event.addListener(map, 'tilesloaded', onTilesLoaded);
  });
  const geocoder = new maps.services.Geocoder();
  const places = new maps.services.Places();
  let overlays = [];
  new ResizeObserver(() => {
    if (container.offsetWidth) map.relayout();
  }).observe(container);

  function serviceSearch(service, method, word) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('검색 응답 시간이 초과됐습니다.')), 8000);
      service[method](word, (results, status) => {
        clearTimeout(timeout);
        if (status === maps.services.Status.OK) resolve(results);
        else if (status === maps.services.Status.ZERO_RESULT) resolve([]);
        else reject(new Error('검색을 완료하지 못했습니다.'));
      });
    });
  }

  return {
    async search(query) {
      const outcomes = await Promise.allSettled([
        serviceSearch(geocoder, 'addressSearch', query),
        serviceSearch(places, 'keywordSearch', query),
      ]);
      const raw = outcomes.flatMap((outcome) => outcome.status === 'fulfilled' ? outcome.value : []);
      if (!raw.length && outcomes.some((outcome) => outcome.status === 'rejected')) {
        throw new Error('검색을 완료하지 못했습니다.');
      }
      const results = new Map();
      for (const result of raw.map(normalizeResult)) {
        if (result.coordinates.every(Number.isFinite)) results.set(result.id, result);
      }
      return [...results.values()];
    },
    setPins(items, activeId, documentStatus) {
      overlays.forEach((overlay) => overlay.setMap(null));
      overlays = items.map((location) => {
        const pin = makePin(location, location.id === activeId, documentStatus(location.id));
        pin.addEventListener('click', () => onSelect(location));
        return new maps.CustomOverlay({
          map, position: new maps.LatLng(...location.coordinates), content: pin, yAnchor: 1,
          zIndex: location.id === activeId ? 5 : 1,
        });
      });
    },
    select(location) {
      map.setCenter(new maps.LatLng(...location.coordinates));
    },
    zoom(delta) {
      map.setLevel(Math.min(13, Math.max(1, map.getLevel() - delta)));
    },
    reset() {
      map.setLevel(4);
      map.setCenter(new maps.LatLng(...defaultCenter));
    },
  };
}

function makePin(location, selected, documentStatus) {
  const pin = document.createElement('button');
  pin.type = 'button';
  pin.className = `map-pin ${selected ? 'is-selected' : ''}`;
  pin.setAttribute('aria-pressed', selected);
  pin.setAttribute('aria-label', `${location.name}${documentStatus ? `, ${documentStatus}` : ''}`);
  pin.innerHTML = '<span class="icon icon-pin" aria-hidden="true"></span><span></span>';
  pin.lastElementChild.textContent = location.name;
  return pin;
}

function drawPreviewMap(canvas, scale, offset) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const context = canvas.getContext('2d');
  context.scale(ratio, ratio);
  const tones = ['#e9eded', '#e4e9e9', '#e3e9e7', '#edf0ef'];
  context.fillStyle = '#eef1ef';
  context.fillRect(0, 0, width, height);
  context.translate(width * 0.5 + offset.x, height * 0.5 + offset.y);
  context.scale(scale, scale);
  context.translate(-width * 0.5, -height * 0.5);

  const extend = 750;
  const line = (points, color, weight) => {
    context.beginPath();
    points.forEach(([x, y], index) => index ? context.lineTo(x * width, y * height) : context.moveTo(x * width, y * height));
    context.strokeStyle = color;
    context.lineWidth = weight;
    context.lineJoin = 'round';
    context.stroke();
  };
  context.save();
  context.translate(width * 0.56, height * 0.48);
  context.rotate(-0.16);
  for (let y = -extend; y < height + extend; y += 38) {
    for (let x = -extend; x < width + extend; x += 47) {
      const index = Math.abs(Math.trunc(x * y / 47)) % tones.length;
      context.fillStyle = tones[index];
      const inset = index * 2;
      context.fillRect(x + inset, y, 41 - inset, 32 - index * 2);
      context.strokeStyle = '#f9fbfa';
      context.strokeRect(x + inset, y, 41 - inset, 32 - index * 2);
    }
  }
  context.restore();

  function park(x, y, w, h) {
    context.fillStyle = '#d8e9db';
    context.fillRect(x * width, y * height, w * width, h * height);
    context.strokeStyle = '#eaf4eb';
    context.lineWidth = 2;
    context.strokeRect(x * width + 5, y * height + 5, w * width - 10, h * height - 10);
  }
  park(0.19, 0.14, 0.19, 0.185);
  park(0.61, 0.13, 0.14, 0.1);
  park(0.44, 0.69, 0.15, 0.14);
  park(0.08, 0.57, 0.13, 0.16);
  const roads = [
    [[0.43, -2], [0.51, 0], [0.57, 0.32], [0.62, 0.48], [0.57, 0.68], [0.64, 1], [0.8, 3]],
    [[-2, 0.42], [0.1, 0.38], [0.48, 0.34], [0.7, 0.36], [1, 0.27], [3, 0.2]],
    [[-2, 0.76], [0.16, 0.69], [0.52, 0.59], [0.79, 0.57], [1, 0.67], [3, 0.78]],
    [[0.05, -2], [0.24, 0.05], [0.32, 0.42], [0.24, 0.68], [0.31, 1], [0.5, 3]],
    [[0.86, -2], [0.83, 0.06], [0.81, 0.43], [0.87, 0.61], [0.81, 1], [0.88, 3]],
  ];
  for (const road of roads) {
    line(road, '#dae2df', 15);
    line(road, '#fffefa', 12);
  }
  const stream = [[-2, 0.74], [0, 0.26], [0.18, 0.465], [0.44, 0.48], [0.73, 0.465], [1, 0.39], [3, 0.36]];
  line(stream, '#f7faf9', 11);
  line(stream, '#c6e2e9', 7);

  const labels = [
    [0.28, 0.235, '도심 공원', '#4e705a'], [0.72, 0.485, '산책로', '#4b707c'],
    [0.52, 0.775, '시민 공원', '#4e705a'], [0.4, 0.305, '세종대로', '#64737d'],
    [0.66, 0.65, '시청역', '#576978'], [0.36, 0.72, '서소문', '#64737d'],
  ];
  context.font = '600 12px Pretendard, sans-serif';
  context.textAlign = 'center';
  for (const [x, y, text, color] of labels) {
    context.fillStyle = color;
    context.fillText(text, x * width, y * height);
  }
}

export function createDemoMap(container, onSelect) {
  const canvas = container.querySelector('canvas');
  const pinLayer = container.querySelector('#demo-pins');
  let scale = 1;
  let offset = { x: 0, y: 0 };
  let drag = null;
  let pins = [];

  function redraw() {
    drawPreviewMap(canvas, scale, offset);
    for (const [pin, point] of pins) {
      const x = 50 + (point[0] - 50) * scale;
      const y = 50 + (point[1] - 50) * scale;
      pin.style.left = `calc(${x}% + ${offset.x}px)`;
      pin.style.top = `calc(${y}% + ${offset.y}px)`;
    }
  }

  new ResizeObserver(redraw).observe(container);
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    drag = { x: event.clientX - offset.x, y: event.clientY - offset.y };
    canvas.setPointerCapture(event.pointerId);
    container.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    offset = {
      x: Math.max(-canvas.clientWidth / 2, Math.min(canvas.clientWidth / 2, event.clientX - drag.x)),
      y: Math.max(-canvas.clientHeight / 2, Math.min(canvas.clientHeight / 2, event.clientY - drag.y)),
    };
    redraw();
  });
  canvas.addEventListener('lostpointercapture', () => {
    drag = null;
    container.classList.remove('dragging');
  });

  return {
    async search(query) { return demoSearch(query); },
    setPins(items, activeId, documentStatus) {
      pins = items.filter((location) => location.pin).map((location) => {
        const pin = makePin(location, location.id === activeId, documentStatus(location.id));
        pin.addEventListener('click', () => onSelect(location));
        return [pin, location.pin];
      });
      pinLayer.replaceChildren(...pins.map(([pin]) => pin));
      redraw();
    },
    select() {},
    zoom(delta) {
      scale = Math.min(2, Math.max(0.75, scale + delta * 0.2));
      redraw();
    },
    reset() {
      scale = 1;
      offset = { x: 0, y: 0 };
      redraw();
    },
  };
}
