import React, { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import { AmbientLight, DirectionalLight, MeshPhongMaterial } from 'three';
import { layoutMapMarkers, photoDimensions, photoLandBounds } from './marker-layout.mjs';
import { hasDescribedPhoto } from './beer-photo-eligibility.mjs';
import { photoReentryIds } from './photo-reentry.mjs';
import { createBeerPhotoIdentityIndex } from './beer-photo-identity.mjs';
import { createGeographicLandMask, createScreenLandMask, createProjectedLandGuard } from './land-mask.mjs';
import { createSphereUnprojector } from './map-projection.mjs';
import { contentImageStyle } from './photo-content-layout.mjs';
import { choosePhotoFocusAltitude } from './photo-focus.mjs';
import { createPhotoOccupancy } from './photo-overlap.mjs';

const MAP_URL = `${import.meta.env.BASE_URL}maps/world-50m.geojson`;
const OCEAN = '#071624';
const HOME_VIEW = {lat:20,lng:80};
const MARKER_ALTITUDE = 0.002;
const STAR_FIELD = Array.from({ length: 24 }, (_, index) => ({
  left: `${((index * 47 + 19) % 101)}%`,
  top: `${((index * 29 + 7) % 97)}%`,
  size: index % 11 === 0 ? 2 : 1,
  opacity: 0.12 + (index % 4) * 0.09,
}));
const BOTTLE_CSS = `
.brew-globe-view .globe-bottle-marker{position:relative;width:0;height:0;pointer-events:none}
.brew-globe-view .globe-bottle-stack{position:absolute;pointer-events:none}
.brew-globe-view .globe-bottle-halo{position:absolute;inset:-3px;border-radius:45%;background:radial-gradient(ellipse,rgba(182,197,145,.13),rgba(159,190,151,.035) 65%,transparent 76%);pointer-events:none}
.brew-globe-view .globe-bottle{appearance:none;position:absolute;inset:0;width:var(--beer-photo-width,8.32px);height:var(--beer-photo-height,16px);padding:0!important;margin:0;border:0!important;background:transparent!important;box-shadow:none!important;cursor:pointer;pointer-events:auto;transition:filter .2s;line-height:0}
.brew-globe-view .globe-bottle img{display:block;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 1px 1px #0008);user-select:none;-webkit-user-drag:none}
.brew-globe-view .globe-photo-viewport{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.brew-globe-view .globe-bottle:not([data-image-state="ready"]) img{opacity:0}
.brew-globe-view .globe-photo-state{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:3px;border:1px solid #b8c49c55;border-radius:7px;background:#1b383ee8;color:#c7d0b7;font:500 8px/1.5 system-ui,sans-serif;white-space:pre-line;text-align:center;pointer-events:none}
.brew-globe-view .globe-bottle[data-image-state="ready"] .globe-photo-state{display:none}
.brew-globe-view .globe-bottle[data-photo="true"] img{border-radius:3px;filter:drop-shadow(0 1px 1px #0008)}
.brew-globe-view .globe-bottle:hover,.brew-globe-view .globe-bottle:focus-visible{filter:brightness(1.12);z-index:10000!important;outline:1px solid #efc37b!important;outline-offset:4px;border-radius:6px}
.brew-globe-view .globe-bottle-marker:has(.globe-bottle:hover),.brew-globe-view .globe-bottle-marker:has(.globe-bottle:focus-visible){z-index:100000!important}
.brew-globe-view .globe-bottle-tooltip{position:absolute;left:50%;bottom:calc(100% + 10px);transform:translateX(-50%);max-width:210px;width:max-content;padding:8px 11px;border:1px solid #b3c4a637;border-radius:8px;background:#0e262beb;color:#f7edcf;font:500 11px/1.45 system-ui,sans-serif;text-align:center;box-shadow:0 5px 20px #0005;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .15s;z-index:30}
.brew-globe-view .globe-bottle:hover .globe-bottle-tooltip,.brew-globe-view .globe-bottle:focus-visible .globe-bottle-tooltip{opacity:1;visibility:visible}
@media(prefers-reduced-motion:reduce){.brew-globe-view .globe-bottle-stack,.brew-globe-view .globe-bottle{transition:none}}
`;

const RADIANS = Math.PI / 180;
function hasCoordinates(place) {
  return Number.isFinite(place.lat) && Number.isFinite(place.lng)
    && Math.abs(place.lat) <= 90 && Math.abs(place.lng) <= 180;
}

// Layout is computed in pixels, but its anchors always remain source coordinates.
function layoutOptions(wrapper, width, height, zoom, selectedId) {
  const bounds = wrapper?.getBoundingClientRect();
  const shell = wrapper?.closest('.app');
  const obstacles = bounds && shell ? [...shell.querySelectorAll('.globe-tools,.map-summary,.map-hint,.filter-dock,.brewery-tray,.inspector,.compare-dock')]
    .filter(element => element.getClientRects().length).map(element => {
      const box = element.getBoundingClientRect();
      return { left: box.left - bounds.left - 7, right: box.right - bounds.left + 7,
        top: box.top - bounds.top - 7, bottom: box.bottom - bounds.top + 7 };
    }) : [];
  return { width, height, zoom, compact: width < 600, selectedId, obstacles, sizeRoot: wrapper,
    leftMargin: bounds ? Math.max(8, 8 - bounds.left) : 8,
    rightMargin: bounds ? Math.max(8, bounds.right - window.innerWidth + 8) : 8,
    topMargin: 8, bottomMargin: 12 };
}

// Photo display coordinates belong to the map surface. They are deliberately
// separate from brewery coordinates, which remain unchanged source records.
function previousPhotoPlacements(anchors, projectGeo, zoom) {
  const placements = new Map();
  for (const [id, anchor] of anchors) {
    const point = projectGeo(anchor.lat, anchor.lng);
    if (!point || point.visible === false) { placements.set(id, null); continue; }
    const source = projectGeo(anchor.sourceLat, anchor.sourceLng);
    const distance = source ? Math.hypot(point.x - source.x, point.y - source.y) : 0;
    const scale = Math.max(zoom / (anchor.zoom || zoom), anchor.screenDistance > 1 ? distance / anchor.screenDistance : 0);
    placements.set(id, { x: point.x, y: point.y,
      maxDisplayDistance: Math.ceil(anchor.reach * scale / 8) * 8 });
  }
  return placements;
}

function hiddenPhotosEligibleForReentry(anchors, cache) {
  const now = performance.now(), photos = [];
  for (const [id] of anchors) {
    const node = cache.get(id);
    const visible = node?.isConnected && node._wasVisible && node.closest('[data-marker-id]')?._visible !== false;
    if (node && !visible) node._hiddenSince ??= now;
    photos.push({ id, visible: Boolean(visible), hiddenSince: node?._hiddenSince });
  }
  return photoReentryIds(photos, now);
}

function attachPhotoAnchors(markers, anchors, unproject, zoom) {
  for (const marker of markers) for (const photo of marker.photos) {
    const previous = photo.placementRetained && anchors.get(photo.beer.id);
    const coordinates = previous || unproject(photo.sourceX + photo.displayOffsetX, photo.sourceY + photo.displayOffsetY);
    if (!coordinates) continue;
    const anchor = previous || { lat: coordinates.lat, lng: coordinates.lng, sourceLat: photo.sourceLat, sourceLng: photo.sourceLng, sourceId: photo.sourceId,
      reach: photo.maxDisplayDistance, zoom, screenDistance: Math.hypot(photo.displayOffsetX, photo.displayOffsetY) };
    anchors.set(photo.beer.id, anchor);
    photo.displayLat = anchor.lat; photo.displayLng = anchor.lng;
  }
  return markers;
}

function globePhotoProjection(globe, lat, lng, altitude = 0) {
  const camera = globe.pointOfView(), a = camera.lat * RADIANS, b = lat * RADIANS;
  const facing = Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b) * Math.cos((lng - camera.lng) * RADIANS);
  return { ...globe.getScreenCoords(lat, lng, altitude), visible: facing >= 1 / (1 + Math.max(0.08, camera.altitude)) };
}

function annotateMarker(element, marker) {
  // The globe renderer dispatches a deferred click from pointerup. Keep an
  // HTML photo tap from also selecting the globe surface underneath it.
  element.onpointerdown = event => event.stopPropagation();
  element.onpointerup = event => event.stopPropagation();
  element._marker = marker;
  element._markerWidth = marker.markerWidth;
  element._markerHeight = marker.markerHeight;
  element.dataset.markerId = marker.id;
  element.dataset.anchorId = marker.anchorId;
  element.dataset.photoCount = String(marker.photos?.length || 0);
  element.dataset.expanded = String(marker.expanded || false);
  element.dataset.displayOffsetX = String(marker.displayOffsetX || 0);
  element.dataset.displayOffsetY = String(marker.displayOffsetY || 0);
  element.dataset.cluster = String(marker.kind === 'cluster');
  element.dataset.anchorLat = String(marker.lat);
  element.dataset.anchorLng = String(marker.lng);
  element.dataset.screenX = String(marker.x);
  element.dataset.screenY = String(marker.y);
  element.dataset.memberCount = String(marker.members?.length || 1);
  element.dataset.memberIds = JSON.stringify((marker.members || [marker]).map(member => member.id));
  element.dataset.beerCount = String(marker.beerCount);
  element.dataset.availablePhotoCount = String(marker.availablePhotoCount ?? marker.photos?.length ?? 0);
  element.dataset.hiddenPhotoCount = String(marker.hiddenPhotoCount || 0);
  element.dataset.landConstrained = String(marker.landConstrained || false);
}

function createBottleMarker(marker, { selectedBreweryId, selectedBeerId, onSelect, onBeerSelect, photoIdentityIndex }, existing, photoCache = new Map()) {
  const brewery = marker.brewery;
  const element = existing || document.createElement('div');
  if (existing && !existing.classList.contains('globe-bottle-marker')) existing.replaceChildren();
  element.className = 'globe-bottle-marker';
  element.dataset.breweryId = brewery.id;
  annotateMarker(element, marker);
  element.dataset.selected = String(marker.members.some(place => place.id === selectedBreweryId));
  const width = marker.markerWidth, height = marker.markerHeight;
  const stack = element.querySelector('.globe-bottle-stack') || document.createElement('div');
  stack.className = 'globe-bottle-stack';
  const activePhotos = new Set(marker.photos.map(photo => photo.beer.id));
  for (const child of stack.querySelectorAll('.globe-bottle')) {
    if (!activePhotos.has(child.dataset.beerId)) {
      if (child._wasVisible) child._revealAfter = performance.now() + 700;
      child._wasVisible = false;
      child._hiddenSince ??= performance.now();
      child.remove();
    }
  }
  Object.assign(stack.style, { width: width + 'px', height: height + 'px',
    left: (marker.displayOffsetX - width / 2) + 'px', top: (marker.displayOffsetY - height / 2) + 'px' });
  marker.photos.forEach((photo, index) => {
    const { beer } = photo;
    // Keep decoded images when camera layout changes or a brewery changes clusters.
    const button = photoCache.get(beer.id) || document.createElement('button');
    photoCache.set(beer.id, button);
    button.type = 'button'; button.className = 'globe-bottle';
    button.dataset.beerId = beer.id;
    button.dataset.photoIdentity = photoIdentityIndex?.identityFor(beer) || beer.image;
    button.dataset.sourceBreweryId = photo.sourceId;
    button.dataset.sourceLat = String(photo.sourceLat); button.dataset.sourceLng = String(photo.sourceLng);
    if (button.dataset.displayLat && (Math.abs(Number(button.dataset.displayLat) - photo.displayLat) > 1e-7
      || Math.abs(Number(button.dataset.displayLng) - photo.displayLng) > 1e-7)) button._everVisible = false;
    button.dataset.displayLat = String(photo.displayLat); button.dataset.displayLng = String(photo.displayLng);
    button.dataset.photoScale = String(photo.scale ?? 1);
    button.dataset.sourceScreenX = String(photo.sourceX); button.dataset.sourceScreenY = String(photo.sourceY);
    button.dataset.displayOffsetX = String(photo.displayOffsetX); button.dataset.displayOffsetY = String(photo.displayOffsetY);
    if (photo.landComponent != null) button.dataset.landComponent = String(photo.landComponent);
    else delete button.dataset.landComponent;
    button.dataset.cluster = 'false'; button.dataset.photo = String(/\.jpe?g(?:\?|$)/i.test(beer.image || ''));
    button.dataset.selected = String(beer.id === selectedBeerId);
    button.setAttribute('aria-label', '查看 ' + beer.name);
    Object.assign(button.style, { left: (width / 2 + photo.x - photo.width / 2) + 'px',
      top: (height / 2 + photo.y - photo.height / 2) + 'px', width: '', height: '', zIndex: String(index + 1) });
    let img = button.querySelector('img');
    if (!img) {
      const placeholder = document.createElement('span');
      placeholder.className = 'globe-photo-state'; placeholder.textContent = '图片\n加载中';
      placeholder.setAttribute('aria-hidden', 'true');
      img = document.createElement('img');
      img.draggable = false; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
      img.onload = () => { button.dataset.imageState = 'ready'; };
      img.onerror = () => { button.dataset.imageState = 'failed'; placeholder.textContent = '图片\n暂不可用'; };
      const tooltip = document.createElement('span'); tooltip.className = 'globe-bottle-tooltip';
      const imageViewport = document.createElement('span'); imageViewport.className = 'globe-photo-viewport';
      imageViewport.append(img); button.append(imageViewport, placeholder, tooltip);
    }
    img.alt = beer.name;
    const contentStyle = contentImageStyle(beer, photo.width / photo.height);
    button.dataset.contentFit = String(Boolean(contentStyle));
    Object.assign(img.style, contentStyle || {position:'',width:'',height:'',left:'',top:'',maxWidth:'',maxHeight:''});
    const imageSource = beer.imageThumbnail || beer.image;
    if (img.getAttribute('src') !== imageSource) {
      button.dataset.imageState = 'loading';
      button.querySelector('.globe-photo-state').textContent = '图片\n加载中';
      img.src = imageSource;
      if (img.complete && img.naturalWidth) button.dataset.imageState = 'ready';
    }
    const award = beer.awards?.[0];
    const medal = {Gold:'金奖',Silver:'银奖',Bronze:'铜奖'}[award?.medal];
    const rating = award && medal ? ` · ${award.ratingYear} 年度 ${medal}`
      + (Number.isFinite(award.rating) ? ` ${award.rating.toFixed(2)}/5` : '') : '';
    button.querySelector('.globe-bottle-tooltip').textContent = beer.name + ' · ' + (photo.brewery.nameZh || photo.brewery.name)
      + ' · ' + (photo.brewery.countryZh || photo.brewery.city || '品牌参考位置') + rating;
    button.onclick = event => { event.stopPropagation(); if (onBeerSelect) onBeerSelect(beer); else onSelect?.(photo.brewery); };
    if (button.parentNode !== stack) stack.appendChild(button);
    button._photo = photo;
  });
  if (stack.parentNode !== element) element.appendChild(stack);
  return element;
}

// During movement, test each photo rather than the whitespace in a
// group's bounding box. Neighbouring groups can interleave in the shared grid.
function cullMovingMarkers(entries, options) {
  const occupied = createPhotoOccupancy();
  // One inherited size updates every old and newly inserted photo atomically,
  // even when React layout and the globe renderer run in different frames.
  if (options.photoSize && options.sizeRoot) {
    options.sizeRoot.style.setProperty('--beer-photo-width', `${options.photoSize.photoWidth}px`);
    options.sizeRoot.style.setProperty('--beer-photo-height', `${options.photoSize.photoHeight}px`);
  }
  let awaitingReveal = false;
  const now = performance.now();
  entries.sort((a, b) => Number(b.element.dataset.selected === 'true') - Number(a.element.dataset.selected === 'true')
    || a.element.dataset.markerId.localeCompare(b.element.dataset.markerId));
  const reserve = (rect, photograph = false) => {
    const overlaps = other => rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top;
    const visible = [rect.left, rect.right, rect.top, rect.bottom].every(Number.isFinite) && rect.left >= options.leftMargin
      && rect.right <= options.width - options.rightMargin && rect.top >= options.topMargin
      && rect.bottom <= options.height - options.bottomMargin
      // CSS2D transforms may round by a few hundredths of a pixel. Keep the
      // actual DOM rectangle safely inside the sampled coast after rounding.
      && (!photograph || options.landMask?.containsRect(photoLandBounds(rect)))
      && !options.obstacles.some(overlaps) && occupied.canPlace(rect);
    if (visible) occupied.add(rect);
    return visible;
  };
  const visibility = (node, visible, photograph = false) => {
    if (!node) return false;
    if (photograph) {
      if (!visible && node._everVisible) node._revealAfter = now + 700;
      if (visible && now < (node._revealAfter || 0)) {
        visible = false; awaitingReveal = true;
      }
      if (visible && node.dataset.imageState !== 'ready') {
        if (node.dataset.imageState === 'loading') awaitingReveal = true;
        visible = false;
      }
      if (visible && !node._everVisible && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
      }
      node._wasVisible = visible;
      node._everVisible ||= visible;
      if (visible) node._hiddenSince = null;
      else node._hiddenSince ??= now;
    }
    node.style.visibility = visible ? 'visible' : 'hidden';
    node.setAttribute('aria-hidden', String(!visible));
    node.tabIndex = visible ? 0 : -1;
    return visible;
  };
  const frames = entries.map(entry => {
    const { element, x, y } = entry, marker = element._marker;
    const centerX = x + (marker.displayOffsetX || 0), centerY = y + (marker.displayOffsetY || 0);
    element.dataset.screenX = String(x); element.dataset.screenY = String(y);
    if (options.globe) element.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    return { ...entry, centerX, centerY, anyVisible: false, visiblePhotos: 0 };
  });
  for (const frame of frames) {
    const { element, centerX, centerY, sourceScreens, photoScreens } = frame;
    element.querySelectorAll('.globe-bottle').forEach((button, index) => {
      const photo = button._photo, source = photo && sourceScreens?.find(point => point.id === photo.beer.id);
      if (!photo) return;
      const projected = photoScreens?.find(point => point.id === photo.beer.id);
      const x = projected?.x ?? centerX + photo.x, y = projected?.y ?? centerY + photo.y;
      const dimensions = options.photoSize;
      const height = dimensions?.photoHeight ?? photo.height, width = dimensions?.photoWidth ?? photo.width;
      const marker = element._marker;
      Object.assign(button.style, { left: `${marker.markerWidth / 2 + x - centerX - width / 2}px`,
        top: `${marker.markerHeight / 2 + y - centerY - height / 2}px` });
      if (source) {
        button.dataset.sourceScreenX = String(source.x); button.dataset.sourceScreenY = String(source.y);
        button.dataset.displayOffsetX = String(x - source.x);
        button.dataset.displayOffsetY = String(y - source.y);
      }
      let visible = projected?.visible !== false && reserve({ left: x - width / 2, right: x + width / 2,
        top: y - height / 2, bottom: y + height / 2 }, true);
      visible = visibility(button, visible, true);
      frame.anyVisible ||= visible;
      if (visible) frame.visiblePhotos++;
    });
    element._layoutVisible = frame.anyVisible;
    element._visible = frame.anyVisible;
    element.style.display = frame.anyVisible ? '' : 'none';
    element.style.visibility = frame.anyVisible ? 'visible' : 'hidden';
    element.setAttribute('aria-hidden', String(!frame.anyVisible));
    element.dataset.visiblePhotoCount = String(frame.visiblePhotos);
  }
  return awaitingReveal;
}

function polygonRings(feature) {
  const geometry = feature.geometry;
  if (geometry?.type === 'Polygon') return [geometry.coordinates];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function project([longitude, latitude], width = 2048, height = 1024) {
  return [(longitude + 180) / 360 * width, (90 - latitude) / 180 * height];
}

// Paint from bundled Natural Earth geometry, so the globe never needs a map API.
function makeEarthTexture(features) {
  const canvas = document.createElement('canvas');
  canvas.width = 4096;
  canvas.height = 2048;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = OCEAN;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const wash = context.createLinearGradient(0, 0, 0, canvas.height);
  wash.addColorStop(0, '#0c2635');
  wash.addColorStop(0.4, '#0c1f2b');
  wash.addColorStop(1, '#081722');
  context.fillStyle = wash;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = 'rgba(123, 161, 161, 0.12)';
  context.lineWidth = 0.65;
  for (let longitude = -180; longitude <= 180; longitude += 15) {
    const x = project([longitude, 0], canvas.width, canvas.height)[0];
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }
  for (let latitude = -75; latitude <= 75; latitude += 15) {
    const y = project([0, latitude], canvas.width, canvas.height)[1];
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }

  features.forEach((feature, featureIndex) => {
    for (const polygon of polygonRings(feature)) {
      context.beginPath();
      for (const ring of polygon) {
        ring.forEach((coordinate, index) => {
          const [x, y] = project(coordinate, canvas.width, canvas.height);
          if (!index) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.closePath();
      }
      const shade = featureIndex % 4;
      context.fillStyle = ['#28453f', '#294841', '#2b4942', '#26443e'][shade];
      context.fill('evenodd');
      context.strokeStyle = 'rgba(126, 155, 127, 0.34)';
      context.lineWidth = 0.75;
      context.stroke();
    }
  });

  // A faint printed-atlas grain gives the map detail without remote imagery.
  context.fillStyle = 'rgba(167, 187, 155, 0.11)';
  for (let x = 0; x < canvas.width; x += 7) {
    for (let y = 0; y < canvas.height; y += 7) {
      if ((x * 17 + y * 31) % 19 < 7) context.fillRect(x, y, 0.65, 0.65);
    }
  }
  return canvas.toDataURL('image/png');
}

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function homeAltitude(width, height) {
  const diameterRatio = Math.min(width * 0.87, height * 0.87) / Math.max(height, 1);
  // Start one normal zoom step closer for the sparse new curated catalogue.
  // The shared photo zoom base uses this same value, keeping initial frames at
  // their usual size while providing enough real land for the first bottle.
  return Math.max(1.5, Math.min(4.8, Math.sqrt(1 + 1 / (diameterRatio * Math.tan(25 * Math.PI / 180)) ** 2) - 1)) * 0.76;
}

function FlatMap({ features, geographicLand, places, beersByBrewery, photoIdentityIndex, selectedBreweryId, selectedBeerId, onSelect, onBeerSelect, width = 1000, height = 500, focusRequest, zoomRequest, resetRequest, wrapperRef }) {
  const markerLayer = useRef(null);
  const photoCache = useRef(new Map());
  const photoAnchors = useRef(new Map());
  const anchorContext = useRef(null);
  const layoutRevision = useRef(0);
  const viewAnimation = useRef(null);
  const elements = useRef(new Map());
  const drag = useRef(null);
  const previousZoom = useRef(zoomRequest);
  const previousReset = useRef(resetRequest);
  const [view, setView] = useState({ lat: 0, lng: 0, zoom: 1 });
  const [layoutView, setLayoutView] = useState(view);
  useEffect(() => {
    const timer = window.setTimeout(() => setLayoutView(view), 120);
    const reentry = window.setTimeout(() => setLayoutView({ ...view }), 900);
    return () => { window.clearTimeout(timer); window.clearTimeout(reentry); };
  }, [view]);
  const viewRef = useRef(view); viewRef.current = view;
  useEffect(() => {
    // Overlay geometry is only final after React commits the detail panel.
    // Re-evaluate free space at the same view, retaining safe photo anchors.
    const frame = requestAnimationFrame(() => setLayoutView({ ...viewRef.current }));
    return () => cancelAnimationFrame(frame);
  }, [selectedBeerId]);
  const animateView = useCallback((target, resetAnchors = false) => {
    if (viewAnimation.current) cancelAnimationFrame(viewAnimation.current);
    if (resetAnchors) photoAnchors.current.clear();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setView(target); setLayoutView(target); return; }
    const start = viewRef.current, started = performance.now();
    const step = now => {
      const fraction = Math.min(1, (now - started) / 420), eased = fraction * fraction * (3 - 2 * fraction);
      if (fraction === 1 && resetAnchors) { photoAnchors.current.clear(); setLayoutView(target); }
      setView({ lat: start.lat + (target.lat - start.lat) * eased, lng: start.lng + (target.lng - start.lng) * eased,
        zoom: start.zoom * (target.zoom / start.zoom) ** eased });
      viewAnimation.current = fraction < 1 ? requestAnimationFrame(step) : null;
    };
    viewAnimation.current = requestAnimationFrame(step);
  }, []);
  useEffect(() => () => { if (viewAnimation.current) cancelAnimationFrame(viewAnimation.current); }, []);
  useEffect(() => { if (wrapperRef.current) wrapperRef.current.dataset.zoomScale = String(view.zoom); }, [view.zoom, wrapperRef]);
  const mapWidth = Math.max(1, width), mapHeight = Math.max(280, height);
  const span = 1000 / view.zoom;
  const viewHeight = span * mapHeight / mapWidth;
  const [centerX, centerY] = project([view.lng, view.lat], 1000, 500);
  const viewBox = `${centerX - span / 2} ${centerY - viewHeight / 2} ${span} ${viewHeight}`;
  const projectGeo = useCallback((lat, lng) => {
    const [x, y] = project([lng, lat], 1000, 500);
    return { x: (x - centerX + span / 2) / span * mapWidth,
      y: (y - centerY + viewHeight / 2) / viewHeight * mapHeight, visible: true };
  }, [centerX, centerY, span, viewHeight, mapWidth, mapHeight]);
  const liveUnproject = useCallback((x, y) => {
      const lng = (x / mapWidth * span + centerX - span / 2) / 1000 * 360 - 180;
      const lat = 90 - (y / mapHeight * viewHeight + centerY - viewHeight / 2) / 500 * 180;
      return Math.abs(lng) <= 180 && Math.abs(lat) <= 90 ? {lng, lat} : null;
  }, [mapWidth, mapHeight, span, viewHeight, centerX, centerY]);
  const landMask = useMemo(() => geographicLand ? createProjectedLandGuard({ width: mapWidth, height: mapHeight,
    geographicMask: geographicLand, step: 2, unproject: liveUnproject }) : null, [geographicLand, mapWidth, mapHeight, liveUnproject]);
  useLayoutEffect(() => { if (wrapperRef.current) {
    wrapperRef.current._landMask = landMask;
    wrapperRef.current._projectGeo = projectGeo;
  } }, [landMask, wrapperRef, projectGeo]);
  const featurePaths = useMemo(() => features.map(feature => ({
    name: feature.properties.name,
    path: polygonRings(feature).map(polygon => polygon.map(ring => ring.map((coordinate, index) => {
      const [x, y] = project(coordinate, 1000, 500);
      return `${index ? 'L' : 'M'}${x.toFixed(4)},${y.toFixed(4)}`;
    }).join(' ') + 'Z').join(' ')).join(' '),
  })), [features]);
  const markers = useMemo(() => {
    const context = [places, mapWidth, mapHeight];
    if (anchorContext.current?.some((value, index) => value !== context[index])) photoAnchors.current.clear();
    anchorContext.current = context;
    const layoutSpan = 1000 / layoutView.zoom, layoutHeight = layoutSpan * mapHeight / mapWidth;
    const [layoutX, layoutY] = project([layoutView.lng, layoutView.lat], 1000, 500);
    const projectLayout = (lat, lng) => {
      const [x, y] = project([lng, lat], 1000, 500);
      return { x: (x - layoutX + layoutSpan / 2) / layoutSpan * mapWidth,
        y: (y - layoutY + layoutHeight / 2) / layoutHeight * mapHeight };
    };
    const unprojectLayout = (x, y) => {
      const lng = (x / mapWidth * layoutSpan + layoutX - layoutSpan / 2) / 1000 * 360 - 180;
      const lat = 90 - (y / mapHeight * layoutHeight + layoutY - layoutHeight / 2) / 500 * 180;
      return Math.abs(lng) <= 180 && Math.abs(lat) <= 90 ? { lng, lat } : null;
    };
    const layoutLand = geographicLand ? createScreenLandMask({ width: mapWidth, height: mapHeight,
      geographicMask: geographicLand, step: 2, unproject: unprojectLayout }) : null;
    const entries = places.map(place => {
      return { ...place, ...projectLayout(place.lat, place.lng) };
    });
    const result = layoutMapMarkers(entries, { ...layoutOptions(wrapperRef.current, mapWidth, mapHeight, layoutView.zoom, selectedBreweryId), landMask: layoutLand,
      previousPlacements: previousPhotoPlacements(photoAnchors.current, projectLayout, layoutView.zoom), preservePrevious: true,
      relocatablePhotoIds: hiddenPhotosEligibleForReentry(photoAnchors.current, photoCache.current) }).markers;
    return attachPhotoAnchors(result, photoAnchors.current, unprojectLayout, layoutView.zoom);
  }, [places, layoutView, mapWidth, mapHeight, selectedBreweryId, wrapperRef, geographicLand]);
  useEffect(() => {
    const selected = places.find(place => place.id === selectedBreweryId);
    if (selected) animateView({ lat: selected.lat, lng: selected.lng, zoom: Math.max(4, viewRef.current.zoom) }, true);
  }, [selectedBreweryId, focusRequest, places]);
  useEffect(() => {
    const delta = zoomRequest - previousZoom.current; previousZoom.current = zoomRequest;
    if (delta) animateView({ ...viewRef.current, zoom: Math.max(1, Math.min(128, viewRef.current.zoom * 1.6 ** delta)) });
  }, [zoomRequest]);
  useEffect(() => {
    if (previousReset.current === resetRequest) return;
    previousReset.current = resetRequest; animateView({ lat: 0, lng: 0, zoom: 1 }, true);
  }, [resetRequest]);
  useLayoutEffect(() => {
    const layer = markerLayer.current;
    if (!layer) return;
    const ids = new Set(markers.map(marker => marker.id));
    for (const [id, element] of elements.current) if (!ids.has(id)) { element.remove(); elements.current.delete(id); }
    const frames = [];
    for (const marker of markers) {
      const element = createBottleMarker(marker, {
        selectedBreweryId, selectedBeerId, onSelect, onBeerSelect, photoIdentityIndex,
      }, elements.current.get(marker.id), photoCache.current);
      const projected = projectGeo(marker.lat, marker.lng);
      Object.assign(element.style, { position: 'absolute', left: projected.x + 'px', top: projected.y + 'px' });
      const previous = elements.current.get(marker.id);
      if (previous && previous !== element) previous.remove();
      elements.current.set(marker.id, element);
      if (element.parentNode !== layer) layer.appendChild(element);
      frames.push({ element, x: projected.x, y: projected.y, sourceScreens: marker.photos.map(photo => ({ id: photo.beer.id, ...projectGeo(photo.sourceLat, photo.sourceLng) })),
        photoScreens: marker.photos.map(photo => ({ id: photo.beer.id, ...projectGeo(photo.displayLat, photo.displayLng) })) });
    }
    if (wrapperRef.current) wrapperRef.current.dataset.layoutRevision = String(++layoutRevision.current);
    let timer;
    const settle = () => {
      if (cullMovingMarkers(frames, { ...layoutOptions(wrapperRef.current, mapWidth, mapHeight, view.zoom, selectedBreweryId), landMask,
        photoSize: photoDimensions({ zoom: view.zoom, compact: width < 600 }) })) {
        timer = window.setTimeout(settle, 60);
      }
    };
    settle();
    return () => window.clearTimeout(timer);
  }, [markers, beersByBrewery, selectedBreweryId, selectedBeerId, onSelect, onBeerSelect, centerX, centerY, span, viewHeight, mapWidth, mapHeight, landMask]);
  return <div className="globe-flat-map" style={{ position: 'absolute', inset: 0, overflow: 'hidden', touchAction: 'none', cursor: 'grab' }}
    onPointerDown={event => {
      if (event.target.closest('button')) return;
      if (viewAnimation.current) cancelAnimationFrame(viewAnimation.current);
      drag.current = { x: event.clientX, y: event.clientY, view };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      if (!drag.current) return;
      const start = drag.current;
      setView({ ...start.view, lng: Math.max(-180, Math.min(180, start.view.lng - (event.clientX - start.x) / mapWidth * 360 / start.view.zoom)),
        lat: Math.max(-85, Math.min(85, start.view.lat + (event.clientY - start.y) / mapWidth * 360 / start.view.zoom)) });
    }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
    <svg viewBox={viewBox} aria-label="世界精酿酒厂平面地图" role="img" style={{ width: '100%', height: '100%' }}>
      <rect x="-1000" y="-1000" width="3000" height="2500" fill={OCEAN} />
      {featurePaths.map((feature, index) => <path key={`${feature.name}-${index}`} d={feature.path} fill="#213e39" stroke="#587164" strokeWidth={0.5 / view.zoom} fillRule="evenodd" />)}
    </svg>
    <div ref={markerLayer} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
    <span style={{ position: 'absolute', bottom: 10, left: 12, color: '#b5c7b8', fontSize: 11, pointerEvents: 'none' }}>酒图就近展开 · 点击酒瓶查看详情</span>
  </div>;
}

class GlobeBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function GlobeView({
  breweries = [], selectedBreweryId, onSelect, autoRotate = true,
  focusRequest = 0, zoomRequest = 0, resetRequest = 0, onReady,
  beers = [], selectedBeerId, onBeerSelect, searchActive = false, photoIdentityIndex,
}) {
  const wrapperRef = useRef(null);
  const globeRef = useRef(null);
  const stateRef = useRef({ autoRotate, onReady });
  stateRef.current = { autoRotate, onReady, selectedBreweryId, selectedBeerId, onSelect, onBeerSelect, photoIdentityIndex };
  const selectBrewery = useCallback(brewery => stateRef.current.onSelect?.(brewery), []);
  const selectBeer = useCallback(beer => stateRef.current.onBeerSelect?.(beer), []);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [features, setFeatures] = useState([]);
  const geographicLand = useMemo(() => features.length ? createGeographicLandMask(features,
    { width: 8192, height: 4096, coastMargin: 0 }) : null, [features]);
  const geographicLandRef = useRef(null);
  geographicLandRef.current = geographicLand;
  const landGuardRef = useRef(null);
  const [texture, setTexture] = useState(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [webGL] = useState(hasWebGL);
  const [camera, setCamera] = useState({ ...HOME_VIEW, altitude: 2.5 });
  const cameraTimer = useRef(null);
  const pendingCamera = useRef(camera);
  const globeMaterial = useMemo(() => new MeshPhongMaterial({
    color: '#ffffff', shininess: 4, specular: '#244c45',
    emissive: '#132c2c', emissiveIntensity: 0.32,
  }), []);
  const previousZoom = useRef(zoomRequest);
  const previousReset = useRef(resetRequest);
  const reducedMotion = useRef(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const userDragged = useRef(false);
  const previousAutoRotate = useRef(autoRotate);
  const previousDetailBeer = useRef(selectedBeerId);
  const fallbackReady = useRef(false);
  const markerElements = useRef(new Map());
  const markerData = useRef(new Map());
  const photoCache = useRef(new Map());
  const photoAnchors = useRef(new Map());
  const anchorContext = useRef(null);
  const layoutRevision = useRef(0);
  const reentryTimer = useRef(null);
  const layoutFrame = useRef(null);
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const points = useMemo(() => breweries.filter(hasCoordinates), [breweries]);
  const identities = useMemo(() => photoIdentityIndex || createBeerPhotoIdentityIndex(beers), [photoIdentityIndex, beers]);
  const visiblePhotoIds = useMemo(() => new Set(identities.deduplicate(beers, { searchActive }).filter(hasDescribedPhoto).map(beer => beer.id)), [identities, beers, searchActive]);
  const selected = points.find(brewery => brewery.id === selectedBreweryId);
  const beersByBrewery = useMemo(() => {
    const result = new Map();
    for (const beer of beers) {
      if (!result.has(beer.breweryId)) result.set(beer.breweryId, []);
      result.get(beer.breweryId).push(beer);
    }
    return result;
  }, [beers]);
  const places = useMemo(() => points.filter(brewery => !beers.length || beersByBrewery.has(brewery.id)).map(brewery => ({
    id: brewery.id, kind: 'brewery', lat: brewery.lat, lng: brewery.lng, brewery,
    beerCount: (beersByBrewery.get(brewery.id) || []).length,
    photoBeers: (beersByBrewery.get(brewery.id) || []).filter(beer => visiblePhotoIds.has(beer.id)),
  })), [points, beers.length, beersByBrewery, visiblePhotoIds]);
  const mapMarkers = useMemo(() => {
    const globe = globeRef.current;
    if (!ready || !globe) return [];
    const context = [places, size.width, size.height];
    if (anchorContext.current?.some((value, index) => value !== context[index])) photoAnchors.current.clear();
    anchorContext.current = context;
    // pointOfView updates camera position before Three renders its matrices.
    // Project anchors and the land mask from the same current camera snapshot.
    globe.camera().updateMatrixWorld();
    const currentView = globe.pointOfView();
    const previousPlacements = previousPhotoPlacements(photoAnchors.current,
      (lat, lng) => globePhotoProjection(globe, lat, lng), 2.5 / Math.max(0.08, currentView.altitude));
    const retainedSources = new Set();
    for (const [id, point] of previousPlacements) {
      if (point && point.x >= 0 && point.x <= size.width && point.y >= 0 && point.y <= size.height)
        retainedSources.add(photoAnchors.current.get(id).sourceId);
    }
    const entries = places.map(place => {
      const projection = globePhotoProjection(globe, place.lat, place.lng, MARKER_ALTITUDE);
      return { ...place, x: projection.x, y: projection.y, retainOnly: !projection.visible };
    }).filter(place => !place.retainOnly || retainedSources.has(place.id));
    const landMask = geographicLand ? createScreenLandMask({width: size.width, height: size.height, step: 2,
      geographicMask: geographicLand,
      unproject: createSphereUnprojector(globe.camera(), size.width, size.height, globe.getGlobeRadius())}) : null;
    const laidOut = layoutMapMarkers(entries, { ...layoutOptions(wrapperRef.current, size.width, size.height,
      2.5 / Math.max(0.08, currentView.altitude), selectedBreweryId), photoZoomBase: 2.5 / homeAltitude(size.width, size.height), landMask,
      previousPlacements,
      preservePrevious: true, relocatablePhotoIds: hiddenPhotosEligibleForReentry(photoAnchors.current, photoCache.current) }).markers;
    return attachPhotoAnchors(laidOut, photoAnchors.current, (x, y) => landMask?.geographicAt(x, y), 2.5 / Math.max(0.08, currentView.altitude)).map(marker => {
        // three-globe identifies data by object identity, not by the id field.
        // Retain that identity so updating layout does not destroy its CSS2D node.
        const stable = markerData.current.get(marker.id) || {};
        Object.assign(stable, marker);
        markerData.current.set(marker.id, stable);
        return stable;
      });
  }, [places, camera, size.width, size.height, ready, selectedBreweryId, geographicLand]);

  const requestMarkerLayout = useCallback(() => {
    if (layoutFrame.current !== null) return;
    layoutFrame.current = window.requestAnimationFrame(() => {
      layoutFrame.current = null;
      const globe = globeRef.current;
      if (!globe) return;
      globe.camera().updateMatrixWorld();
      const entries = [];
      let waitingForDOM = false;
      for (const element of markerElements.current.values()) {
        // CSS2D attaches its nodes on a later render frame. Keep the reference
        // until then; deleting it here leaves first-load markers overlapping.
        if (!element.isConnected) {
          element._layoutAttempts = (element._layoutAttempts || 0) + 1;
          if (element._layoutAttempts < 24) waitingForDOM = true;
          continue;
        }
        const marker = element._marker;
        const screen = globe.getScreenCoords(marker.lat, marker.lng, MARKER_ALTITUDE);
        entries.push({ element, x: screen.x, y: screen.y,
          sourceScreens: marker.photos.map(photo => ({id: photo.beer.id, ...globe.getScreenCoords(photo.sourceLat, photo.sourceLng, MARKER_ALTITUDE)})),
          photoScreens: marker.photos.map(photo => ({id: photo.beer.id, ...globePhotoProjection(globe, photo.displayLat, photo.displayLng)})) });
      }
      // Existing photos follow their geographic anchors every frame; the
      // slower layout pass only fills free space and retires unsafe photos.
      const {width, height} = sizeRef.current;
      const currentCamera = globe.camera(); currentCamera.updateMatrixWorld();
      const signature = [width, height, ...currentCamera.matrixWorld.elements, ...currentCamera.projectionMatrix.elements].join(',');
      if (geographicLandRef.current && (landGuardRef.current?.signature !== signature || landGuardRef.current.geographic !== geographicLandRef.current)) {
        landGuardRef.current = {signature, geographic: geographicLandRef.current,
          mask: createProjectedLandGuard({width, height, step: 2, geographicMask: geographicLandRef.current,
            unproject: createSphereUnprojector(currentCamera, width, height, globe.getGlobeRadius())})};
      }
      const landMask = landGuardRef.current?.mask || null;
      const zoom = 2.5 / Math.max(0.08, globe.pointOfView().altitude);
      if (wrapperRef.current) {
        wrapperRef.current._landMask = landMask;
        wrapperRef.current._projectGeo = (lat, lng) => { globe.camera().updateMatrixWorld(); return globePhotoProjection(globe, lat, lng); };
        wrapperRef.current.dataset.zoomScale = String(zoom);
      }
      const awaitingReveal = cullMovingMarkers(entries, { ...layoutOptions(wrapperRef.current, width, height, zoom), landMask, globe: true,
        photoSize: photoDimensions({ zoom, photoZoomBase: 2.5 / homeAltitude(width, height), compact: width < 600 }) });
      if (waitingForDOM || awaitingReveal) requestMarkerLayout();
    });
  }, []);

  const updateBottleVisibility = useCallback((element, isVisible) => {
    // Brewery metadata may cross the horizon before its expanded photos.
    // Each image is projected and horizon-tested at its own display position.
    const changed = element._sourceVisible !== isVisible;
    element._sourceVisible = isVisible;
    element.style.display = element._layoutVisible ? '' : 'none';
    element.style.visibility = element._layoutVisible ? 'visible' : 'hidden';
    if (changed) requestMarkerLayout();
  }, [requestMarkerLayout]);

  useLayoutEffect(() => {
    const ids = new Set(mapMarkers.map(marker => marker.id));
    for (const id of markerElements.current.keys()) if (!ids.has(id)) markerElements.current.delete(id);
    for (const id of markerData.current.keys()) if (!ids.has(id)) markerData.current.delete(id);
    for (const marker of mapMarkers) {
      const element = markerElements.current.get(marker.id);
      if (!element) continue;
      createBottleMarker(marker, {...stateRef.current, onSelect: selectBrewery, onBeerSelect: selectBeer}, element, photoCache.current);
    }
    if (wrapperRef.current) wrapperRef.current.dataset.layoutRevision = String(++layoutRevision.current);
    requestMarkerLayout();
  }, [mapMarkers, selectedBeerId, selectedBreweryId, size.width, size.height, ready, selectBrewery, selectBeer, requestMarkerLayout]);

  useEffect(() => () => {
    if (layoutFrame.current !== null) window.cancelAnimationFrame(layoutFrame.current);
    if (cameraTimer.current !== null) window.clearTimeout(cameraTimer.current);
    if (reentryTimer.current !== null) window.clearTimeout(reentryTimer.current);
  }, []);

  const handleCameraChange = useCallback(position => {
    requestMarkerLayout();
    if (!position || !Number.isFinite(position.altitude)) return;
    pendingCamera.current = position;
    window.clearTimeout(reentryTimer.current);
    reentryTimer.current = window.setTimeout(() => {
      reentryTimer.current = null;
      if (globeRef.current) setCamera({ ...globeRef.current.pointOfView() });
    }, 900);
    if (cameraTimer.current !== null) return;
    // Add photos at most six times per second. Retained photo anchors and live
    // dimensions follow the camera each frame without moving to a new grid.
    cameraTimer.current = window.setTimeout(() => {
      cameraTimer.current = null;
      // A matching pointOfView can still be the first completed renderer frame:
      // canvas sizing/projection and its land raster may only now be available.
      setCamera({ ...pendingCamera.current });
    }, 160);
  }, [requestMarkerLayout]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return undefined;
    const resize = () => {
      const box = wrapper.getBoundingClientRect();
      setSize({ width: Math.max(1, Math.round(box.width)), height: Math.max(1, Math.round(box.height)) });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if ((!webGL || failed) && features.length && !fallbackReady.current) {
      fallbackReady.current = true;
      stateRef.current.onReady?.();
    }
  }, [webGL, failed, features.length]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(MAP_URL, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Map unavailable'); return response.json(); })
      .then(collection => {
        setFeatures(collection.features);
        setTexture(makeEarthTexture(collection.features));
      })
      .catch(error => { if (error.name !== 'AbortError') setMapError(true); });
    return () => controller.abort();
  }, []);

  const configureGlobe = useCallback(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const controls = globe.controls();
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.65;
    controls.minDistance = 108;
    controls.maxDistance = 750;
    controls.autoRotateSpeed = 0.22;
    controls.autoRotate = stateRef.current.autoRotate && !reducedMotion.current;
    const renderer = globe.renderer();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, sizeRef.current.width < 650 ? 1.6 : 2));
    renderer.setClearColor(0x000000, 0);
    const sunlight = new DirectionalLight('#e2f1db', 2.1);
    sunlight.position.set(-100, 160, 250);
    const rim = new DirectionalLight('#628b91', 0.65);
    rim.position.set(170, -40, -120);
    globe.lights([new AmbientLight('#d5e4da', 1.6), sunlight, rim]);
    const home = { ...HOME_VIEW, altitude: homeAltitude(sizeRef.current.width, sizeRef.current.height) };
    globe.pointOfView(home, 0);
    setCamera(home);
    setReady(true);
    stateRef.current.onReady?.();
  }, []);

  const makeHtmlBottleMarker = useCallback(marker => {
    const element = createBottleMarker(marker, {
      ...stateRef.current, onSelect: selectBrewery, onBeerSelect: selectBeer,
    }, undefined, photoCache.current);
    element.style.visibility = 'hidden';
    markerElements.current.set(marker.id, element);
    requestMarkerLayout();
    return element;
  }, [selectBrewery, selectBeer, requestMarkerLayout]);

  useEffect(() => {
    if (!ready || !globeRef.current) return undefined;
    const globe = globeRef.current;
    const controls = globe.controls();
    const stopRotation = () => { userDragged.current = true; controls.autoRotate = false; };
    const canvas = globe.renderer().domElement;
    const loseContext = event => { event.preventDefault(); setFailed(true); };
    controls.addEventListener('start', stopRotation);
    canvas.addEventListener('webglcontextlost', loseContext);
    return () => {
      controls.removeEventListener('start', stopRotation);
      canvas.removeEventListener('webglcontextlost', loseContext);
    };
  }, [ready]);

  useEffect(() => {
    const changed = previousAutoRotate.current !== autoRotate;
    previousAutoRotate.current = autoRotate;
    if (changed) userDragged.current = false;
    if (ready && globeRef.current) globeRef.current.controls().autoRotate = autoRotate && !userDragged.current && !reducedMotion.current;
  }, [autoRotate, ready]);

  useEffect(() => {
    if (!ready || !globeRef.current || !selected) return;
    const globe = globeRef.current;
    // The parent pauses rotation on selection. Preserve an explicit restart,
    // including when this view remounts with an already selected brewery.
    globe.controls().autoRotate = stateRef.current.autoRotate && !userDragged.current && !reducedMotion.current;
    const hasPhoto = places.find(place => place.id === selected.id)?.photoBeers.length;
    photoAnchors.current.clear();
    const duration = reducedMotion.current ? 0 : 1000;
    // Resolve narrow-island capacity before the single focus animation. This
    // path is only a deliberate selection/filter focus, never ordinary zoom.
    const { width, height } = sizeRef.current;
    const initialAltitude = hasPhoto ? width < 500 ? 0.42 : 0.6 : 0.42;
    const focus = hasPhoto ? choosePhotoFocusAltitude({ camera: globe.camera(), target: selected,
      places, geographicMask: geographicLandRef.current, width, height, radius: globe.getGlobeRadius(),
      initialAltitude, layoutOptions: { ...layoutOptions(wrapperRef.current, width, height,
        2.5 / initialAltitude, selected.id), photoZoomBase: 2.5 / homeAltitude(width, height) } })
      : { altitude: initialAltitude, found: false, attempts: [] };
    if (wrapperRef.current) wrapperRef.current._lastPhotoFocus = { ...focus, targetId: selected.id };
    globe.pointOfView({ lat: selected.lat, lng: selected.lng, altitude: focus.altitude }, duration);
    // A deliberate focus/filter change starts a new view. Re-seed once the
    // destination is reached; ordinary zoom keeps its existing photo anchors.
    const timer = window.setTimeout(() => {
      photoAnchors.current.clear(); setCamera({ ...globe.pointOfView() });
    }, duration + 80);
    return () => window.clearTimeout(timer);
  }, [selected?.id, selected?.lat, selected?.lng, focusRequest, ready]);

  useEffect(() => {
    const closed = Boolean(previousDetailBeer.current) && !selectedBeerId;
    previousDetailBeer.current = selectedBeerId;
    if (!ready || !globeRef.current) return undefined;
    let timer;
    const frame = requestAnimationFrame(() => {
      const globe = globeRef.current;
      if (!globe) return;
      const lastFocus = wrapperRef.current?._lastPhotoFocus;
      // A full-screen mobile detail can temporarily block every placement.
      // Retry that failed deliberate focus once after closing, never from a
      // layout/camera feedback loop. Successful focuses keep the same camera.
      if (closed && selected && lastFocus?.targetId === selected.id && !lastFocus.found) {
        const { width, height } = sizeRef.current, current = globe.pointOfView();
        const focus = choosePhotoFocusAltitude({ camera: globe.camera(), target: selected,
          places, geographicMask: geographicLandRef.current, width, height, radius: globe.getGlobeRadius(),
          initialAltitude: current.altitude, layoutOptions: { ...layoutOptions(wrapperRef.current,
            width, height, 2.5 / current.altitude, selected.id), photoZoomBase: 2.5 / homeAltitude(width, height) } });
        if (wrapperRef.current) wrapperRef.current._lastPhotoFocus = { ...focus, targetId: selected.id,
          retriedAfterDetailClose: true };
        if (focus.found && Math.abs(focus.altitude - current.altitude) > 1e-8) {
          const duration = reducedMotion.current ? 0 : 500;
          globe.pointOfView({ lat: selected.lat, lng: selected.lng, altitude: focus.altitude }, duration);
          timer = window.setTimeout(() => setCamera({ ...globe.pointOfView() }), duration + 80);
        }
      }
      // No anchor reset: unobscured photos remain at their current geography.
      setCamera({ ...globe.pointOfView() });
    });
    return () => { cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [selectedBeerId, ready]);

  useEffect(() => {
    // Do not consume commands received while the texture / renderer is loading.
    // The initial counter value is only a baseline, so remounts do not replay
    // every historical zoom click from the parent.
    if (!ready || !globeRef.current) return;
    const delta = zoomRequest - previousZoom.current;
    previousZoom.current = zoomRequest;
    if (!delta) return;
    const globe = globeRef.current;
    const position = globe.pointOfView();
    globe.controls().autoRotate = false;
    userDragged.current = true;
    globe.pointOfView({ ...position, altitude: Math.max(0.08, Math.min(6.3, position.altitude * 0.76 ** delta)) }, reducedMotion.current ? 0 : 500);
  }, [zoomRequest, ready]);

  useEffect(() => {
    if (resetRequest === previousReset.current || !ready || !globeRef.current) return;
    previousReset.current = resetRequest;
    photoAnchors.current.clear();
    userDragged.current = false;
    const globe = globeRef.current;
    globe.controls().autoRotate = autoRotate && !reducedMotion.current;
    globe.pointOfView({ ...HOME_VIEW, altitude: homeAltitude(size.width, size.height) }, reducedMotion.current ? 0 : 1100);
  }, [resetRequest, ready, size.width, size.height, autoRotate]);

  useEffect(() => {
    if (!ready || !globeRef.current) return;
    globeRef.current.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, size.width < 650 ? 1.6 : 2));
    if (!selected && !userDragged.current) {
      globeRef.current.pointOfView({ altitude: homeAltitude(size.width, size.height) }, 0);
    }
  }, [size.width, size.height, ready, selected]);

  const fallback = <FlatMap features={features} geographicLand={geographicLand} places={places} beersByBrewery={beersByBrewery} photoIdentityIndex={identities} selectedBreweryId={selectedBreweryId} selectedBeerId={selectedBeerId} onSelect={onSelect} onBeerSelect={onBeerSelect} width={size.width} height={size.height} focusRequest={focusRequest} zoomRequest={zoomRequest} resetRequest={resetRequest} wrapperRef={wrapperRef} />;
  return <div ref={wrapperRef} className="brew-globe-view" data-map-mode={!webGL || failed ? "flat" : "globe"} data-zoom-scale={!webGL || failed ? undefined : 2.5 / Math.max(0.08, camera.altitude)} style={{ width: '100%', height: '100%', minHeight: 280, position: 'relative', overflow: 'hidden', background: 'radial-gradient(ellipse at 50% 45%, rgba(24,75,69,.23), rgba(5,14,23,0) 69%)' }}>
    <style>{BOTTLE_CSS}</style>
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {STAR_FIELD.map((star, index) => <i key={index} style={{ position: 'absolute', left: star.left, top: star.top, width: star.size, height: star.size, borderRadius: '50%', background: '#dae4d7', opacity: star.opacity }} />)}
    </div>
    {(!webGL || failed) ? fallback : texture && size.width > 0 && size.height > 0 ? <GlobeBoundary fallback={fallback}>
      <Globe ref={globeRef} width={size.width} height={size.height}
        backgroundColor="rgba(0,0,0,0)" globeImageUrl={texture} globeMaterial={globeMaterial}
        animateIn={false} rendererConfig={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        showAtmosphere atmosphereColor="#7cafa0" atmosphereAltitude={0.095}
        globeCurvatureResolution={3} onGlobeReady={configureGlobe}
        onZoom={handleCameraChange}
        htmlElementsData={mapMarkers} htmlLat="lat" htmlLng="lng" htmlAltitude={MARKER_ALTITUDE}
        htmlElement={makeHtmlBottleMarker} htmlElementVisibilityModifier={updateBottleVisibility} htmlTransitionDuration={0}
        enablePointerInteraction
      />
    </GlobeBoundary> : <div role="status" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#a4b8af', fontSize: 13, letterSpacing: '0.08em' }}>
      {mapError ? '地图暂时无法载入，请使用酒厂列表继续探索' : '正在展开世界地图…'}
    </div>}
    <p style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>精酿酒厂互动地球。拖拽旋转，滚动或双指缩放，点击酒图查看酒款。也可通过酒厂列表选择。</p>
  </div>;
}
