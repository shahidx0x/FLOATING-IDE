/*---------------------------------------------------------------------------------------------
 *  FLIDE Design — the canvas behind Code | Design.
 *  One .flow file holds three pages: Sketch (whiteboard), Architecture (system design) and
 *  DevOps playground (a runnable Docker stack). The file is JSON; every finished gesture is one
 *  edit of the document, so Save, dirty state and Undo/Redo come from the editor itself.
 *--------------------------------------------------------------------------------------------*/
(function () {
	'use strict';

	const vscode = acquireVsCodeApi();
	const SVGNS = 'http://www.w3.org/2000/svg';
	window.addEventListener('error', e => vscode.postMessage({ type: 'error', text: `${e.message} (line ${e.lineno}:${e.colno})` }));
	window.addEventListener('unhandledrejection', e => vscode.postMessage({ type: 'error', text: String(e.reason && e.reason.stack || e.reason) }));

	//#region Icons (16×16 stroke paths)
	const I = {
		select: 'M3.5 2l9 5-4 1.3L7 12.5z',
		hand: 'M5.5 8.5V4a1 1 0 0 1 2 0v3.5M7.5 7V3a1 1 0 0 1 2 0v4M9.5 7.5V4a1 1 0 0 1 2 0v5c0 3-2 5-4.5 5S3 12.5 3 10.5V8a1 1 0 0 1 2 0v1.5',
		rect: 'M2.5 3.5h11v9h-11z',
		diamond: 'M8 2l6 6-6 6-6-6z',
		ellipse: 'M8 3c3.3 0 6 2.2 6 5s-2.7 5-6 5-6-2.2-6-5 2.7-5 6-5z',
		arrow: 'M3 13L13 3M13 3H8M13 3v5',
		line: 'M3 13L13 3',
		pencil: 'M11 2.5l2.5 2.5L5.5 13H3v-2.5z',
		text: 'M3 3.5h10M8 3.5V13',
		sticky: 'M3 2.5h10v7l-3.5 4H3zM9.5 13.5v-4H13',
		eraser: 'M6 13.5h7.5M2.5 10l6-6.5 4.5 4.5-5.5 5.5H5z',
		box: 'M2.5 4.5L8 1.5l5.5 3v7L8 14.5l-5.5-3zM2.5 4.5L8 7.5l5.5-3M8 7.5v7',
		group: 'M2.5 3.5h3M7 3.5h2M10.5 3.5h3v3M13.5 8v1.5M13.5 11v1.5h-3M9 12.5H7M5.5 12.5h-3v-3M2.5 8V6.5',
		library: 'M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM11.5 9v5M9 11.5h5',
		monitor: 'M2.5 3h11v7.5h-11zM6 13.5h4M8 10.5v3',
		phone: 'M5 1.5h6v13H5zM7.5 12.3h1',
		globe: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM1.5 8h13M8 1.5c2.2 2.2 2.2 10.8 0 13M8 1.5c-2.2 2.2-2.2 10.8 0 13',
		lb: 'M8 2v4M8 6l-5 5M8 6l5 5M8 6v5M3 11v2M13 11v2M8 11v2',
		fn: 'M4 2.5h2.5l4.5 11h2M8 7.5l-3.5 6',
		db: 'M3 4c0-1.1 2.2-2 5-2s5 .9 5 2v8c0 1.1-2.2 2-5 2s-5-.9-5-2zM3 4c0 1.1 2.2 2 5 2s5-.9 5-2M3 8c0 1.1 2.2 2 5 2s5-.9 5-2',
		cache: 'M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z',
		queue: 'M2 5h3v6H2zM6.5 5h3v6h-3zM11 5h3v6h-3z',
		bucket: 'M2.5 4.5h11l-1.5 9h-8zM2.5 4.5c0-1.1 2.5-2 5.5-2s5.5.9 5.5 2',
		lock: 'M4 7h8v6.5H4zM5.5 7V5a2.5 2.5 0 0 1 5 0v2',
		chart: 'M2 13.5h12M3.5 11l3-4 3 2.5 4-5.5',
		user: 'M8 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 14c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5',
		gauge: 'M2.5 11a5.5 5.5 0 1 1 11 0M8 11l3-3.5',
		docker: 'M2 8.5h11.5c-.5 3-3 5-6.5 5S2.5 11.5 2 8.5zM3.5 6.5h2v2h-2zM6 6.5h2v2H6zM8.5 6.5h2v2h-2zM6 4h2v2.5H6z',
		export: 'M8 2v8M4.5 6.5L8 10l3.5-3.5M2.5 11v2.5h11V11',
		undo: 'M5.5 3L2.5 6l3 3M2.5 6H10a3.5 3.5 0 0 1 0 7H7',
		redo: 'M10.5 3l3 3-3 3M13.5 6H6a3.5 3.5 0 0 0 0 7h3',
		fit: 'M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4',
		trash: 'M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.7 9h5.6l.7-9',
		link: 'M7 9a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.8.8M9 7a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.8-.8',
		close: 'M4 4l8 8M12 4l-8 8',
		play: 'M4 2.5l9 5.5-9 5.5z',
		stop: 'M3.5 3.5h9v9h-9z',
		front: 'M2.5 2.5h7v7h-7zM6.5 6.5h7v7h-7z',
		copy: 'M5.5 5.5h8v8h-8zM2.5 10.5v-8h8'
	};
	//#endregion

	//#region Modes, tools, libraries
	const MODES = [
		{ id: 'sketch', label: 'Sketch', icon: I.pencil },
		{ id: 'arch', label: 'Architecture', icon: 'M1.5 2.5h5v4h-5zM9.5 9.5h5v4h-5zM4 6.5V12h5.5' },
		{ id: 'ops', label: 'DevOps playground', icon: I.play }
	];
	const TOOLS = {
		sketch: [
			['select', 'Select', 'V'], ['hand', 'Hand', 'H'], ['rect', 'Rectangle', 'R'], ['diamond', 'Diamond', 'D'], ['ellipse', 'Ellipse', 'O'],
			['arrow', 'Arrow', 'A'], ['line', 'Line', 'L'], ['pencil', 'Draw', 'P'], ['text', 'Text', 'T'], ['sticky', 'Sticky note', 'N'], ['eraser', 'Eraser', 'E']
		],
		arch: [['select', 'Select', 'V'], ['hand', 'Hand', 'H'], ['box', 'Part', 'B'], ['group', 'Boundary', 'G'], ['arrow', 'Connector', 'A'], ['text', 'Text', 'T'], ['sticky', 'Note', 'N']],
		ops: [['select', 'Select', 'V'], ['hand', 'Hand', 'H'], ['arrow', 'Connect services', 'A'], ['text', 'Label', 'T']]
	};
	const ACCENT = '#7AA2FF';
	const KINDS = {
		user: { label: 'User', icon: I.user, color: '#5FD3E0', sub: 'Person' },
		web: { label: 'Web app', icon: I.monitor, color: '#5FD3E0', sub: 'Client' },
		mobile: { label: 'Mobile app', icon: I.phone, color: '#5FD3E0', sub: 'Client' },
		cdn: { label: 'CDN', icon: I.globe, color: '#C39BFF', sub: 'Edge' },
		lb: { label: 'Load balancer', icon: I.lb, color: '#C39BFF', sub: 'L7 · HTTPS' },
		service: { label: 'Service', icon: I.box, color: ACCENT, sub: 'API' },
		function: { label: 'Function', icon: I.fn, color: ACCENT, sub: 'Serverless' },
		database: { label: 'Database', icon: I.db, color: '#9FD8A4', sub: 'SQL' },
		cache: { label: 'Cache', icon: I.cache, color: '#FF8F70', sub: 'In-memory' },
		queue: { label: 'Queue', icon: I.queue, color: '#FFB454', sub: 'Messages' },
		storage: { label: 'Storage', icon: I.bucket, color: '#C9CDD6', sub: 'Objects' },
		auth: { label: 'Auth', icon: I.lock, color: '#C39BFF', sub: 'Identity' },
		monitoring: { label: 'Monitoring', icon: I.chart, color: '#9FD8A4', sub: 'Metrics' },
		boundary: { label: 'Boundary', icon: I.group, color: '#9AA1AE', sub: 'VPC / network' }
	};
	const IMAGES = [
		{ id: 'nginx', label: 'nginx', image: 'nginx:1.27-alpine', icon: I.lb, color: '#9FD8A4', ports: ['8080:80'] },
		{ id: 'node', label: 'node', image: 'node:22-alpine', icon: I.box, color: ACCENT, ports: [], command: '' },
		{ id: 'python', label: 'python', image: 'python:3.12-slim', icon: I.box, color: '#FFB454', ports: [] },
		{ id: 'whoami', label: 'whoami', image: 'traefik/whoami', icon: I.box, color: '#5FD3E0', ports: [] },
		{ id: 'postgres', label: 'postgres', image: 'postgres:16-alpine', icon: I.db, color: ACCENT, ports: [], env: { POSTGRES_PASSWORD: 'dev' } },
		{ id: 'mysql', label: 'mysql', image: 'mysql:8.4', icon: I.db, color: '#5FD3E0', ports: [], env: { MYSQL_ROOT_PASSWORD: 'dev' } },
		{ id: 'redis', label: 'redis', image: 'redis:7-alpine', icon: I.cache, color: '#FF8F70', ports: [] },
		{ id: 'rabbitmq', label: 'rabbitmq', image: 'rabbitmq:3-alpine', icon: I.queue, color: '#FFB454', ports: [] },
		{ id: 'mongo', label: 'mongo', image: 'mongo:7', icon: I.db, color: '#9FD8A4', ports: [] },
		{ id: 'prometheus', label: 'prometheus', image: 'prom/prometheus', icon: I.chart, color: '#FF8F70', ports: ['9090:9090'] },
		{ id: 'grafana', label: 'grafana', image: 'grafana/grafana', icon: I.chart, color: '#FFB454', ports: ['3000:3000'] },
		{ id: 'custom', label: 'Dockerfile', image: '', build: '.', icon: I.docker, color: '#9AA1AE', ports: [] },
		{ id: 'loadgen', label: 'Load generator', icon: I.gauge, color: '#C39BFF', loadgen: true }
	];
	const SKETCH_STROKES = ['#E6E8EE', '#FF7B7B', '#9FD8A4', '#7AA2FF', '#FFB454'];
	const SKETCH_FILLS = [['none', 'transparent'], ['blue', 'rgba(122,162,255,0.22)'], ['green', 'rgba(159,216,164,0.22)'], ['yellow', 'rgba(247,221,122,0.25)'], ['red', 'rgba(255,123,123,0.22)']];
	const ARCH_COLORS = [ACCENT, '#5FD3E0', '#C39BFF', '#9FD8A4', '#FFB454', '#FF8F70', '#C9CDD6'];
	const FONT_SIZES = { S: 16, M: 20, L: 28 };
	//#endregion

	//#region State
	let doc = null;           // { flide, version, mode, pages: { sketch, arch, ops } }
	let lastText = null;      // text of the document as last seen or sent
	let mode = 'sketch';
	let tool = 'select';
	let sel = new Set();
	let hoverId = null;
	let drag = null;          // current pointer gesture
	let spaceDown = false;
	let editing = null;       // { id, textarea }
	let views = {};           // per mode { x, y, zoom } — kept out of the file
	const ui = { lib: false, code: false, exportMenu: false, sketchStyle: { stroke: '#E6E8EE', fill: 'transparent', dash: 'solid', width: 2, rough: 1, font: 'M' } };
	let runtime = { running: false, busy: false, docker: 'unknown', services: {}, load: null, message: '', project: '' };
	let fileName = 'design.flow';
	let clipboard = null;

	const saved = vscode.getState();
	if (saved) {
		views = saved.views || {};
		mode = saved.mode || mode;
		ui.lib = !!saved.lib;
		ui.code = !!saved.code;
		if (saved.sketchStyle) { Object.assign(ui.sketchStyle, saved.sketchStyle); }
	}
	function persistUiState() {
		vscode.setState({ views, mode, lib: ui.lib, code: ui.code, sketchStyle: ui.sketchStyle });
	}
	//#endregion

	//#region Helpers
	const $ = (sel, root) => (root || document).querySelector(sel);
	function h(tag, attrs, ...children) {
		const el = document.createElement(tag);
		if (attrs) {
			for (const k in attrs) {
				const v = attrs[k];
				if (v === undefined || v === null || v === false) { continue; }
				if (k === 'class') { el.className = v; }
				else if (k === 'style' && typeof v === 'object') { Object.assign(el.style, v); }
				else if (k.startsWith('on') && typeof v === 'function') { el.addEventListener(k.slice(2).toLowerCase(), v); }
				else if (k === 'text') { el.textContent = v; }
				else { el.setAttribute(k, v === true ? '' : v); }
			}
		}
		for (const c of children.flat()) {
			if (c === null || c === undefined || c === false) { continue; }
			el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
		}
		return el;
	}
	function s(tag, attrs, ...children) {
		const el = document.createElementNS(SVGNS, tag);
		if (attrs) {
			for (const k in attrs) {
				const v = attrs[k];
				if (v === undefined || v === null || v === false) { continue; }
				if (k === 'text') { el.textContent = v; } else { el.setAttribute(k, v); }
			}
		}
		for (const c of children.flat()) { if (c) { el.appendChild(c); } }
		return el;
	}
	function icon(path, size) {
		const n = size || 16;
		return s('svg', { width: n, height: n, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, s('path', { d: path }));
	}
	function uid(prefix) { return (prefix || 'e') + Math.random().toString(36).slice(2, 9); }
	function clone(o) { return JSON.parse(JSON.stringify(o)); }
	function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
	function slug(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'svc'; }
	function hexA(hex, a) {
		const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
		if (!m) { return hex; }
		const n = parseInt(m[1], 16);
		return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
	}
	function emptyDoc() {
		return { flide: 'flow', version: 1, mode: 'sketch', pages: { sketch: { elements: [] }, arch: { elements: [] }, ops: { elements: [] } } };
	}
	function normalize(d) {
		const out = (d && typeof d === 'object') ? d : emptyDoc();
		out.flide = 'flow';
		out.version = out.version || 1;
		out.pages = out.pages || {};
		for (const m of ['sketch', 'arch', 'ops']) {
			out.pages[m] = out.pages[m] || { elements: [] };
			out.pages[m].elements = Array.isArray(out.pages[m].elements) ? out.pages[m].elements.filter(e => e && e.id && e.type) : [];
		}
		if (!['sketch', 'arch', 'ops'].includes(out.mode)) { out.mode = 'sketch'; }
		return out;
	}
	function els() { return doc.pages[mode].elements; }
	function byId(id) { return els().find(e => e.id === id); }
	function view() {
		if (!views[mode]) { views[mode] = { x: 0, y: 0, zoom: 1 }; }
		return views[mode];
	}
	//#endregion

	//#region Document sync
	function serialize() {
		doc.mode = mode;
		return JSON.stringify(doc, null, '\t') + '\n';
	}
	/** One finished gesture = one edit of the file (so Undo undoes exactly that). */
	function commit() {
		const text = serialize();
		if (text === lastText) { return; }
		lastText = text;
		vscode.postMessage({ type: 'edit', text });
		updateCode();
	}
	function loadText(text, first) {
		if (!first && text === lastText) { return; }
		lastText = text;
		let parsed = null;
		const trimmed = (text || '').trim();
		if (trimmed) {
			try { parsed = JSON.parse(trimmed); } catch (e) {
				showBanner('This .flow file is not valid JSON, so it can\u2019t be drawn. Fix it in a text editor (Reopen With \u2192 Text Editor).');
				doc = normalize(null);
				render();
				return;
			}
		}
		hideBanner();
		doc = normalize(parsed);
		if (first) {
			const savedMode = (vscode.getState() || {}).mode;
			mode = savedMode || doc.mode || 'sketch';
			if (!trimmed) {
				// Brand-new file: write the empty skeleton so it is a valid .flow straight away
				lastText = null;
				commit();
			}
		}
		for (const id of [...sel]) { if (!byId(id)) { sel.delete(id); } }
		if (editing && !byId(editing.id)) { stopEditing(false); }
		render();
	}
	//#endregion

	//#region Geometry
	function bounds(e) {
		if (e.type === 'line' || e.type === 'arrow') {
			const [a, b] = connectorEnds(e);
			const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
			return { x, y, w: Math.max(1, Math.abs(a.x - b.x)), h: Math.max(1, Math.abs(a.y - b.y)) };
		}
		return { x: e.x, y: e.y, w: e.w || 1, h: e.h || 1 };
	}
	function center(b) { return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }
	function isBindable(e) { return !!e && !['line', 'arrow', 'pencil', 'group'].includes(e.type); }
	function routeStyle(e) { return e.route || (mode === 'sketch' ? 'straight' : 'elbow'); }
	/** Where a ray from the centre of box b towards point p leaves the box (plus a small gap). */
	function rayExit(b, p, gap) {
		const c = center(b);
		const dx = p.x - c.x, dy = p.y - c.y;
		if (!dx && !dy) { return c; }
		const hw = b.w / 2 + gap, hh = b.h / 2 + gap;
		const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
		return { x: c.x + dx * t, y: c.y + dy * t };
	}
	function sidePoint(b, side, gap) {
		const c = center(b);
		switch (side) {
			case 'left': return { x: b.x - gap, y: c.y };
			case 'right': return { x: b.x + b.w + gap, y: c.y };
			case 'top': return { x: c.x, y: b.y - gap };
			default: return { x: c.x, y: b.y + b.h + gap };
		}
	}
	function elbowSides(a, b) {
		const ca = center(a), cb = center(b);
		const dx = cb.x - ca.x, dy = cb.y - ca.y;
		if (Math.abs(dx) >= Math.abs(dy)) { return dx >= 0 ? ['right', 'left'] : ['left', 'right']; }
		return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
	}
	/** Endpoints of a line/arrow: bound ends follow their element. */
	function connectorEnds(e) {
		const pts = e.points || [[0, 0], [0, 0]];
		let a = { x: pts[0][0], y: pts[0][1] };
		let b = { x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] };
		const ea = e.from ? byId(e.from) : null, eb = e.to ? byId(e.to) : null;
		const ba = ea ? bounds(ea) : null, bb = eb ? bounds(eb) : null;
		if (routeStyle(e) === 'elbow' && ba && bb) {
			const [sa, sb] = elbowSides(ba, bb);
			return [sidePoint(ba, sa, 2), sidePoint(bb, sb, 4), sa, sb];
		}
		if (ba) { a = rayExit(ba, bb ? center(bb) : b, 4); }
		if (bb) { b = rayExit(bb, ba ? center(ba) : a, 6); }
		return [a, b];
	}
	// Elbow connectors that would run on the same vertical (or horizontal) line get their own lane,
	// so a bus of unrelated connections doesn't read as one wire. Connections from one source stay together.
	let laneOffset = new Map();
	function computeLanes() {
		laneOffset = new Map();
		const buckets = new Map();
		for (const e of els()) {
			if ((e.type !== 'arrow' && e.type !== 'line') || routeStyle(e) !== 'elbow' || !e.from || !e.to) { continue; }
			const ends = connectorEnds(e);
			if (ends.length < 3) { continue; }
			const [a, b, sa] = ends;
			const horiz = sa === 'left' || sa === 'right';
			const key = (horiz ? 'h' : 'v') + Math.round((horiz ? (a.x + b.x) : (a.y + b.y)) / 2 / 16);
			if (!buckets.has(key)) { buckets.set(key, []); }
			buckets.get(key).push({ id: e.id, group: e.from, order: horiz ? a.y + b.y : a.x + b.x });
		}
		for (const list of buckets.values()) {
			if (list.length < 2) { continue; }
			list.sort((p, q) => p.order - q.order);
			const lanes = [...new Set(list.map(x => x.group))];
			if (lanes.length < 2) { continue; }
			for (const x of list) { laneOffset.set(x.id, (lanes.indexOf(x.group) - (lanes.length - 1) / 2) * 9); }
		}
	}
	function connectorPath(e) {
		const ends = connectorEnds(e);
		const a = ends[0], b = ends[1];
		if (routeStyle(e) === 'elbow') {
			const sa = ends[2] || (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'right' : 'bottom');
			const lane = laneOffset.get(e.id) || 0;
			if (sa === 'left' || sa === 'right') {
				const mx = Math.round((a.x + b.x) / 2 + lane);
				return { d: `M${a.x} ${a.y} H${mx} V${b.y} H${b.x}`, mid: { x: mx, y: (a.y + b.y) / 2 }, a, b };
			}
			const my = Math.round((a.y + b.y) / 2 + lane);
			return { d: `M${a.x} ${a.y} V${my} H${b.x} V${b.y}`, mid: { x: (a.x + b.x) / 2, y: my }, a, b };
		}
		return { d: `M${a.x} ${a.y} L${b.x} ${b.y}`, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, a, b };
	}
	function screenToWorld(px, py) {
		const r = sceneEl.getBoundingClientRect();
		const v = view();
		return { x: (px - r.left - v.x) / v.zoom, y: (py - r.top - v.y) / v.zoom };
	}
	function worldToScreen(x, y) {
		const v = view();
		return { x: x * v.zoom + v.x, y: y * v.zoom + v.y };
	}
	function hitTest(p, opts) {
		const list = els();
		for (let i = list.length - 1; i >= 0; i--) {
			const e = list[i];
			if (opts && opts.bindable && !isBindable(e)) { continue; }
			if (opts && opts.except && opts.except.has(e.id)) { continue; }
			if (e.type === 'line' || e.type === 'arrow') {
				if (opts && opts.bindable) { continue; }
				const { a, b } = connectorPath(e);
				if (distToSegment(p, a, b) < 8 / view().zoom) { return e; }
				continue;
			}
			if (e.type === 'group') {
				// only the frame and the label grab a boundary, so parts inside stay clickable
				const b = bounds(e), m = 8 / view().zoom;
				const inside = p.x >= b.x - m && p.x <= b.x + b.w + m && p.y >= b.y - m && p.y <= b.y + b.h + m;
				const inner = p.x > b.x + m && p.x < b.x + b.w - m && p.y > b.y + 26 && p.y < b.y + b.h - m;
				if (inside && !inner) { return e; }
				continue;
			}
			const b = bounds(e);
			if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { return e; }
		}
		return null;
	}
	function distToSegment(p, a, b) {
		const dx = b.x - a.x, dy = b.y - a.y;
		const len = dx * dx + dy * dy;
		let t = len ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len : 0;
		t = clamp(t, 0, 1);
		return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
	}
	function contentBounds(list) {
		const items = list || els();
		if (!items.length) { return null; }
		let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
		for (const e of items) {
			const b = bounds(e);
			x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
		}
		return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
	}
	const measureCtx = document.createElement('canvas').getContext('2d');
	function measureText(text, size, family) {
		measureCtx.font = `${size}px ${family}`;
		const lines = String(text || '').split('\n');
		let w = 0;
		for (const l of lines) { w = Math.max(w, measureCtx.measureText(l || ' ').width); }
		return { w: Math.ceil(w) + 8, h: Math.ceil(lines.length * size * 1.25) + 6 };
	}
	function textFamilyFor(e) { return mode === 'sketch' || e.type === 'sticky' ? 'Caveat, "Segoe Print", cursive' : getComputedStyle(document.body).fontFamily; }
	//#endregion

	//#region Scene rendering
	let sceneEl, worldEl, layerGroups, layerEdges, layerItems, layerOverlay, markerDefs;
	const markerCache = new Set();

	function dashArray(dash, width) {
		const w = width || 2;
		if (dash === 'dashed') { return `${w * 4} ${w * 3}`; }
		if (dash === 'dotted') { return `${w} ${w * 2.5}`; }
		return null;
	}
	// Hand-drawn strokes (Excalidraw-like): every edge is drawn twice as a slightly bent curve.
	// The randomness is seeded by the element id, so a shape keeps its look between renders.
	function seedOf(id) { let x = 2166136261; for (const c of String(id)) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); } return (x >>> 0) || 1; }
	function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return (x % 100000) / 100000; }; }
	function roughSeg(r, a, b, rough) {
		const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
		const j = () => r() * 2 - 1;
		const off = Math.min(len * 0.03, 2.4) * rough;
		const bow = Math.min(len * 0.025, 3.2) * rough;
		const ax = a.x + j() * off, ay = a.y + j() * off, bx = b.x + j() * off, by = b.y + j() * off;
		const nx = -(by - ay) / len, ny = (bx - ax) / len;
		const m1 = 0.25 + r() * 0.15, m2 = 0.6 + r() * 0.15;
		const k1 = j() * bow, k2 = j() * bow;
		const f = v => Math.round(v * 10) / 10;
		return `M${f(ax)} ${f(ay)} C${f(ax + (bx - ax) * m1 + nx * k1)} ${f(ay + (by - ay) * m1 + ny * k1)} ${f(ax + (bx - ax) * m2 + nx * k2)} ${f(ay + (by - ay) * m2 + ny * k2)} ${f(bx)} ${f(by)}`;
	}
	function roughPolyline(points, closed, rough, seed) {
		const r = rng(seed);
		let d = '';
		const n = closed ? points.length : points.length - 1;
		for (let pass = 0; pass < 2; pass++) {
			for (let i = 0; i < n; i++) { d += ' ' + roughSeg(r, points[i], points[(i + 1) % points.length], rough * (pass ? 1.15 : 0.85)); }
		}
		return d.trim();
	}
	function roughEllipse(cx, cy, rx, ry, rough, seed) {
		const r = rng(seed);
		const f = v => Math.round(v * 10) / 10;
		let d = '';
		for (let pass = 0; pass < 2; pass++) {
			const n = 18, start = r() * Math.PI * 2, over = 0.25 + r() * 0.2;
			const pts = [];
			for (let i = 0; i <= n + 2; i++) {
				const t = start + (i / n) * (Math.PI * 2 + over);
				const k = 1 + (r() * 2 - 1) * 0.025 * rough;
				pts.push({ x: cx + Math.cos(t) * rx * k, y: cy + Math.sin(t) * ry * k });
			}
			d += ` M${f(pts[0].x)} ${f(pts[0].y)}`;
			for (let i = 1; i < pts.length - 1; i++) {
				const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
				d += ` Q${f(p1.x)} ${f(p1.y)} ${f((p1.x + p2.x) / 2)} ${f((p1.y + p2.y) / 2)}`;
				void p0;
			}
		}
		return d.trim();
	}
	function shapeOutline(e) {
		if (e.type === 'diamond') { return [{ x: e.x + e.w / 2, y: e.y }, { x: e.x + e.w, y: e.y + e.h / 2 }, { x: e.x + e.w / 2, y: e.y + e.h }, { x: e.x, y: e.y + e.h / 2 }]; }
		return [{ x: e.x, y: e.y }, { x: e.x + e.w, y: e.y }, { x: e.x + e.w, y: e.y + e.h }, { x: e.x, y: e.y + e.h }];
	}
	function arrowMarker(color) {
		const id = 'ah-' + String(color).replace(/[^a-z0-9]/gi, '');
		if (!markerCache.has(id)) {
			markerCache.add(id);
			markerDefs.appendChild(s('marker', { id, orient: 'auto', markerWidth: '10', markerHeight: '10', refX: '7', refY: '5', markerUnits: 'userSpaceOnUse', overflow: 'visible' },
				s('path', { d: 'M1 1 L8 5 L1 9', fill: 'none', stroke: color, 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })));
		}
		return `url(#${id})`;
	}
	function textBlock(text, x, y, opts) {
		const size = opts.size || 16;
		const lines = String(text || '').split('\n');
		const lh = size * 1.25;
		const t = s('text', {
			x, y, 'font-size': size, fill: opts.fill || '#E6E8EE', 'font-family': opts.family, 'font-weight': opts.weight || null,
			'text-anchor': opts.anchor || 'start', 'dominant-baseline': 'middle'
		});
		const startY = opts.valign === 'top' ? y + lh / 2 : y - ((lines.length - 1) * lh) / 2;
		lines.forEach((l, i) => t.appendChild(s('tspan', { x, y: startY + i * lh, text: l || ' ' })));
		return t;
	}
	function nestedIcon(path, x, y, size, color) {
		return s('svg', { x, y, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: color, 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', overflow: 'visible' }, s('path', { d: path }));
	}
	function serviceState(e) {
		if (e.type === 'loadgen') {
			if (!runtime.running) { return { label: 'stopped', color: '#7C8493', dot: '#4A505C' }; }
			const l = runtime.load && runtime.load[e.id];
			if (!l) { return { label: 'idle', color: '#9AA1AE', dot: '#9AA1AE' }; }
			if (l.target === null) { return { label: 'no target', color: '#FFB454', dot: '#FFB454' }; }
			return l.errRate > 0.05 ? { label: Math.round(l.errRate * 100) + '% errors', color: '#FF9A9A', dot: '#FF7B7B' } : { label: 'sending', color: '#9FD8A4', dot: '#9FD8A4' };
		}
		const st = runtime.services[slug(e.name)];
		if (!runtime.running && !runtime.busy) { return { label: st && st.state === 'running' ? 'running' : 'stopped', color: '#7C8493', dot: '#4A505C', up: false }; }
		if (!st) { return { label: runtime.busy ? 'starting' : 'not created', color: '#FFB454', dot: '#FFB454', up: false }; }
		if (st.state === 'running') {
			const part = st.total > 1 ? ` ${st.running}/${st.total}` : '';
			return { label: (st.health === 'unhealthy' ? 'unhealthy' : 'running') + part, color: st.health === 'unhealthy' ? '#FFB454' : '#9FD8A4', dot: '#9FD8A4', up: true };
		}
		if (st.state === 'exited' || st.state === 'dead') { return { label: `exited (${st.exitCode ?? '?'})`, color: '#FF9A9A', dot: '#FF7B7B', up: false, down: true }; }
		return { label: st.state, color: '#FFB454', dot: '#FFB454', up: false };
	}

	function renderElement(e, opts) {
		const g = s('g', { 'data-id': e.id, class: 'el' + (opts && opts.preview ? ' preview' : '') });
		const family = textFamilyFor(e);
		switch (e.type) {
			case 'rect': case 'diamond': case 'ellipse': {
				const stroke = e.stroke || '#E6E8EE', width = e.width || 2, dash = dashArray(e.dash, e.width);
				const fill = e.fill || 'transparent';
				if (e.rough) {
					const rough = clamp(e.rough, 0, 2);
					if (e.type === 'ellipse') {
						g.appendChild(s('ellipse', { cx: e.x + e.w / 2, cy: e.y + e.h / 2, rx: e.w / 2, ry: e.h / 2, fill, stroke: 'none' }));
						g.appendChild(s('path', { d: roughEllipse(e.x + e.w / 2, e.y + e.h / 2, e.w / 2, e.h / 2, rough, seedOf(e.id)), fill: 'none', stroke, 'stroke-width': width, 'stroke-dasharray': dash, 'stroke-linecap': 'round' }));
					} else {
						const pts = shapeOutline(e);
						g.appendChild(s('path', { d: 'M' + pts.map(p => `${p.x} ${p.y}`).join(' L') + ' Z', fill, stroke: 'none' }));
						g.appendChild(s('path', { d: roughPolyline(pts, true, rough, seedOf(e.id)), fill: 'none', stroke, 'stroke-width': width, 'stroke-dasharray': dash, 'stroke-linecap': 'round' }));
					}
				} else {
					const common = { fill, stroke, 'stroke-width': width, 'stroke-dasharray': dash, 'stroke-linejoin': 'round' };
					let shape;
					if (e.type === 'rect') { shape = s('rect', Object.assign({ x: e.x, y: e.y, width: e.w, height: e.h, rx: Math.min(10, e.w / 6, e.h / 6) }, common)); }
					else if (e.type === 'ellipse') { shape = s('ellipse', Object.assign({ cx: e.x + e.w / 2, cy: e.y + e.h / 2, rx: e.w / 2, ry: e.h / 2 }, common)); }
					else { shape = s('path', Object.assign({ d: `M${e.x + e.w / 2} ${e.y} L${e.x + e.w} ${e.y + e.h / 2} L${e.x + e.w / 2} ${e.y + e.h} L${e.x} ${e.y + e.h / 2} Z` }, common)); }
					g.appendChild(shape);
				}
				if (e.text && !(editing && editing.id === e.id)) {
					g.appendChild(textBlock(e.text, e.x + e.w / 2, e.y + e.h / 2, { size: FONT_SIZES[e.font || 'M'] || 20, family, anchor: 'middle', fill: e.stroke && e.stroke !== '#E6E8EE' ? e.stroke : '#E6E8EE' }));
				}
				break;
			}
			case 'text': {
				if (!(editing && editing.id === e.id)) {
					g.appendChild(s('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill: 'transparent' }));
					g.appendChild(textBlock(e.text, e.x + 4, e.y + 3, { size: FONT_SIZES[e.font || 'M'] || 20, family, fill: e.stroke || '#E6E8EE', valign: 'top' }));
				}
				break;
			}
			case 'sticky': {
				const c = { x: e.x + e.w / 2, y: e.y + e.h / 2 };
				const inner = s('g', { transform: `rotate(1.5 ${c.x} ${c.y})` },
					s('rect', { x: e.x + 3, y: e.y + 5, width: e.w, height: e.h, rx: 3, fill: 'rgba(0,0,0,0.35)' }),
					s('rect', { x: e.x, y: e.y, width: e.w, height: e.h, rx: 3, fill: e.fill || '#F7DD7A' }));
				if (!(editing && editing.id === e.id)) {
					inner.appendChild(textBlock(e.text || '', e.x + 14, e.y + 12, { size: mode === 'sketch' ? 22 : 15, family, fill: '#2B2412', valign: 'top' }));
				}
				g.appendChild(inner);
				break;
			}
			case 'pencil': {
				const pts = e.points || [];
				if (pts.length) {
					let d = `M${e.x + pts[0][0]} ${e.y + pts[0][1]}`;
					for (let i = 1; i < pts.length - 1; i++) {
						const p = pts[i], q = pts[i + 1];
						d += ` Q${e.x + p[0]} ${e.y + p[1]} ${e.x + (p[0] + q[0]) / 2} ${e.y + (p[1] + q[1]) / 2}`;
					}
					const last = pts[pts.length - 1];
					d += ` L${e.x + last[0]} ${e.y + last[1]}`;
					g.appendChild(s('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': 14, class: 'hit' }));
					g.appendChild(s('path', { d, fill: 'none', stroke: e.stroke || '#E6E8EE', 'stroke-width': e.width || 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
				}
				break;
			}
			case 'line': case 'arrow': {
				const p = connectorPath(e);
				let color = e.stroke || (mode === 'sketch' ? '#C9CDD6' : '#6B7280');
				let dash = dashArray(e.dash, e.width || 1.8);
				let packets = false;
				if (mode === 'ops') {
					const a = byId(e.from), b = byId(e.to);
					const sa = a ? serviceState(a) : null, sb = b ? serviceState(b) : null;
					if ((sa && sa.down) || (sb && sb.down) || (a && a.type === 'loadgen' && runtime.load && runtime.load[a.id] && runtime.load[a.id].errRate > 0.5)) {
						color = '#FF7B7B'; dash = '5 5';
					} else if (runtime.running && a && b) {
						packets = a.type === 'loadgen' ? !!(runtime.load && runtime.load[a.id] && runtime.load[a.id].rps > 0) : (sa && sa.up && sb && sb.up);
						if (packets) { color = '#7C8596'; }
					}
				}
				g.appendChild(s('path', { d: p.d, fill: 'none', stroke: 'transparent', 'stroke-width': 14, class: 'hit' }));
				const sw = e.width || (mode === 'sketch' ? 2 : 1.6);
				if (mode === 'sketch' && e.rough) {
					const r = clamp(e.rough, 0, 2);
					let d = roughPolyline([p.a, p.b], false, r, seedOf(e.id));
					if (e.type === 'arrow') {
						const ang = Math.atan2(p.b.y - p.a.y, p.b.x - p.a.x), len = 14 + sw * 2;
						for (const k of [-0.5, 0.5]) {
							const q = { x: p.b.x - Math.cos(ang + k) * len, y: p.b.y - Math.sin(ang + k) * len };
							d += ' ' + roughSeg(rng(seedOf(e.id) + (k > 0 ? 7 : 3)), q, p.b, r * 0.5);
						}
					}
					g.appendChild(s('path', { d, fill: 'none', stroke: color, 'stroke-width': sw, 'stroke-dasharray': dash, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
				} else {
					g.appendChild(s('path', {
						d: p.d, fill: 'none', stroke: color, 'stroke-width': sw, 'stroke-dasharray': dash,
						'stroke-linecap': 'round', 'stroke-linejoin': 'round',
						'marker-end': e.type === 'arrow' ? arrowMarker(color) : null
					}));
				}
				if (packets) {
					for (let i = 0; i < 2; i++) {
						const dot = s('circle', { r: 3.2, fill: ACCENT });
						dot.appendChild(s('animateMotion', { dur: '1.6s', begin: `${i * 0.8}s`, repeatCount: 'indefinite', path: p.d }));
						g.appendChild(dot);
					}
				}
				if (e.label) {
					const size = mode === 'sketch' ? 18 : 11;
					const m = measureText(e.label, size, family);
					g.appendChild(s('rect', { x: p.mid.x - m.w / 2, y: p.mid.y - m.h / 2, width: m.w, height: m.h, rx: 4, fill: mode === 'sketch' ? '#17191E' : '#121418' }));
					g.appendChild(textBlock(e.label, p.mid.x, p.mid.y, { size, family, anchor: 'middle', fill: '#9AA1AE' }));
				}
				break;
			}
			case 'group': {
				const color = e.color || '#C9CDD6';
				g.appendChild(s('rect', { x: e.x, y: e.y, width: e.w, height: e.h, rx: 14, fill: hexA(color, 0.035), stroke: hexA(color, 0.4), 'stroke-width': 1.5, 'stroke-dasharray': '6 5' }));
				g.appendChild(s('text', { x: e.x + 14, y: e.y + 18, 'font-size': 12, fill: '#9AA1AE', 'letter-spacing': '0.04em', 'font-family': family, text: e.name || 'Boundary' }));
				break;
			}
			case 'node': {
				const k = KINDS[e.kind] || KINDS.service;
				const color = e.color || k.color;
				g.appendChild(s('rect', { x: e.x, y: e.y, width: e.w, height: e.h, rx: 10, fill: '#1B1E25', stroke: 'rgba(255,255,255,0.13)', 'stroke-width': 1.5 }));
				const cy = e.y + e.h / 2;
				g.appendChild(s('rect', { x: e.x + 10, y: cy - 14, width: 28, height: 28, rx: 7, fill: hexA(color, 0.16) }));
				g.appendChild(nestedIcon(k.icon, e.x + 16.5, cy - 7.5, 15, color));
				g.appendChild(s('text', { x: e.x + 47, y: e.sub ? cy - 7 : cy, 'font-size': 12.5, 'font-weight': 500, fill: '#E6E8EE', 'dominant-baseline': 'middle', 'font-family': family, text: e.name || k.label }));
				if (e.sub) { g.appendChild(s('text', { x: e.x + 47, y: cy + 9, 'font-size': 10.5, fill: '#9AA1AE', 'dominant-baseline': 'middle', 'font-family': family, text: e.sub })); }
				if (e.link) { g.appendChild(nestedIcon(I.link, e.x + e.w - 18, e.y + 6, 11, '#7C8493')); }
				break;
			}
			case 'service': case 'loadgen': {
				const st = serviceState(e);
				const down = st.down && runtime.running;
				const fit = (t, px) => { const max = Math.max(4, Math.floor(px / 6.4)); return t.length > max ? t.slice(0, max - 1) + '\u2026' : t; };
				g.appendChild(s('rect', { x: e.x, y: e.y, width: e.w, height: e.h, rx: 10, fill: down ? '#211618' : '#1B1E25', stroke: down ? 'rgba(255,123,123,0.55)' : 'rgba(255,255,255,0.13)', 'stroke-width': 1.5 }));
				g.appendChild(s('circle', { cx: e.x + 14, cy: e.y + 21, r: 4, fill: st.dot }));
				const title = e.type === 'loadgen' ? (e.name || 'Load generator') : (e.name || 'service');
				const statusW = Math.min(e.w * 0.5, st.label.length * 6.4 + 4);
				g.appendChild(s('text', { x: e.x + 25, y: e.y + 21, 'font-size': 13, 'font-weight': 600, fill: '#E6E8EE', 'dominant-baseline': 'middle', 'font-family': family, text: fit(title, (e.w - 40 - statusW) * 0.85) }));
				g.appendChild(s('text', { x: e.x + e.w - 10, y: e.y + 21, 'font-size': 10.5, fill: st.color, 'text-anchor': 'end', 'dominant-baseline': 'middle', 'font-family': 'Consolas, monospace', class: 'mono', text: st.label }));
				let badge = '';
				if (e.type === 'service' && (e.replicas || 1) > 1) { badge = '\u00d7' + e.replicas; }
				if (e.type === 'loadgen') { badge = (e.rate || 0) + ' req/s'; }
				const badgeW = badge ? badge.length * 6.4 + 8 : 0;
				const sub = e.type === 'loadgen' ? `GET ${e.path || '/'}` : (e.image || (e.build ? 'build ' + e.build : 'no image'));
				g.appendChild(s('text', { x: e.x + 12, y: e.y + e.h - 18, 'font-size': 10.5, fill: '#9AA1AE', 'dominant-baseline': 'middle', 'font-family': 'Consolas, monospace', class: 'mono', text: fit(sub, e.w - 24 - badgeW) }));
				if (badge) { g.appendChild(s('text', { x: e.x + e.w - 10, y: e.y + e.h - 18, 'font-size': 10.5, fill: '#C9CDD6', 'text-anchor': 'end', 'dominant-baseline': 'middle', 'font-family': 'Consolas, monospace', class: 'mono', text: badge })); }
				break;
			}
		}
		return g;
	}

	function renderScene() {
		const v = view();
		worldEl.setAttribute('transform', `translate(${v.x} ${v.y}) scale(${v.zoom})`);
		const grid = 22 * v.zoom;
		sceneWrap.style.backgroundSize = `${grid}px ${grid}px`;
		sceneWrap.style.backgroundPosition = `${v.x}px ${v.y}px`;
		sceneWrap.classList.toggle('sketch', mode === 'sketch');
		for (const l of [layerGroups, layerEdges, layerItems, layerOverlay]) { l.textContent = ''; }
		computeLanes();
		for (const e of els()) {
			const node = renderElement(e);
			(e.type === 'group' ? layerGroups : (e.type === 'line' || e.type === 'arrow') ? layerEdges : layerItems).appendChild(node);
		}
		renderOverlay();
		renderEmpty();
	}

	function renderOverlay() {
		const z = view().zoom;
		const hs = 8 / z;
		// selection
		for (const id of sel) {
			const e = byId(id);
			if (!e) { continue; }
			if (e.type === 'line' || e.type === 'arrow') {
				const { a, b } = connectorPath(e);
				for (const [p, end] of [[a, 'start'], [b, 'end']]) {
					layerOverlay.appendChild(s('circle', { cx: p.x, cy: p.y, r: 5 / z, fill: '#14161B', stroke: ACCENT, 'stroke-width': 1.5 / z, class: 'handle', 'data-end': end, 'data-for': e.id }));
				}
				continue;
			}
			const b = bounds(e), pad = 4 / z;
			layerOverlay.appendChild(s('rect', { x: b.x - pad, y: b.y - pad, width: b.w + pad * 2, height: b.h + pad * 2, fill: 'none', stroke: ACCENT, 'stroke-width': 1.2 / z, 'stroke-dasharray': `${4 / z} ${3 / z}`, rx: 4 / z, 'pointer-events': 'none' }));
			if (sel.size === 1 && resizable(e)) {
				for (const [cx, cy, corner] of [[b.x - pad, b.y - pad, 'nw'], [b.x + b.w + pad, b.y - pad, 'ne'], [b.x - pad, b.y + b.h + pad, 'sw'], [b.x + b.w + pad, b.y + b.h + pad, 'se']]) {
					layerOverlay.appendChild(s('rect', { x: cx - hs / 2, y: cy - hs / 2, width: hs, height: hs, rx: 2 / z, fill: '#14161B', stroke: ACCENT, 'stroke-width': 1.5 / z, class: 'handle', 'data-corner': corner, 'data-for': e.id }));
				}
			}
		}
		// connection dots on the hovered part
		const hv = hoverId && byId(hoverId);
		const showDots = hv && isBindable(hv) && !drag && (mode !== 'sketch' ? (tool === 'select' || tool === 'arrow') : tool === 'arrow') && hv.type !== 'text';
		if (showDots) {
			const b = bounds(hv);
			for (const side of ['top', 'right', 'bottom', 'left']) {
				const p = sidePoint(b, side, 0);
				layerOverlay.appendChild(s('circle', { cx: p.x, cy: p.y, r: 5 / z, fill: '#14161B', stroke: ACCENT, 'stroke-width': 1.5 / z, class: 'handle dot', 'data-dot': side, 'data-for': hv.id }));
			}
		}
		// gesture previews
		if (drag && drag.kind === 'marquee' && drag.rect) {
			const r = drag.rect;
			layerOverlay.appendChild(s('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: hexA(ACCENT, 0.08), stroke: ACCENT, 'stroke-width': 1 / z, 'pointer-events': 'none' }));
		}
		if (drag && drag.preview) {
			const p = renderElement(drag.preview, { preview: true });
			p.setAttribute('pointer-events', 'none');
			layerOverlay.appendChild(p);
		}
		if (drag && drag.kind === 'connect' && drag.target) {
			const b = bounds(byId(drag.target)), pad = 5 / z;
			layerOverlay.appendChild(s('rect', { x: b.x - pad, y: b.y - pad, width: b.w + pad * 2, height: b.h + pad * 2, rx: 10, fill: 'none', stroke: ACCENT, 'stroke-width': 2 / z, 'pointer-events': 'none' }));
		}
	}
	function resizable(e) { return ['rect', 'diamond', 'ellipse', 'sticky', 'group', 'node', 'service', 'loadgen'].includes(e.type); }
	//#endregion

	//#region Creating elements
	function defaultsFor(type, x, y, w, h) {
		const st = ui.sketchStyle;
		switch (type) {
			case 'rect': case 'diamond': case 'ellipse':
				return { id: uid(), type, x, y, w: w || 160, h: h || (type === 'diamond' ? 110 : 80), stroke: st.stroke, fill: st.fill, dash: st.dash, width: st.width, rough: st.rough, font: st.font, text: '' };
			case 'text': return { id: uid(), type: 'text', x, y, w: 40, h: 28, text: '', stroke: mode === 'sketch' ? st.stroke : '#E6E8EE', font: mode === 'sketch' ? st.font : 'S' };
			case 'sticky': return { id: uid(), type: 'sticky', x, y, w: w || 180, h: h || 120, text: '' };
			case 'group': return { id: uid(), type: 'group', x, y, w: w || 360, h: h || 260, name: 'Boundary', color: '#C9CDD6' };
			case 'box': case 'node': return nodeFromKind('service', x, y);
		}
		return null;
	}
	function nodeFromKind(kind, x, y) {
		const k = KINDS[kind] || KINDS.service;
		if (kind === 'boundary') { return { id: uid(), type: 'group', x, y, w: 360, h: 260, name: k.sub, color: '#C9CDD6' }; }
		return { id: uid('n'), type: 'node', kind, x, y, w: 150, h: 56, name: k.label, sub: k.sub, color: k.color, notes: '' };
	}
	function uniqueServiceName(base) {
		const taken = new Set(els().filter(e => e.type === 'service').map(e => slug(e.name)));
		let name = slug(base), i = 2;
		while (taken.has(name)) { name = `${slug(base)}-${i++}`; }
		return name;
	}
	function serviceFromImage(img, x, y) {
		if (img.loadgen) { return { id: uid('l'), type: 'loadgen', x, y, w: 160, h: 66, name: 'Load test', rate: 20, path: '/' }; }
		const e = { id: uid('s'), type: 'service', x, y, w: 170, h: 66, name: uniqueServiceName(img.id === 'custom' ? 'app' : img.id), image: img.image || '', ports: (img.ports || []).slice(), env: Object.assign({}, img.env || {}), replicas: 1 };
		if (img.build) { e.build = img.build; e.image = ''; }
		return e;
	}
	function addElement(e, select) {
		els().push(e);
		if (select) { sel = new Set([e.id]); }
		return e;
	}
	function deleteSelection() {
		if (!sel.size) { return; }
		const gone = new Set(sel);
		const page = doc.pages[mode];
		page.elements = page.elements.filter(e => !gone.has(e.id) && !((e.type === 'line' || e.type === 'arrow') && (gone.has(e.from) || gone.has(e.to))));
		sel.clear();
		commit();
		render();
	}
	function duplicateSelection() {
		if (!sel.size) { return; }
		const items = els().filter(e => sel.has(e.id));
		pasteItems(clone(items), 20);
	}
	function pasteItems(items, offset) {
		const map = {};
		for (const e of items) { map[e.id] = uid(e.id[0]); }
		const added = [];
		for (const e of items) {
			const n = Object.assign({}, e, { id: map[e.id] });
			if (n.type === 'line' || n.type === 'arrow') {
				n.from = n.from && map[n.from] ? map[n.from] : undefined;
				n.to = n.to && map[n.to] ? map[n.to] : undefined;
				n.points = (n.points || []).map(p => [p[0] + offset, p[1] + offset]);
			} else {
				n.x += offset; n.y += offset;
			}
			if (n.type === 'service') { n.name = uniqueServiceName(n.name); }
			added.push(n);
		}
		for (const n of added) { els().push(n); }
		sel = new Set(added.map(n => n.id));
		commit();
		render();
	}
	//#endregion

	//#region Pointer gestures
	function eventPoint(ev) { return screenToWorld(ev.clientX, ev.clientY); }
	function setTool(t) {
		tool = t;
		if (t !== 'select') { sel.clear(); }
		hoverId = null;
		render();
	}
	let lastDown = { t: 0, x: 0, y: 0 };
	function onPointerDown(ev) {
		if (ev.button === 2) { return; }
		closeMenus();
		// The scene is rebuilt under the pointer, so the browser's dblclick is unreliable: detect it here.
		const now = performance.now();
		const isDouble = ev.button === 0 && now - lastDown.t < 420 && Math.hypot(ev.clientX - lastDown.x, ev.clientY - lastDown.y) < 6;
		lastDown = { t: isDouble ? 0 : now, x: ev.clientX, y: ev.clientY };
		if (isDouble && (tool === 'select' || tool === 'text')) { ev.preventDefault(); onDblClick(ev); return; }
		if (editing) { stopEditing(true); }
		const p = eventPoint(ev);
		sceneWrap.setPointerCapture(ev.pointerId);
		const v = view();
		if (ev.button === 1 || spaceDown || tool === 'hand') {
			drag = { kind: 'pan', sx: ev.clientX, sy: ev.clientY, vx: v.x, vy: v.y };
			sceneWrap.classList.add('panning');
			return;
		}
		const handle = ev.target.closest && ev.target.closest('.handle');
		if (handle) {
			const id = handle.getAttribute('data-for');
			const e = byId(id);
			if (handle.hasAttribute('data-corner')) { drag = { kind: 'resize', id, corner: handle.getAttribute('data-corner'), start: p, orig: clone(e) }; return; }
			if (handle.hasAttribute('data-end')) { drag = { kind: 'endpoint', id, end: handle.getAttribute('data-end'), start: p }; return; }
			if (handle.hasAttribute('data-dot')) { beginConnect(e, p); return; }
		}
		switch (tool) {
			case 'select': {
				const hit = hitTest(p);
				if (hit) {
					if (ev.shiftKey) { sel.has(hit.id) ? sel.delete(hit.id) : sel.add(hit.id); }
					else if (!sel.has(hit.id)) { sel = new Set([hit.id]); }
					const orig = {};
					for (const id of sel) { const e = byId(id); if (e) { orig[id] = clone(e); } }
					// moving a boundary also moves the parts inside it
					if (hit.type === 'group' && !ev.altKey) {
						const gb = bounds(hit);
						for (const e of els()) {
							if (e.id === hit.id || orig[e.id] || e.type === 'line' || e.type === 'arrow') { continue; }
							const c = center(bounds(e));
							if (c.x > gb.x && c.x < gb.x + gb.w && c.y > gb.y && c.y < gb.y + gb.h) { orig[e.id] = clone(e); }
						}
					}
					drag = { kind: 'move', start: p, orig, hit: hit.id, moved: false, shift: ev.shiftKey };
				} else {
					if (!ev.shiftKey) { sel.clear(); }
					drag = { kind: 'marquee', start: p, rect: null, base: new Set(sel) };
				}
				render();
				return;
			}
			case 'arrow': {
				const hit = hitTest(p, { bindable: true });
				if (mode === 'ops' && !hit) { return; }
				beginConnect(hit, p);
				return;
			}
			case 'line': drag = { kind: 'line', start: p }; return;
			case 'pencil': drag = { kind: 'pencil', points: [[p.x, p.y]] }; return;
			case 'eraser': drag = { kind: 'erase', changed: false }; eraseAt(p); return;
			case 'text': {
				const e = addElement(defaultsFor('text', p.x, p.y - 14), true);
				render();
				startEditing(e, true);
				return;
			}
			default: drag = { kind: 'create', type: tool, start: p }; return;
		}
	}
	function beginConnect(fromEl, p) {
		drag = { kind: 'connect', from: fromEl ? fromEl.id : null, start: p, target: null };
		updateConnectPreview(p);
		render();
	}
	function updateConnectPreview(p) {
		const target = hitTest(p, { bindable: true, except: new Set(drag.from ? [drag.from] : []) });
		drag.target = target && !(mode === 'ops' && target.type === 'loadgen') ? target.id : null;
		drag.preview = { id: '__preview', type: 'arrow', from: drag.from || undefined, to: drag.target || undefined, points: [[drag.start.x, drag.start.y], [p.x, p.y]], stroke: ACCENT };
	}
	function eraseAt(p) {
		const hit = hitTest(p);
		if (hit) {
			sel.delete(hit.id);
			doc.pages[mode].elements = els().filter(e => e.id !== hit.id && !((e.type === 'line' || e.type === 'arrow') && (e.from === hit.id || e.to === hit.id)));
			drag.changed = true;
			render();
		}
	}
	function normRect(a, b) { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }; }
	function onPointerMove(ev) {
		const p = eventPoint(ev);
		if (!drag) {
			const hit = hitTest(p);
			const id = hit ? hit.id : null;
			const onHandle = ev.target.closest && ev.target.closest('.handle');
			if (id !== hoverId && !onHandle) { hoverId = id; renderScene(); }
			sceneWrap.style.cursor = spaceDown || tool === 'hand' ? 'grab' : tool === 'select' ? (hit ? 'move' : 'default') : tool === 'eraser' ? 'cell' : 'crosshair';
			return;
		}
		const v = view();
		switch (drag.kind) {
			case 'pan':
				v.x = drag.vx + (ev.clientX - drag.sx);
				v.y = drag.vy + (ev.clientY - drag.sy);
				renderScene(); positionEditor();
				return;
			case 'move': {
				let dx = p.x - drag.start.x, dy = p.y - drag.start.y;
				if (!drag.moved && Math.hypot(dx, dy) * v.zoom < 3) { return; }
				drag.moved = true;
				if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) { dy = 0; } else { dx = 0; } }
				for (const id in drag.orig) {
					const e = byId(id), o = drag.orig[id];
					if (!e) { continue; }
					if (e.type === 'line' || e.type === 'arrow') {
						e.points = o.points.map(q => [Math.round(q[0] + dx), Math.round(q[1] + dy)]);
					} else { e.x = Math.round(o.x + dx); e.y = Math.round(o.y + dy); }
				}
				renderScene();
				return;
			}
			case 'resize': {
				const e = byId(drag.id), o = drag.orig;
				const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
				let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
				if (drag.corner.includes('w')) { x1 += dx; } else { x2 += dx; }
				if (drag.corner.includes('n')) { y1 += dy; } else { y2 += dy; }
				const minW = e.type === 'service' || e.type === 'loadgen' ? 140 : e.type === 'node' ? 110 : 24;
				const minH = e.type === 'service' || e.type === 'loadgen' ? 60 : e.type === 'node' ? 44 : 20;
				if (x2 - x1 < minW) { if (drag.corner.includes('w')) { x1 = x2 - minW; } else { x2 = x1 + minW; } }
				if (y2 - y1 < minH) { if (drag.corner.includes('n')) { y1 = y2 - minH; } else { y2 = y1 + minH; } }
				Object.assign(e, { x: Math.round(x1), y: Math.round(y1), w: Math.round(x2 - x1), h: Math.round(y2 - y1) });
				renderScene();
				return;
			}
			case 'endpoint': {
				const e = byId(drag.id);
				const idx = drag.end === 'start' ? 0 : e.points.length - 1;
				const other = drag.end === 'start' ? e.to : e.from;
				const t = hitTest(p, { bindable: true, except: new Set(other ? [other] : []) });
				drag.target = t ? t.id : null;
				if (drag.end === 'start') { e.from = undefined; } else { e.to = undefined; }
				const ends = connectorEnds(Object.assign({}, e));
				e.points = [[ends[0].x, ends[0].y], [ends[1].x, ends[1].y]];
				e.points[idx] = [p.x, p.y];
				renderScene();
				return;
			}
			case 'connect': updateConnectPreview(p); renderScene(); return;
			case 'line':
				drag.preview = { id: '__preview', type: 'line', points: [[drag.start.x, drag.start.y], [p.x, p.y]], stroke: ui.sketchStyle.stroke, width: ui.sketchStyle.width, dash: ui.sketchStyle.dash };
				renderScene(); return;
			case 'create': {
				const r = normRect(drag.start, p);
				if (ev.shiftKey) { r.w = r.h = Math.max(r.w, r.h); }
				const proto = defaultsFor(drag.type, r.x, r.y, Math.max(r.w, 8), Math.max(r.h, 8));
				if (proto) { drag.preview = Object.assign(proto, { id: '__preview' }); drag.rect = r; }
				renderScene(); return;
			}
			case 'pencil': {
				const last = drag.points[drag.points.length - 1];
				if (Math.hypot(p.x - last[0], p.y - last[1]) * v.zoom > 2) { drag.points.push([p.x, p.y]); }
				drag.preview = { id: '__preview', type: 'pencil', x: 0, y: 0, points: drag.points, stroke: ui.sketchStyle.stroke, width: ui.sketchStyle.width };
				renderScene(); return;
			}
			case 'erase': eraseAt(p); return;
			case 'marquee': {
				drag.rect = normRect(drag.start, p);
				sel = new Set(drag.base);
				for (const e of els()) {
					const b = bounds(e), r = drag.rect;
					if (b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h) { sel.add(e.id); }
				}
				renderScene(); return;
			}
		}
	}
	function onPointerUp(ev) {
		if (!drag) { return; }
		const d = drag;
		drag = null;
		sceneWrap.classList.remove('panning');
		try { sceneWrap.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
		const p = eventPoint(ev);
		switch (d.kind) {
			case 'pan': persistUiState(); break;
			case 'move':
				if (d.moved) { commit(); }
				else if (!d.shift && sel.size > 1) { sel = new Set([d.hit]); }
				break;
			case 'resize': commit(); break;
			case 'endpoint': {
				const e = byId(d.id);
				if (d.target) { if (d.end === 'start') { e.from = d.target; } else { e.to = d.target; } }
				commit();
				break;
			}
			case 'connect': {
				const moved = Math.hypot(p.x - d.start.x, p.y - d.start.y) * view().zoom > 6;
				if (!d.target && (!moved || mode === 'ops')) { break; }
				if (!d.from && !d.target && !moved) { break; }
				const e = { id: uid('c'), type: 'arrow', points: [[d.start.x, d.start.y], [p.x, p.y]] };
				if (d.from) { e.from = d.from; }
				if (d.target) { e.to = d.target; }
				if (mode === 'sketch') { Object.assign(e, { stroke: ui.sketchStyle.stroke !== '#E6E8EE' ? ui.sketchStyle.stroke : undefined, width: ui.sketchStyle.width, dash: ui.sketchStyle.dash, rough: ui.sketchStyle.rough }); }
				if (mode === 'ops' && e.from && e.to && els().some(x => x.type === 'arrow' && x.from === e.from && x.to === e.to)) { break; }
				addElement(e, true);
				commit();
				if (tool !== 'select' && mode !== 'sketch') { tool = 'select'; }
				break;
			}
			case 'line': {
				if (Math.hypot(p.x - d.start.x, p.y - d.start.y) * view().zoom < 4) { break; }
				addElement({ id: uid(), type: 'line', points: [[d.start.x, d.start.y], [p.x, p.y]], stroke: ui.sketchStyle.stroke, width: ui.sketchStyle.width, dash: ui.sketchStyle.dash, rough: ui.sketchStyle.rough }, true);
				commit();
				break;
			}
			case 'create': {
				const r = d.rect && d.rect.w * view().zoom > 6 && d.rect.h * view().zoom > 6 ? d.rect : null;
				let e;
				if (r) { e = defaultsFor(d.type, Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)); }
				else {
					e = defaultsFor(d.type, 0, 0);
					e.x = Math.round(d.start.x - e.w / 2); e.y = Math.round(d.start.y - e.h / 2);
				}
				addElement(e, true);
				commit();
				tool = 'select';
				if (e.type === 'sticky') { render(); startEditing(e, true); return; }
				break;
			}
			case 'pencil': {
				if (d.points.length < 2) { break; }
				const xs = d.points.map(q => q[0]), ys = d.points.map(q => q[1]);
				const x = Math.min(...xs), y = Math.min(...ys);
				addElement({ id: uid(), type: 'pencil', x: Math.round(x), y: Math.round(y), w: Math.max(1, Math.round(Math.max(...xs) - x)), h: Math.max(1, Math.round(Math.max(...ys) - y)), points: d.points.map(q => [Math.round((q[0] - x) * 10) / 10, Math.round((q[1] - y) * 10) / 10]), stroke: ui.sketchStyle.stroke, width: ui.sketchStyle.width }, false);
				commit();
				break;
			}
			case 'erase': if (d.changed) { commit(); } break;
			case 'marquee': break;
		}
		render();
	}
	function onWheel(ev) {
		ev.preventDefault();
		const v = view();
		if (ev.ctrlKey || ev.metaKey) {
			const r = sceneEl.getBoundingClientRect();
			const mx = ev.clientX - r.left, my = ev.clientY - r.top;
			const z = clamp(v.zoom * Math.exp(-ev.deltaY * 0.0015), 0.1, 4);
			v.x = mx - (mx - v.x) * (z / v.zoom);
			v.y = my - (my - v.y) * (z / v.zoom);
			v.zoom = z;
		} else {
			v.x -= ev.shiftKey && !ev.deltaX ? ev.deltaY : ev.deltaX;
			v.y -= ev.shiftKey && !ev.deltaX ? 0 : ev.deltaY;
		}
		renderScene(); renderZoom(); positionEditor();
		clearTimeout(onWheel.t); onWheel.t = setTimeout(persistUiState, 400);
	}
	function zoomBy(f, cx, cy) {
		const v = view();
		const r = sceneEl.getBoundingClientRect();
		const mx = cx ?? r.width / 2, my = cy ?? r.height / 2;
		const z = clamp(v.zoom * f, 0.1, 4);
		v.x = mx - (mx - v.x) * (z / v.zoom); v.y = my - (my - v.y) * (z / v.zoom); v.zoom = z;
		render(); persistUiState();
	}
	function zoomToFit() {
		const b = contentBounds();
		const r = sceneEl.getBoundingClientRect();
		const v = view();
		if (!b) { v.x = r.width / 2; v.y = r.height / 2; v.zoom = 1; render(); persistUiState(); return; }
		const padL = 80, padR = (ui.code || selPanelVisible()) ? 330 : 60, padT = 70, padB = 70;
		const z = clamp(Math.min((r.width - padL - padR) / b.w, (r.height - padT - padB) / b.h), 0.2, 1.5);
		v.zoom = z;
		v.x = padL + ((r.width - padL - padR) - b.w * z) / 2 - b.x * z;
		v.y = padT + ((r.height - padT - padB) - b.h * z) / 2 - b.y * z;
		render(); persistUiState();
	}
	function onDblClick(ev) {
		const p = eventPoint(ev);
		const hit = hitTest(p);
		if (hit && hit.type !== 'pencil') { sel = new Set([hit.id]); render(); startEditing(hit, false, p); return; }
		if (!hit && tool === 'select') {
			const e = addElement(defaultsFor('text', p.x, p.y - 14), true);
			render();
			startEditing(e, true);
		}
	}
	//#endregion

	//#region Inline text editing
	function editField(e) {
		if (['node', 'group', 'service', 'loadgen'].includes(e.type)) { return 'name'; }
		if (e.type === 'line' || e.type === 'arrow') { return 'label'; }
		return 'text';
	}
	function startEditing(e, isNew) {
		const field = editField(e);
		const multi = field === 'text';
		const el = multi ? h('textarea', { class: 'inline-edit', spellcheck: 'false' }) : h('input', { class: 'inline-edit single', type: 'text', spellcheck: 'false' });
		el.value = e[field] || '';
		editing = { id: e.id, field, el, isNew };
		appEl.appendChild(el);
		positionEditor();
		render();
		el.addEventListener('input', () => {
			if (e.type === 'text') {
				const m = measureText(el.value, FONT_SIZES[e.font || 'M'] || 20, textFamilyFor(e));
				e.w = Math.max(40, m.w); e.h = Math.max(28, m.h);
			}
			positionEditor();
		});
		el.addEventListener('keydown', ev => {
			ev.stopPropagation();
			if (ev.key === 'Escape' || (ev.key === 'Enter' && (!multi || ev.ctrlKey || ev.metaKey))) { ev.preventDefault(); stopEditing(true); }
		});
		el.addEventListener('blur', () => { if (editing && editing.el === el) { stopEditing(true); } });
		setTimeout(() => { el.focus(); if (!isNew) { el.select(); } }, 0);
	}
	function positionEditor() {
		if (!editing) { return; }
		const e = byId(editing.id);
		if (!e) { return; }
		const z = view().zoom;
		const el = editing.el;
		const family = textFamilyFor(e);
		let box, size, align = 'left', color = '#E6E8EE';
		if (editing.field === 'label') {
			const p = connectorPath(e);
			size = mode === 'sketch' ? 18 : 12;
			box = { x: p.mid.x - 80, y: p.mid.y - size, w: 160, h: size * 2 };
			align = 'center';
		} else if (editing.field === 'name') {
			const b = bounds(e);
			size = e.type === 'group' ? 12 : 13;
			const x = e.type === 'node' ? b.x + 44 : e.type === 'group' ? b.x + 10 : b.x + 22;
			box = { x, y: e.type === 'group' ? b.y + 6 : b.y + 8, w: b.w - (x - b.x) - 8, h: 24 };
		} else {
			size = e.type === 'sticky' ? (mode === 'sketch' ? 22 : 15) : FONT_SIZES[e.font || 'M'] || 20;
			const b = bounds(e);
			if (e.type === 'text') { box = { x: b.x, y: b.y, w: Math.max(b.w, 160), h: Math.max(b.h, size * 1.6) }; color = e.stroke || '#E6E8EE'; }
			else if (e.type === 'sticky') { box = { x: b.x + 10, y: b.y + 8, w: b.w - 20, h: b.h - 16 }; color = '#2B2412'; }
			else { box = { x: b.x + 8, y: b.y + b.h / 2 - size * 1.4, w: b.w - 16, h: size * 2.8 }; align = 'center'; }
		}
		const tl = worldToScreen(box.x, box.y);
		Object.assign(el.style, {
			left: tl.x + 'px', top: tl.y + 'px', width: box.w * z + 'px', height: box.h * z + 'px',
			fontSize: size * z + 'px', fontFamily: family, textAlign: align, color, lineHeight: '1.25'
		});
	}
	function stopEditing(save) {
		if (!editing) { return; }
		const { id, field, el } = editing;
		editing = null;
		const value = el.value;
		el.remove();
		const e = byId(id);
		if (e && save) {
			if (field === 'name' && e.type === 'service') {
				const others = new Set(els().filter(x => x.type === 'service' && x.id !== e.id).map(x => slug(x.name)));
				let n = slug(value) || 'service', i = 2;
				const base = n;
				while (others.has(n)) { n = `${base}-${i++}`; }
				e.name = n;
			} else if (field === 'label') {
				if (value.trim()) { e.label = value.trim(); } else { delete e.label; }
			} else {
				e[field] = field === 'name' ? value.trim() : value;
			}
			if (e.type === 'text') {
				if (!value.trim()) { doc.pages[mode].elements = els().filter(x => x.id !== id); sel.delete(id); }
				else { const m = measureText(value, FONT_SIZES[e.font || 'M'] || 20, textFamilyFor(e)); e.w = Math.max(40, m.w); e.h = Math.max(28, m.h); }
			}
		}
		commit();
		render();
		sceneWrap.focus({ preventScroll: true });
	}
	//#endregion

	//#region Keyboard + clipboard
	function typingInField(ev) {
		const t = ev.target;
		return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
	}
	function onKeyDown(ev) {
		if (typingInField(ev)) { return; }
		const ctrl = ev.ctrlKey || ev.metaKey;
		if (ev.key === ' ' && !spaceDown) { spaceDown = true; sceneWrap.style.cursor = 'grab'; ev.preventDefault(); return; }
		if (ev.key === 'Delete' || ev.key === 'Backspace') { if (sel.size) { ev.preventDefault(); deleteSelection(); } return; }
		if (ev.key === 'Escape') {
			if (drag) { drag = null; render(); return; }
			if (ui.exportMenu) { closeMenus(); return; }
			if (sel.size) { sel.clear(); render(); return; }
			if (tool !== 'select') { setTool('select'); }
			return;
		}
		if (ev.key === 'Enter' && sel.size === 1) { const e = byId([...sel][0]); if (e && e.type !== 'pencil') { ev.preventDefault(); startEditing(e, false); } return; }
		if (ctrl && ev.key.toLowerCase() === 'a') { ev.preventDefault(); sel = new Set(els().map(e => e.id)); render(); return; }
		if (ctrl && ev.key.toLowerCase() === 'd') { ev.preventDefault(); duplicateSelection(); return; }
		if (ctrl && (ev.key === '0')) { ev.preventDefault(); zoomToFit(); return; }
		if (ev.key.startsWith('Arrow') && sel.size) {
			ev.preventDefault();
			const step = ev.shiftKey ? 10 : 1;
			const dx = ev.key === 'ArrowLeft' ? -step : ev.key === 'ArrowRight' ? step : 0;
			const dy = ev.key === 'ArrowUp' ? -step : ev.key === 'ArrowDown' ? step : 0;
			for (const id of sel) {
				const e = byId(id);
				if (!e) { continue; }
				if (e.points && !e.from && !e.to) { e.points = e.points.map(q => [q[0] + dx, q[1] + dy]); }
				else if (e.x !== undefined) { e.x += dx; e.y += dy; }
			}
			renderScene();
			clearTimeout(onKeyDown.nudge); onKeyDown.nudge = setTimeout(commit, 350);
			return;
		}
		if (ctrl || ev.altKey) { return; }
		const k = ev.key.toUpperCase();
		const t = TOOLS[mode].find(x => x[2] === k);
		if (t) { setTool(t[0]); return; }
		if (k === '1' && ev.shiftKey) { zoomToFit(); }
	}
	function onKeyUp(ev) {
		if (ev.key === ' ') { spaceDown = false; sceneWrap.style.cursor = ''; }
	}
	function onCopy(ev, cut) {
		if (typingInField(ev) || editing || !sel.size) { return; }
		const items = els().filter(e => sel.has(e.id));
		const text = JSON.stringify({ flideClip: 1, mode, items });
		clipboard = items;
		if (ev.clipboardData) { ev.clipboardData.setData('text/plain', text); ev.preventDefault(); }
		if (cut) { deleteSelection(); }
	}
	function onPaste(ev) {
		if (typingInField(ev) || editing) { return; }
		const text = ev.clipboardData ? ev.clipboardData.getData('text/plain') : '';
		let items = null;
		try { const o = JSON.parse(text); if (o && o.flideClip && Array.isArray(o.items)) { items = o.items; } } catch { /* plain text */ }
		ev.preventDefault();
		if (items) { pasteItems(clone(items), 24); return; }
		if (text && text.trim()) {
			const r = sceneEl.getBoundingClientRect();
			const c = screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
			const e = defaultsFor('text', c.x, c.y);
			e.text = text.slice(0, 5000);
			const m = measureText(e.text, FONT_SIZES[e.font] || 20, textFamilyFor(e));
			e.w = m.w; e.h = m.h;
			addElement(e, true);
			commit();
			render();
		}
	}
	//#endregion

	//#region Code generation (Mermaid for Architecture, Docker Compose for DevOps)
	function mermaidId(e) { return 'n_' + e.id.replace(/[^a-zA-Z0-9_]/g, ''); }
	function mermaidLabel(t) { return '"' + String(t || '').replace(/"/g, '#quot;') + '"'; }
	function mermaidText() {
		const page = doc.pages.arch.elements;
		const nodes = page.filter(e => e.type === 'node');
		const groups = page.filter(e => e.type === 'group');
		const lines = ['flowchart LR'];
		const shape = e => {
			const l = mermaidLabel(e.name + (e.sub ? '<br/><small>' + e.sub + '</small>' : ''));
			if (e.kind === 'database' || e.kind === 'storage') { return `[(${l})]`; }
			if (e.kind === 'queue') { return `[[${l}]]`; }
			if (e.kind === 'user') { return `((${l}))`; }
			if (e.kind === 'cache') { return `{{${l}}}`; }
			return `[${l}]`;
		};
		const inGroup = new Map();
		for (const g of groups) {
			const gb = bounds(g);
			for (const n of nodes) {
				if (inGroup.has(n.id)) { continue; }
				const c = center(bounds(n));
				if (c.x > gb.x && c.x < gb.x + gb.w && c.y > gb.y && c.y < gb.y + gb.h) { inGroup.set(n.id, g.id); }
			}
		}
		for (const n of nodes) { if (!inGroup.has(n.id)) { lines.push(`    ${mermaidId(n)}${shape(n)}`); } }
		for (const g of groups) {
			lines.push(`    subgraph ${mermaidId(g)} [${mermaidLabel(g.name || 'Boundary')}]`);
			for (const n of nodes) { if (inGroup.get(n.id) === g.id) { lines.push(`        ${mermaidId(n)}${shape(n)}`); } }
			lines.push('    end');
		}
		const ids = new Set(nodes.map(n => n.id).concat(groups.map(g => g.id)));
		for (const a of page.filter(e => (e.type === 'arrow' || e.type === 'line') && ids.has(e.from) && ids.has(e.to))) {
			const from = page.find(e => e.id === a.from), to = page.find(e => e.id === a.to);
			const arrow = a.dash === 'dashed' ? '-.->' : '-->';
			lines.push(`    ${mermaidId(from)} ${a.label ? `${arrow}|${mermaidLabel(a.label)}|` : arrow} ${mermaidId(to)}`);
		}
		return lines.join('\n') + '\n';
	}
	function q(v) { return JSON.stringify(String(v)); }
	function parsePorts(list) {
		return (list || []).map(p => String(p).trim()).filter(Boolean).map(p => {
			const m = /^(?:(\d+):)?(\d+)(\/(?:tcp|udp))?$/.exec(p);
			return m ? { host: m[1] ? Number(m[1]) : Number(m[2]), container: Number(m[2]), proto: m[3] || '' } : null;
		}).filter(Boolean);
	}
	function composeText() {
		const page = doc.pages.ops.elements;
		const services = page.filter(e => e.type === 'service');
		const lines = [`# Generated by FLIDE from ${fileName} \u2014 change the diagram, not this file.`, 'services:'];
		if (!services.length) { lines.push('  {}'); }
		for (const sv of services) {
			const name = slug(sv.name);
			lines.push(`  ${name}:`);
			if (sv.build) { lines.push(`    build: ${q(sv.build)}`); }
			if (sv.image) { lines.push(`    image: ${q(sv.image)}`); }
			if (!sv.build && !sv.image) { lines.push('    image: "alpine:3.20"'); }
			if (sv.command) { lines.push(`    command: ${q(sv.command)}`); }
			const ports = parsePorts(sv.ports);
			if (ports.length) {
				lines.push('    ports:');
				for (const p of ports) { lines.push((sv.replicas || 1) > 1 ? `      - ${q(p.container + p.proto)}` : `      - ${q(p.host + ':' + p.container + p.proto)}`); }
			}
			const env = sv.env || {};
			const keys = Object.keys(env);
			if (keys.length) {
				lines.push('    environment:');
				for (const k of keys) { lines.push(`      ${k}: ${q(env[k])}`); }
			}
			const deps = [...new Set(page.filter(a => a.type === 'arrow' && a.from === sv.id).map(a => page.find(x => x.id === a.to)).filter(t => t && t.type === 'service' && t.id !== sv.id).map(t => slug(t.name)))];
			if (deps.length) {
				lines.push('    depends_on:');
				for (const d of deps) { lines.push(`      - ${d}`); }
			}
			if ((sv.replicas || 1) > 1) { lines.push('    deploy:', `      replicas: ${sv.replicas}`); }
		}
		return lines.join('\n') + '\n';
	}
	/** Everything the extension needs to run the DevOps page. */
	function runSpec() {
		const page = doc.pages.ops.elements;
		const services = page.filter(e => e.type === 'service').map(sv => ({ name: slug(sv.name), ports: parsePorts(sv.ports), replicas: sv.replicas || 1 }));
		const loadgens = page.filter(e => e.type === 'loadgen').map(l => {
			const edge = page.find(a => a.type === 'arrow' && a.from === l.id);
			const target = edge ? page.find(x => x.id === edge.to && x.type === 'service') : null;
			const ports = target ? parsePorts(target.ports) : [];
			return { id: l.id, rate: clamp(Number(l.rate) || 0, 0, 500), path: l.path || '/', target: target ? slug(target.name) : null, port: ports.length ? ports[0].container : null };
		});
		return { compose: composeText(), services, loadgens };
	}
	//#endregion

	//#region Examples (offered on an empty Architecture / DevOps page)
	function exampleArch() {
		const n = (id, kind, x, y, name, sub, w) => Object.assign(nodeFromKind(kind, x, y), { id, name, sub, w: w || 150 });
		const a = (from, to, label) => ({ id: uid('c'), type: 'arrow', from, to, points: [[0, 0], [0, 0]], label });
		return [
			{ id: 'g_vpc', type: 'group', x: 420, y: 120, w: 360, h: 480, name: 'VPC \u00b7 eu-central-1', color: '#C9CDD6' },
			n('n_web', 'web', 60, 240, 'Web app', 'Client'), n('n_mobile', 'mobile', 60, 350, 'Mobile app', 'Client'),
			n('n_lb', 'lb', 250, 295, 'Load balancer', 'L7 \u00b7 HTTPS', 140),
			n('n_api1', 'service', 440, 230, 'API service', 'zone a', 140), n('n_api2', 'service', 440, 340, 'API service', 'zone b', 140),
			n('n_worker', 'function', 440, 500, 'Worker', 'jobs', 140),
			n('n_cache', 'cache', 620, 170, 'Cache', 'Redis', 140), n('n_db', 'database', 620, 280, 'Database', 'Postgres', 140),
			n('n_queue', 'queue', 620, 390, 'Queue', 'RabbitMQ', 140), n('n_s3', 'storage', 620, 500, 'Storage', 'Object store', 140),
			a('n_web', 'n_lb', 'HTTPS'), a('n_mobile', 'n_lb'), a('n_lb', 'n_api1'), a('n_lb', 'n_api2'),
			a('n_api1', 'n_cache', 'read'), a('n_api1', 'n_db', 'SQL'), a('n_api2', 'n_db'), a('n_api2', 'n_queue'),
			a('n_queue', 'n_worker', 'jobs'), a('n_worker', 'n_s3')
		];
	}
	function exampleOps() {
		const a = (from, to) => ({ id: uid('c'), type: 'arrow', from, to, points: [[0, 0], [0, 0]] });
		return [
			{ id: 'l_load', type: 'loadgen', x: 40, y: 260, w: 160, h: 66, name: 'Load test', rate: 20, path: '/' },
			{ id: 's_web', type: 'service', x: 260, y: 260, w: 170, h: 66, name: 'web', image: 'nginx:1.27-alpine', ports: ['8080:80'], env: {}, replicas: 1 },
			{ id: 's_api', type: 'service', x: 490, y: 260, w: 170, h: 66, name: 'api', image: 'traefik/whoami', ports: [], env: {}, replicas: 2 },
			{ id: 's_db', type: 'service', x: 720, y: 160, w: 170, h: 66, name: 'db', image: 'postgres:16-alpine', ports: [], env: { POSTGRES_PASSWORD: 'dev' }, replicas: 1 },
			{ id: 's_cache', type: 'service', x: 720, y: 360, w: 170, h: 66, name: 'cache', image: 'redis:7-alpine', ports: [], env: {}, replicas: 1 },
			a('l_load', 's_web'), a('s_web', 's_api'), a('s_api', 's_db'), a('s_api', 's_cache')
		];
	}
	//#endregion

	//#region Chrome (toolbar, mode switch, library, panels)
	let appEl, sceneWrap, modesEl, toolbarEl, libEl, topRightEl, panelEl, codeEl, bottomEl, toastEl, bannerEl, emptyEl, zoomLabel;
	let panelSig = '';

	function btn(content, attrs) { return h('button', Object.assign({ type: 'button' }, attrs || {}), content); }
	function closeMenus() {
		if (ui.exportMenu) { ui.exportMenu = false; renderTopRight(); }
	}
	function render() {
		if (!doc) { return; }
		renderScene();
		renderChrome();
	}
	function renderChrome() {
		renderModes();
		renderToolbar();
		renderLib();
		renderTopRight();
		renderPanel(false);
		renderCode();
		renderZoom();
		renderToast();
		fitTopBars();
	}
	/** Narrow FLIDE windows: move the mode switch left and drop labels until it clears the right-hand controls. */
	function fitTopBars() {
		appEl.classList.remove('tight', 'tighter');
		const clash = () => modesEl.getBoundingClientRect().right + 10 > topRightEl.getBoundingClientRect().left;
		if (clash()) { appEl.classList.add('tight'); if (clash()) { appEl.classList.add('tighter'); } }
	}
	function renderModes() {
		modesEl.textContent = '';
		for (const m of MODES) {
			modesEl.appendChild(btn([icon(m.icon, 14), h('span', { text: m.label })], {
				role: 'tab', 'aria-selected': String(m.id === mode), class: m.id === mode ? 'on' : '',
				onclick: () => switchMode(m.id)
			}));
		}
	}
	function switchMode(m) {
		if (m === mode) { return; }
		if (editing) { stopEditing(true); }
		const fresh = !views[m];
		mode = m;
		tool = 'select';
		sel.clear();
		hoverId = null;
		ui.code = false;
		persistUiState();
		vscode.postMessage({ type: 'mode', mode });
		render();
		if (fresh) { zoomToFit(); }
	}
	function renderToolbar() {
		toolbarEl.textContent = '';
		for (const [id, label, key] of TOOLS[mode]) {
			const iconPath = id === 'box' ? I.box : id === 'group' ? I.group : I[id];
			toolbarEl.appendChild(btn([icon(iconPath), h('span', { class: 'key', text: key })], {
				title: `${label} (${key})`, 'aria-label': label, 'aria-pressed': String(tool === id), class: tool === id ? 'on' : '',
				onclick: () => setTool(id)
			}));
		}
		if (mode !== 'sketch') {
			toolbarEl.appendChild(h('span', { class: 'sep' }));
			toolbarEl.appendChild(btn(icon(I.library), {
				title: mode === 'ops' ? 'Services' : 'Shapes', 'aria-label': 'Library', 'aria-expanded': String(ui.lib), class: ui.lib ? 'on' : '',
				onclick: () => { ui.lib = !ui.lib; persistUiState(); render(); }
			}));
		}
	}
	function renderLib() {
		const show = mode !== 'sketch' && ui.lib;
		libEl.hidden = !show;
		if (!show) { return; }
		if (libEl.dataset.mode === mode) { return; }
		libEl.dataset.mode = mode;
		libEl.textContent = '';
		const tiles = mode === 'ops' ? IMAGES.map(i => ({ key: i.id, label: i.label, icon: i.icon, color: i.color })) : Object.keys(KINDS).map(k => ({ key: k, label: KINDS[k].label, icon: KINDS[k].icon, color: KINDS[k].color }));
		const grid = h('div', { class: 'tiles' });
		const search = h('input', { type: 'text', placeholder: mode === 'ops' ? 'Search images' : 'Search shapes', 'aria-label': 'Search library' });
		search.addEventListener('input', () => {
			const q = search.value.toLowerCase();
			for (const t of grid.children) { t.hidden = !!q && !t.dataset.label.includes(q); }
		});
		for (const t of tiles) {
			const tile = btn([h('span', { class: 'tile-icon', style: { background: hexA(t.color, 0.14), color: t.color } }, icon(t.icon, 14)), h('span', { class: 'tile-label', text: t.label })], {
				class: 'tile', draggable: 'true', title: `${t.label} \u2014 drag onto the canvas or click to add`
			});
			tile.dataset.label = t.label.toLowerCase();
			tile.addEventListener('dragstart', ev => { ev.dataTransfer.setData('application/x-flide-lib', t.key); ev.dataTransfer.effectAllowed = 'copy'; });
			tile.addEventListener('click', () => {
				const r = sceneEl.getBoundingClientRect();
				const c = screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
				const n = (els().length % 6) * 18;
				addFromLibrary(t.key, c.x - 80 + n, c.y - 30 + n);
			});
			grid.appendChild(tile);
		}
		libEl.append(
			h('div', { class: 'lib-head' }, h('span', { text: mode === 'ops' ? 'Services' : 'Shapes' }), h('small', { text: 'drag onto canvas' })),
			h('label', { class: 'search' }, icon('M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM10.5 10.5L14 14', 12), search),
			grid
		);
	}
	function addFromLibrary(key, x, y) {
		let e;
		if (mode === 'ops') {
			const img = IMAGES.find(i => i.id === key);
			if (!img) { return; }
			e = serviceFromImage(img, Math.round(x), Math.round(y));
		} else {
			if (!KINDS[key]) { return; }
			e = nodeFromKind(key, Math.round(x), Math.round(y));
		}
		if (e.type === 'group') { doc.pages[mode].elements.unshift(e); sel = new Set([e.id]); } else { addElement(e, true); }
		tool = 'select';
		commit();
		render();
	}
	function renderTopRight() {
		topRightEl.textContent = '';
		requestAnimationFrame(() => fitTopBars());
		if (mode === 'ops') {
			const st = stackStatus();
			topRightEl.appendChild(h('span', { class: 'pill', title: runtime.message || '' }, h('span', { class: 'dot', style: { background: st.color } }), h('span', { text: st.text })));
		}
		if (mode !== 'sketch') {
			const seg = h('div', { class: 'seg' });
			seg.append(
				btn('Diagram', { class: ui.code ? '' : 'on', 'aria-pressed': String(!ui.code), onclick: () => { ui.code = false; persistUiState(); render(); } }),
				btn(mode === 'ops' ? 'compose.yaml' : 'As code', { class: ui.code ? 'on' : '', 'aria-pressed': String(ui.code), onclick: () => { ui.code = true; persistUiState(); render(); } })
			);
			topRightEl.appendChild(seg);
		}
		const wrap = h('div', { class: 'menu-wrap' });
		wrap.appendChild(btn(icon(I.export, 15), { class: 'icon-btn', title: 'Export', 'aria-label': 'Export', 'aria-expanded': String(ui.exportMenu), onclick: ev => { ev.stopPropagation(); ui.exportMenu = !ui.exportMenu; renderTopRight(); } }));
		if (ui.exportMenu) {
			const menu = h('div', { class: 'menu', role: 'menu' });
			menu.append(
				btn('Export as PNG', { role: 'menuitem', onclick: () => { closeMenus(); exportImage('png'); } }),
				btn('Export as SVG', { role: 'menuitem', onclick: () => { closeMenus(); exportImage('svg'); } })
			);
			if (mode === 'arch') { menu.appendChild(btn('Save Mermaid file (.mmd)\u2026', { role: 'menuitem', onclick: () => { closeMenus(); vscode.postMessage({ type: 'saveAs', content: mermaidText(), name: baseName() + '.mmd' }); } })); }
			if (mode === 'ops') { menu.appendChild(btn('Save compose.yaml\u2026', { role: 'menuitem', onclick: () => { closeMenus(); vscode.postMessage({ type: 'saveAs', content: composeText(), name: 'compose.yaml' }); } })); }
			wrap.appendChild(menu);
		}
		topRightEl.appendChild(wrap);
	}
	function baseName() { return fileName.replace(/\.flow$/i, '') || 'design'; }
	function stackStatus() {
		if (runtime.docker === 'missing') { return { color: '#FF7B7B', text: 'Docker not installed' }; }
		if (runtime.docker === 'stopped') { return { color: '#FFB454', text: 'Docker not running' }; }
		if (runtime.busy) { return { color: '#FFB454', text: runtime.running ? 'stopping\u2026' : 'starting\u2026' }; }
		const services = els().filter(e => e.type === 'service');
		if (!runtime.running) { return { color: '#7C8493', text: `${services.length} service${services.length === 1 ? '' : 's'} \u00b7 stopped` }; }
		const down = services.filter(e => { const st = runtime.services[slug(e.name)]; return !st || st.state !== 'running'; }).length;
		return down ? { color: '#FF7B7B', text: `${down} of ${services.length} down` } : { color: '#9FD8A4', text: `${services.length} running` };
	}
	function renderZoom() { if (zoomLabel) { zoomLabel.textContent = Math.round(view().zoom * 100) + '%'; } }
	function renderToast() {
		let msg = '';
		if (mode === 'ops' && runtime.running) {
			for (const e of els()) {
				if (e.type === 'service') {
					const st = runtime.services[slug(e.name)];
					if (st && (st.state === 'exited' || st.state === 'dead')) { msg = `${slug(e.name)} exited with code ${st.exitCode ?? '?'} \u2014 open its Logs to see why`; break; }
				}
				if (e.type === 'loadgen' && runtime.load && runtime.load[e.id] && runtime.load[e.id].errRate > 0.05) {
					const l = runtime.load[e.id];
					msg = `${e.name || 'Load generator'}: ${Math.round(l.errRate * 100)}% of requests failing${l.lastError ? ' (' + l.lastError + ')' : ''}`;
				}
			}
		}
		if (mode === 'ops' && runtime.error) { msg = runtime.error; }
		toastEl.hidden = !msg;
		toastEl.querySelector('span').textContent = msg;
	}
	function renderEmpty() {
		const empty = doc && !els().length && !drag;
		emptyEl.hidden = !empty;
		if (!empty) { return; }
		emptyEl.textContent = '';
		const text = {
			sketch: 'Draw anything. Pick a tool on the left \u2014 R rectangle, A arrow, P pencil \u2014 or double-click to write.',
			arch: 'Drag parts from the library on the left, then connect them by dragging from the dot on a part\u2019s edge.',
			ops: 'Drag services from the library, connect them, then press Run \u25b6 in the bar to start them in Docker.'
		}[mode];
		emptyEl.appendChild(h('p', { text }));
		if (mode !== 'sketch') {
			emptyEl.appendChild(btn(mode === 'arch' ? 'Start from an example system' : 'Start from a runnable example', {
				class: 'primary', onclick: () => { doc.pages[mode].elements = mode === 'arch' ? exampleArch() : exampleOps(); ui.lib = false; persistUiState(); commit(); render(); zoomToFit(); }
			}));
		}
	}
	function showBanner(text) { bannerEl.hidden = false; bannerEl.textContent = text; }
	function hideBanner() { bannerEl.hidden = true; }
	//#endregion

	//#region Properties panel
	function selected() { return [...sel].map(byId).filter(Boolean); }
	function selPanelVisible() {
		if (ui.code && mode !== 'sketch') { return false; }
		if (mode === 'sketch') { return sel.size > 0 || ['rect', 'diamond', 'ellipse', 'arrow', 'line', 'pencil', 'text'].includes(tool); }
		return sel.size > 0;
	}
	function field(label, control, extra) { return h('div', { class: 'field' + (extra ? ' ' + extra : '') }, h('span', { class: 'label', text: label }), control); }
	function swatchRow(colors, current, onPick, round) {
		const row = h('div', { class: 'swatches' });
		for (const c of colors) {
			const hex = Array.isArray(c) ? c[1] : c;
			const name = Array.isArray(c) ? c[0] : c;
			row.appendChild(btn(h('span', { class: 'chip' + (hex === 'transparent' ? ' empty' : ''), style: { background: hex } }), {
				class: 'swatch' + (round ? ' round' : '') + (current === hex ? ' on' : ''), title: name, 'aria-label': name, 'aria-pressed': String(current === hex), onclick: () => onPick(hex)
			}));
		}
		return row;
	}
	function segRow(options, current, onPick) {
		const row = h('div', { class: 'seg block' });
		for (const o of options) {
			const content = o.render ? o.render() : o.label;
			row.appendChild(btn(content, { class: current === o.value ? 'on' : '', title: o.title || o.label, 'aria-label': o.title || o.label, 'aria-pressed': String(current === o.value), onclick: () => onPick(o.value) }));
		}
		return row;
	}
	/** Text input bound to an element field: live preview while typing, one edit when done. */
	function boundInput(e, key, opts) {
		const o = opts || {};
		const el = o.multiline ? h('textarea', { rows: o.rows || 3, placeholder: o.placeholder || '', spellcheck: 'false' }) : h('input', { type: 'text', placeholder: o.placeholder || '', spellcheck: 'false' });
		el.value = o.get ? o.get(e) : (e[key] ?? '');
		el.addEventListener('input', () => { if (o.live !== false) { o.set ? o.set(e, el.value, false) : (e[key] = el.value); renderScene(); } });
		el.addEventListener('change', () => { o.set ? o.set(e, el.value, true) : (e[key] = el.value); commit(); render(); });
		el.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter' && !o.multiline) { el.blur(); } });
		return el;
	}
	function applyToSelection(patch, filter) {
		for (const e of selected()) { if (!filter || filter(e)) { Object.assign(e, patch); } }
		commit();
		render();
		renderPanel(true);
	}
	function sketchPanel() {
		const items = selected();
		const st = ui.sketchStyle;
		const first = items[0] || {};
		const cur = k => (items.length ? first[k] : st[k]);
		const set = (k, v, filter) => {
			st[k] = v; persistUiState();
			if (items.length) { applyToSelection({ [k]: v }, filter); } else { renderPanel(true); }
		};
		const box = h('div');
		box.appendChild(field('Stroke', swatchRow(SKETCH_STROKES, cur('stroke') || '#E6E8EE', v => set('stroke', v))));
		const fillable = !items.length ? ['rect', 'diamond', 'ellipse'].includes(tool) : items.some(e => ['rect', 'diamond', 'ellipse'].includes(e.type));
		if (fillable) { box.appendChild(field('Background', swatchRow(SKETCH_FILLS, cur('fill') || 'transparent', v => set('fill', v, e => ['rect', 'diamond', 'ellipse'].includes(e.type))))); }
		box.appendChild(field('Stroke width', segRow([1, 2, 4].map(w => ({ value: w, title: ['Thin', 'Bold', 'Extra bold'][[1, 2, 4].indexOf(w)], render: () => h('span', { class: 'line-sample', style: { height: w + 'px' } }) })), cur('width') || 2, v => set('width', v))));
		box.appendChild(field('Stroke style', segRow(['solid', 'dashed', 'dotted'].map(d => ({ value: d, title: d[0].toUpperCase() + d.slice(1), render: () => h('span', { class: 'dash-sample', style: { borderTopStyle: d } }) })), cur('dash') || 'solid', v => set('dash', v))));
		box.appendChild(field('Sloppiness', segRow([{ value: 0, label: 'Clean' }, { value: 1, label: 'Hand' }, { value: 2, label: 'Wobbly' }], cur('rough') ?? 1, v => set('rough', v, e => e.type !== 'text' && e.type !== 'pencil'))));
		const texty = !items.length ? ['text', 'rect', 'diamond', 'ellipse'].includes(tool) : items.some(e => ['text', 'rect', 'diamond', 'ellipse'].includes(e.type));
		if (texty) { box.appendChild(field('Font size', segRow(['S', 'M', 'L'].map(f => ({ value: f, label: f })), cur('font') || 'M', v => set('font', v, e => ['text', 'rect', 'diamond', 'ellipse'].includes(e.type))))); }
		if (items.length) { box.appendChild(actionsRow(true)); }
		return box;
	}
	function actionsRow(layers) {
		const row = h('div', { class: 'actions' });
		if (layers) {
			row.appendChild(btn([icon(I.front, 14), 'Front'], { title: 'Bring to front', onclick: () => reorder(true) }));
			row.appendChild(btn('Back', { title: 'Send to back', onclick: () => reorder(false) }));
		}
		row.appendChild(btn([icon(I.trash, 14), 'Delete'], { class: 'danger', onclick: deleteSelection }));
		return row;
	}
	function reorder(front) {
		const page = doc.pages[mode];
		const moving = page.elements.filter(e => sel.has(e.id));
		const rest = page.elements.filter(e => !sel.has(e.id));
		page.elements = front ? rest.concat(moving) : moving.concat(rest);
		commit(); render();
	}
	function archPanel() {
		const items = selected();
		const box = h('div');
		if (items.length > 1) {
			box.appendChild(h('div', { class: 'title', text: `${items.length} selected` }));
			box.appendChild(field('Color', swatchRow(ARCH_COLORS, null, v => applyToSelection({ color: v }, e => e.type === 'node' || e.type === 'group'), true)));
			box.appendChild(actionsRow(false));
			return box;
		}
		const e = items[0];
		if (e.type === 'node') {
			box.appendChild(field('Name', boundInput(e, 'name')));
			box.appendChild(field('Subtitle', boundInput(e, 'sub', { placeholder: 'e.g. Postgres, zone a' })));
			const kind = h('select', { 'aria-label': 'Type' });
			for (const k of Object.keys(KINDS)) { if (k !== 'boundary') { kind.appendChild(h('option', { value: k, text: KINDS[k].label })); } }
			kind.value = e.kind || 'service';
			kind.addEventListener('change', () => { e.kind = kind.value; e.color = KINDS[kind.value].color; commit(); render(); renderPanel(true); });
			box.appendChild(field('Type', kind));
			box.appendChild(field('Color', swatchRow(ARCH_COLORS, e.color, v => applyToSelection({ color: v }), true)));
			box.appendChild(field('Notes', boundInput(e, 'notes', { multiline: true, placeholder: 'What does this part do?', live: false })));
			const linkRow = h('div', { class: 'link-row' },
				icon(I.link, 13),
				h('span', { class: 'mono path', text: e.link || 'No file linked', title: e.link || '' }),
				btn(e.link ? 'Open' : 'Link\u2026', { onclick: () => vscode.postMessage(e.link ? { type: 'openLink', path: e.link } : { type: 'pickLink', id: e.id }) })
			);
			if (e.link) { linkRow.appendChild(btn(icon(I.close, 12), { class: 'icon-btn small', title: 'Unlink', 'aria-label': 'Unlink', onclick: () => { delete e.link; commit(); render(); renderPanel(true); } })); }
			box.appendChild(field('Linked code', linkRow));
		} else if (e.type === 'group') {
			box.appendChild(field('Name', boundInput(e, 'name')));
			box.appendChild(field('Color', swatchRow(ARCH_COLORS, e.color, v => applyToSelection({ color: v }), true)));
		} else if (e.type === 'arrow' || e.type === 'line') {
			box.appendChild(field('Label', boundInput(e, 'label', { placeholder: 'e.g. HTTPS, SQL, jobs', set: (el, v) => { if (v.trim()) { el.label = v; } else { delete el.label; } } })));
			box.appendChild(field('Line', segRow([{ value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }], e.dash || 'solid', v => applyToSelection({ dash: v }))));
			box.appendChild(field('Route', segRow([{ value: 'elbow', label: 'Elbow' }, { value: 'straight', label: 'Straight' }], routeStyle(e), v => applyToSelection({ route: v }))));
			box.appendChild(h('div', { class: 'actions' }, btn('Reverse', { onclick: () => { const f = e.from; e.from = e.to; e.to = f; e.points = (e.points || []).slice().reverse(); commit(); render(); } })));
		} else {
			box.appendChild(h('div', { class: 'title', text: e.type === 'sticky' ? 'Note' : 'Text' }));
			box.appendChild(h('p', { class: 'hint', text: 'Double-click to edit the text.' }));
		}
		box.appendChild(actionsRow(false));
		return box;
	}
	function opsPanel() {
		const items = selected();
		const box = h('div');
		if (items.length > 1) {
			box.appendChild(h('div', { class: 'title', text: `${items.length} selected` }));
			box.appendChild(actionsRow(false));
			return box;
		}
		const e = items[0];
		if (e.type === 'service') {
			const st = serviceState(e);
			const live = runtime.services[slug(e.name)] || {};
			box.appendChild(h('div', { class: 'head' }, h('span', { class: 'title', text: slug(e.name) }), h('span', { class: 'status', style: { color: st.color, background: hexA(st.color.length === 7 ? st.color : '#7C8493', 0.14) }, text: st.label })));
			box.appendChild(field('Name', boundInput(e, 'name', { live: false, set: (el, v, done) => { if (done) { const others = new Set(els().filter(x => x.type === 'service' && x.id !== el.id).map(x => slug(x.name))); let n = slug(v), i = 2; const b = n; while (others.has(n)) { n = `${b}-${i++}`; } el.name = n; } } })));
			box.appendChild(field('Image', boundInput(e, 'image', { placeholder: 'e.g. nginx:1.27-alpine' })));
			box.appendChild(field('Build from', boundInput(e, 'build', { placeholder: 'folder with a Dockerfile (optional)', set: (el, v) => { if (v.trim()) { el.build = v.trim(); } else { delete el.build; } } })));
			box.appendChild(field('Ports', boundInput(e, 'ports', { placeholder: 'host:container, e.g. 8080:80', get: el => (el.ports || []).join(', '), set: (el, v) => { el.ports = v.split(',').map(x => x.trim()).filter(Boolean); } })));
			box.appendChild(field('Environment', boundInput(e, 'env', { multiline: true, rows: 3, live: false, placeholder: 'KEY=value, one per line', get: el => Object.entries(el.env || {}).map(([k, v]) => `${k}=${v}`).join('\n'), set: (el, v) => { const env = {}; for (const line of v.split('\n')) { const i = line.indexOf('='); if (i > 0) { env[line.slice(0, i).trim()] = line.slice(i + 1).trim(); } } el.env = env; } })));
			const reps = h('div', { class: 'stepper' },
				btn('\u2212', { 'aria-label': 'Fewer replicas', onclick: () => setReplicas(e, (e.replicas || 1) - 1) }),
				h('span', { class: 'mono', text: String(e.replicas || 1) }),
				btn('+', { 'aria-label': 'More replicas', onclick: () => setReplicas(e, (e.replicas || 1) + 1) }));
			box.appendChild(field('Replicas', reps, 'inline'));
			if (runtime.running) {
				box.appendChild(meter('CPU', live.cpu, '%', 100, ACCENT));
				box.appendChild(meter('Memory', live.mem, ' MB', Math.max(256, live.mem || 0), '#C39BFF'));
			}
			const up = live.state === 'running';
			const name = slug(e.name);
			box.appendChild(h('div', { class: 'actions' },
				btn('Logs', { disabled: !runtime.running || undefined, onclick: () => vscode.postMessage({ type: 'svc', action: 'logs', name }) }),
				btn('Restart', { disabled: !runtime.running || undefined, onclick: () => vscode.postMessage({ type: 'svc', action: 'restart', name }) }),
				btn(up ? 'Kill' : 'Start', { class: up ? 'danger' : '', disabled: !runtime.running || undefined, onclick: () => vscode.postMessage({ type: 'svc', action: up ? 'kill' : 'start', name }) })
			));
			box.appendChild(actionsRow(false));
		} else if (e.type === 'loadgen') {
			const l = runtime.load && runtime.load[e.id];
			const spec = runSpec().loadgens.find(x => x.id === e.id);
			box.appendChild(h('div', { class: 'head' }, h('span', { class: 'title', text: e.name || 'Load generator' })));
			const rate = h('input', { type: 'range', min: '0', max: '200', step: '5', 'aria-label': 'Requests per second' });
			rate.value = String(e.rate || 0);
			const rateLabel = h('span', { class: 'mono', text: `${e.rate || 0} req/s` });
			rate.addEventListener('input', () => { e.rate = Number(rate.value); rateLabel.textContent = `${e.rate} req/s`; renderScene(); });
			rate.addEventListener('change', () => { commit(); vscode.postMessage({ type: 'loadRate', id: e.id, rate: e.rate }); });
			box.appendChild(field('Traffic', h('div', { class: 'range' }, rate, rateLabel)));
			box.appendChild(field('Path', boundInput(e, 'path', { placeholder: '/' })));
			box.appendChild(field('Target', h('span', { class: 'mono', text: spec && spec.target ? `${spec.target}${spec.port ? ':' + spec.port : ' (no port)'}` : 'Connect it to a service' })));
			if (runtime.running && l) {
				box.appendChild(h('div', { class: 'stats' },
					stat('ok/s', l.okRate != null ? String(Math.round(l.okRate)) : '\u2013'),
					stat('errors', l.errRate != null ? Math.round(l.errRate * 100) + '%' : '\u2013'),
					stat('p95', l.p95 != null ? Math.round(l.p95) + ' ms' : '\u2013')));
			}
			box.appendChild(h('p', { class: 'hint', text: 'While the stack runs, it sends real HTTP requests to the target\u2019s first port.' }));
			box.appendChild(actionsRow(false));
		} else if (e.type === 'arrow') {
			const a = byId(e.from), b = byId(e.to);
			box.appendChild(h('div', { class: 'title', text: `${a ? a.name : '?'} \u2192 ${b ? b.name : '?'}` }));
			box.appendChild(h('p', { class: 'hint', text: a && a.type === 'loadgen' ? 'The load generator sends its traffic along this connection.' : `${b ? slug(b.name) : 'The target'} starts before ${a ? slug(a.name) : 'the source'} (depends_on).` }));
			box.appendChild(actionsRow(false));
		} else {
			box.appendChild(h('div', { class: 'title', text: 'Label' }));
			box.appendChild(actionsRow(false));
		}
		return box;
	}
	function setReplicas(e, n) {
		e.replicas = clamp(n, 1, 9);
		commit(); render(); renderPanel(true);
		if (runtime.running) { vscode.postMessage({ type: 'svc', action: 'scale', name: slug(e.name), replicas: e.replicas, spec: runSpec() }); }
	}
	function meter(label, value, unit, max, color) {
		const v = value == null ? null : Number(value);
		return h('div', { class: 'meter' },
			h('div', { class: 'meter-head' }, h('span', { text: label }), h('span', { class: 'mono', text: v == null ? '\u2013' : `${Math.round(v * 10) / 10}${unit}` })),
			h('div', { class: 'bar' }, h('span', { style: { width: v == null ? '0' : clamp(v / max * 100, 0, 100) + '%', background: color } })));
	}
	function stat(label, value) { return h('div', { class: 'stat' }, h('span', { class: 'mono', text: value }), h('small', { text: label })); }
	function renderPanel(force) {
		const visible = selPanelVisible();
		const sig = `${mode}|${[...sel].sort().join(',')}|${visible}|${mode === 'sketch' ? tool : ''}`;
		if (!force && sig === panelSig) { return; }
		if (panelEl.contains(document.activeElement) && document.activeElement !== panelEl && sig === panelSig) { return; }
		panelSig = sig;
		panelEl.hidden = !visible;
		panelEl.textContent = '';
		if (!visible) { return; }
		panelEl.appendChild(mode === 'sketch' ? sketchPanel() : mode === 'arch' ? archPanel() : opsPanel());
	}
	//#endregion

	//#region Code panel + export
	function renderCode() {
		const show = ui.code && mode !== 'sketch';
		codeEl.hidden = !show;
		if (!show) { return; }
		updateCode();
	}
	function updateCode() {
		if (!codeEl || codeEl.hidden) { return; }
		const text = mode === 'ops' ? composeText() : mermaidText();
		const name = mode === 'ops' ? 'compose.yaml' : baseName() + '.mmd';
		codeEl.textContent = '';
		const body = h('div', { class: 'code-body' });
		text.replace(/\n$/, '').split('\n').forEach((l, i) => {
			const cls = /^\s*#/.test(l) ? 'c' : /^\s*(services:|flowchart|subgraph|end\b)/.test(l) ? 'k' : /^\s+[\w.-]+:\s*$/.test(l) ? 't' : /"[^"]*"/.test(l) ? 's' : '';
			body.appendChild(h('div', { class: 'code-line' }, h('span', { class: 'ln', text: String(i + 1) }), h('span', { class: 'code ' + cls, text: l || ' ' })));
		});
		codeEl.append(
			h('div', { class: 'code-head' }, h('span', { text: name }), h('small', { text: 'generated' }),
				btn(icon(I.copy, 13), { class: 'icon-btn small', title: 'Copy', 'aria-label': 'Copy', onclick: () => vscode.postMessage({ type: 'copy', text }) }),
				btn('Save\u2026', { class: 'small-btn', onclick: () => vscode.postMessage({ type: 'saveAs', content: text, name }) })),
			body);
	}
	function exportSvgText() {
		const b = contentBounds() || { x: 0, y: 0, w: 400, h: 300 };
		const pad = 32;
		const out = document.createElementNS(SVGNS, 'svg');
		out.setAttribute('xmlns', SVGNS);
		out.setAttribute('width', Math.ceil(b.w + pad * 2));
		out.setAttribute('height', Math.ceil(b.h + pad * 2));
		out.setAttribute('viewBox', `${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`);
		out.appendChild(sceneEl.querySelector('defs').cloneNode(true));
		out.appendChild(s('rect', { x: b.x - pad, y: b.y - pad, width: b.w + pad * 2, height: b.h + pad * 2, fill: mode === 'sketch' ? '#17191E' : '#121418' }));
		for (const l of [layerGroups, layerEdges, layerItems]) {
			const c = l.cloneNode(true);
			c.querySelectorAll('animateMotion').forEach(n => n.parentNode.remove());
			c.querySelectorAll('.hit').forEach(n => n.remove());
			out.appendChild(c);
		}
		out.querySelectorAll('[font-family]').forEach(n => {
			const f = n.getAttribute('font-family');
			if (f.includes('var(')) { n.setAttribute('font-family', 'Segoe UI, system-ui, sans-serif'); }
		});
		out.querySelectorAll('.mono').forEach(n => n.setAttribute('font-family', 'Consolas, monospace'));
		return new XMLSerializer().serializeToString(out);
	}
	function exportImage(kind) {
		const svgText = exportSvgText();
		if (kind === 'svg') { vscode.postMessage({ type: 'export', kind, data: svgText, name: baseName() + '.svg' }); return; }
		const img = new Image();
		const w = Number(/width="(\d+)"/.exec(svgText)[1]), hgt = Number(/height="(\d+)"/.exec(svgText)[1]);
		img.onload = () => {
			const scale = 2;
			const c = document.createElement('canvas');
			c.width = w * scale; c.height = hgt * scale;
			const ctx = c.getContext('2d');
			ctx.scale(scale, scale);
			ctx.drawImage(img, 0, 0, w, hgt);
			vscode.postMessage({ type: 'export', kind: 'png', data: c.toDataURL('image/png'), name: baseName() + '.png' });
		};
		img.onerror = () => vscode.postMessage({ type: 'info', text: 'Could not render the PNG. Try Export as SVG.' });
		img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText)));
	}
	//#endregion

	//#region Startup + messages
	function buildDom() {
		appEl = $('#app');
		sceneWrap = h('div', { id: 'scene-wrap', tabindex: '0', 'aria-label': 'Canvas' });
		sceneEl = s('svg', { id: 'scene', 'aria-hidden': 'true' });
		const defs = s('defs');
		markerDefs = defs;
		sceneEl.appendChild(defs);
		worldEl = s('g', { id: 'world' });
		layerGroups = s('g'); layerEdges = s('g'); layerItems = s('g'); layerOverlay = s('g');
		worldEl.append(layerGroups, layerEdges, layerItems, layerOverlay);
		sceneEl.appendChild(worldEl);
		sceneWrap.appendChild(sceneEl);

		modesEl = h('div', { id: 'modes', role: 'tablist', 'aria-label': 'Design mode' });
		toolbarEl = h('div', { id: 'toolbar', role: 'toolbar', 'aria-label': 'Tools' });
		libEl = h('div', { id: 'lib', hidden: true });
		topRightEl = h('div', { id: 'topright' });
		panelEl = h('div', { id: 'panel', hidden: true });
		codeEl = h('div', { id: 'code', hidden: true });
		zoomLabel = h('span', { class: 'zoom-label', text: '100%' });
		bottomEl = h('div', { id: 'bottom' },
			h('div', { class: 'group' },
				btn('\u2212', { 'aria-label': 'Zoom out', title: 'Zoom out', onclick: () => zoomBy(1 / 1.2) }),
				zoomLabel,
				btn('+', { 'aria-label': 'Zoom in', title: 'Zoom in', onclick: () => zoomBy(1.2) }),
				btn(icon(I.fit, 14), { 'aria-label': 'Zoom to fit', title: 'Zoom to fit (Shift+1)', onclick: zoomToFit })),
			h('div', { class: 'group' },
				btn(icon(I.undo, 14), { 'aria-label': 'Undo', title: 'Undo (Ctrl+Z)', onclick: () => vscode.postMessage({ type: 'undo' }) }),
				btn(icon(I.redo, 14), { 'aria-label': 'Redo', title: 'Redo (Ctrl+Y)', onclick: () => vscode.postMessage({ type: 'redo' }) })));
		toastEl = h('div', { id: 'toast', role: 'status', hidden: true }, icon('M8 1.5l6.5 12h-13zM8 6v3.5M8 11.5h.01', 14), h('span'));
		bannerEl = h('div', { id: 'banner', hidden: true });
		emptyEl = h('div', { id: 'empty', hidden: true });
		appEl.append(sceneWrap, emptyEl, toolbarEl, libEl, modesEl, topRightEl, panelEl, codeEl, bottomEl, toastEl, bannerEl);

		sceneWrap.addEventListener('pointerdown', onPointerDown);
		sceneWrap.addEventListener('pointermove', onPointerMove);
		sceneWrap.addEventListener('pointerup', onPointerUp);
		sceneWrap.addEventListener('pointercancel', onPointerUp);
		sceneWrap.addEventListener('pointerleave', () => { if (!drag && hoverId) { hoverId = null; renderScene(); } });
		sceneWrap.addEventListener('wheel', onWheel, { passive: false });
		sceneWrap.addEventListener('dragover', ev => { if (ev.dataTransfer.types.includes('application/x-flide-lib')) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; } });
		sceneWrap.addEventListener('drop', ev => {
			const key = ev.dataTransfer.getData('application/x-flide-lib');
			if (!key) { return; }
			ev.preventDefault();
			const p = eventPoint(ev);
			addFromLibrary(key, p.x - 80, p.y - 30);
		});
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		window.addEventListener('blur', () => { spaceDown = false; });
		document.addEventListener('copy', ev => onCopy(ev, false));
		document.addEventListener('cut', ev => onCopy(ev, true));
		document.addEventListener('paste', onPaste);
		document.addEventListener('pointerdown', ev => { if (ui.exportMenu && !ev.target.closest('.menu-wrap')) { closeMenus(); } }, true);
		window.addEventListener('resize', () => { renderScene(); fitTopBars(); });
	}

	window.addEventListener('message', ev => {
		const m = ev.data || {};
		switch (m.type) {
			case 'init': {
				fileName = m.fileName || fileName;
				const first = !doc;
				const hadView = new Set(Object.keys(views).filter(k => views[k]));
				loadText(m.text, first);
				if (first) {
					vscode.postMessage({ type: 'mode', mode });
					if (!hadView.has(mode)) { zoomToFit(); }
					if (!saved) { ui.lib = true; render(); }
				}
				break;
			}
			case 'doc': loadText(m.text, false); break;
			case 'runtime':
				runtime = Object.assign({ services: {}, load: null }, m.runtime);
				if (mode === 'ops') {
					renderScene();
					renderTopRight();
					renderToast();
					if (!panelEl.contains(document.activeElement)) { renderPanel(true); }
				}
				break;
			case 'requestSpec': vscode.postMessage({ type: 'spec', requestId: m.requestId, spec: runSpec(), mode }); break;
			case 'linkPicked': {
				const e = doc.pages.arch.elements.find(x => x.id === m.id);
				if (e && m.path) { e.link = m.path; commit(); render(); renderPanel(true); }
				break;
			}
			case 'setMode': if (m.mode && m.mode !== mode) { switchMode(m.mode); } break;
		}
	});

	buildDom();
	vscode.postMessage({ type: 'ready' });
	//#endregion
})();
