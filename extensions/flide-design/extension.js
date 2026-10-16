/*---------------------------------------------------------------------------------------------
 *  FLIDE Design — the host side of Code | Design.
 *  - Opens *.flow files in the canvas (a custom text editor: the file stays plain JSON, so Save,
 *    dirty state and Undo/Redo are the editor's own).
 *  - Runs the DevOps playground page as a real Docker Compose project and feeds live status,
 *    CPU/memory and load-generator results back to the canvas.
 *--------------------------------------------------------------------------------------------*/
'use strict';

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const http = require('http');
const crypto = require('crypto');

const VIEW_TYPE = 'flide.design';
const EMPTY_FLOW = JSON.stringify({ flide: 'flow', version: 1, mode: 'sketch', pages: { sketch: { elements: [] }, arch: { elements: [] }, ops: { elements: [] } } }, null, '\t') + '\n';

/** @type {Set<EditorState>} */
const editors = new Set();
/** @type {EditorState | undefined} */
let activeEditor;
let extensionContext;

/**
 * @typedef {{ panel: vscode.WebviewPanel, document: vscode.TextDocument, mode: string, stack?: Stack, pendingSpec: Map<number, (spec: any) => void>, specSeq: number }} EditorState
 */

function activate(context) {
	extensionContext = context;
	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(VIEW_TYPE, new FlowEditorProvider(context), {
			webviewOptions: { retainContextWhenHidden: true },
			supportsMultipleEditorsPerDocument: false
		}),
		vscode.commands.registerCommand('flide.design.open', () => openDesign(context)),
		vscode.commands.registerCommand('flide.design.new', () => newDesign()),
		vscode.commands.registerCommand('flide.design.run', () => runOrStop()),
		vscode.window.tabGroups.onDidChangeTabs(() => updateBar())
	);
}

function deactivate() {
	for (const e of editors) { e.stack?.dispose(true); }
}

//#region Opening design files

function isFlowTab(tab) {
	const input = tab && tab.input;
	return !!input && input.uri && /\.flow$/i.test(input.uri.path) && (input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputText);
}

/** Design: reveal the open .flow file, else the last one used, else design.flow in the folder (created if missing). */
async function openDesign(context) {
	for (const group of vscode.window.tabGroups.all) {
		const tab = group.tabs.find(t => t.isActive && isFlowTab(t)) || group.tabs.find(isFlowTab);
		if (tab) {
			await vscode.commands.executeCommand('vscode.openWith', tab.input.uri, VIEW_TYPE, { viewColumn: group.viewColumn, preview: false });
			return;
		}
	}
	const last = context.workspaceState.get('flide.design.last');
	if (last) {
		const uri = vscode.Uri.parse(last);
		try {
			await vscode.workspace.fs.stat(uri);
			await vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE, { preview: false });
			return;
		} catch { /* gone, fall through */ }
	}
	const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
	if (!folder) {
		await vscode.commands.executeCommand('vscode.openWith', vscode.Uri.parse('untitled:design.flow'), VIEW_TYPE, { preview: false });
		return;
	}
	const uri = vscode.Uri.joinPath(folder.uri, 'design.flow');
	try { await vscode.workspace.fs.stat(uri); } catch { await vscode.workspace.fs.writeFile(uri, Buffer.from(EMPTY_FLOW, 'utf8')); }
	await vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE, { preview: false });
}

async function newDesign() {
	const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
	const name = await vscode.window.showInputBox({ title: 'New design file', prompt: 'Name of the .flow file', value: 'architecture', validateInput: v => /^[\w .-]+$/.test(v.trim()) ? undefined : 'Letters, numbers, spaces, dots, dashes and underscores only' });
	if (!name) { return; }
	const file = name.trim().replace(/\.flow$/i, '') + '.flow';
	if (!folder) {
		await vscode.commands.executeCommand('vscode.openWith', vscode.Uri.parse('untitled:' + file), VIEW_TYPE);
		return;
	}
	const uri = vscode.Uri.joinPath(folder.uri, file);
	try {
		await vscode.workspace.fs.stat(uri);
		vscode.window.showWarningMessage(`${file} already exists.`);
	} catch {
		await vscode.workspace.fs.writeFile(uri, Buffer.from(EMPTY_FLOW, 'utf8'));
	}
	await vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE, { preview: false });
}

//#endregion

//#region The editor

class FlowEditorProvider {
	constructor(context) { this.context = context; }

	/** @param {vscode.TextDocument} document @param {vscode.WebviewPanel} panel */
	resolveCustomTextEditor(document, panel) {
		const media = vscode.Uri.joinPath(this.context.extensionUri, 'media');
		panel.webview.options = { enableScripts: true, localResourceRoots: [media] };
		panel.webview.html = html(panel.webview, media);

		/** @type {EditorState} */
		const state = { panel, document, mode: 'sketch', pendingSpec: new Map(), specSeq: 0 };
		editors.add(state);
		if (panel.active) { activeEditor = state; }
		if (document.uri.scheme === 'file') { this.context.workspaceState.update('flide.design.last', document.uri.toString()); }

		const post = msg => panel.webview.postMessage(msg);
		const subs = [];

		subs.push(vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document.uri.toString() === document.uri.toString() && e.contentChanges.length) {
				post({ type: 'doc', text: document.getText() });
			}
		}));
		subs.push(panel.onDidChangeViewState(() => {
			if (panel.active) {
				activeEditor = state;
				if (document.uri.scheme === 'file') { this.context.workspaceState.update('flide.design.last', document.uri.toString()); }
			}
			updateBar();
		}));
		subs.push(panel.webview.onDidReceiveMessage(m => this.onMessage(state, m).catch(err => vscode.window.showErrorMessage(`FLIDE Design: ${err && err.message || err}`))));
		panel.onDidDispose(() => {
			subs.forEach(s => s.dispose());
			if (state.stack) {
				if (state.stack.running || state.stack.busy) {
					vscode.window.showInformationMessage(`Stopped the stack of ${path.basename(document.uri.path)} because its design was closed.`);
				}
				state.stack.dispose(true);
			}
			editors.delete(state);
			if (activeEditor === state) { activeEditor = undefined; }
			updateBar();
		});
	}

	/** @param {EditorState} state */
	async onMessage(state, m) {
		const { panel, document } = state;
		const docDir = document.uri.scheme === 'file' ? path.dirname(document.uri.fsPath) : (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
		switch (m.type) {
			case 'error': vscode.window.showErrorMessage(`FLIDE Design: ${m.text}`); break;
			case 'ready':
				panel.webview.postMessage({ type: 'init', text: document.getText(), fileName: path.basename(document.uri.path) });
				if (state.stack) { state.stack.post(); }
				break;
			case 'edit': await replaceText(document, m.text); break;
			case 'mode': state.mode = m.mode; updateBar(); break;
			case 'undo': await vscode.commands.executeCommand('undo'); break;
			case 'redo': await vscode.commands.executeCommand('redo'); break;
			case 'copy': await vscode.env.clipboard.writeText(m.text || ''); vscode.window.setStatusBarMessage('Copied', 1500); break;
			case 'info': vscode.window.showInformationMessage(m.text); break;
			case 'openLink': {
				if (!docDir) { return; }
				const target = path.resolve(docDir, m.path);
				if (!fs.existsSync(target)) { vscode.window.showWarningMessage(`${m.path} doesn\u2019t exist any more.`); return; }
				if (fs.statSync(target).isDirectory()) { await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(target)); return; }
				await vscode.window.showTextDocument(vscode.Uri.file(target), { preview: false });
				break;
			}
			case 'pickLink': {
				const files = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/*.flow}', 4000);
				const base = docDir || '';
				const items = files.map(f => ({ label: path.basename(f.fsPath), description: path.relative(base, path.dirname(f.fsPath)) || '.', uri: f })).sort((a, b) => a.description.localeCompare(b.description) || a.label.localeCompare(b.label));
				const pick = await vscode.window.showQuickPick(items, { title: 'Link this part to a file', placeHolder: 'Type to search files', matchOnDescription: true });
				if (pick) { panel.webview.postMessage({ type: 'linkPicked', id: m.id, path: path.relative(base, pick.uri.fsPath).split(path.sep).join('/') }); }
				break;
			}
			case 'saveAs': {
				const defaultUri = docDir ? vscode.Uri.file(path.join(docDir, m.name)) : undefined;
				const uri = await vscode.window.showSaveDialog({ defaultUri, saveLabel: 'Save' });
				if (!uri) { return; }
				await vscode.workspace.fs.writeFile(uri, Buffer.from(m.content, 'utf8'));
				const open = await vscode.window.showInformationMessage(`Saved ${path.basename(uri.fsPath)}`, 'Open');
				if (open) { await vscode.window.showTextDocument(uri, { preview: false }); }
				break;
			}
			case 'export': {
				const defaultUri = docDir ? vscode.Uri.file(path.join(docDir, m.name)) : undefined;
				const uri = await vscode.window.showSaveDialog({ defaultUri, saveLabel: 'Export', filters: m.kind === 'png' ? { 'PNG image': ['png'] } : { 'SVG image': ['svg'] } });
				if (!uri) { return; }
				const data = m.kind === 'png' ? Buffer.from(String(m.data).replace(/^data:image\/png;base64,/, ''), 'base64') : Buffer.from(m.data, 'utf8');
				await vscode.workspace.fs.writeFile(uri, data);
				vscode.window.setStatusBarMessage(`Exported ${path.basename(uri.fsPath)}`, 3000);
				break;
			}
			case 'spec': {
				const resolve = state.pendingSpec.get(m.requestId);
				if (resolve) { state.pendingSpec.delete(m.requestId); resolve(m.spec); }
				break;
			}
			case 'svc': {
				const stack = state.stack;
				if (!stack || !stack.running) { return; }
				if (m.action === 'scale') { await stack.apply(m.spec); } else { await stack.serviceAction(m.action, m.name); }
				break;
			}
			case 'loadRate': state.stack?.setRate(m.id, m.rate); break;
		}
	}
}

/** Replace the whole document text in one edit (one Undo step). */
async function replaceText(document, text) {
	if (document.getText() === text) { return; }
	const edit = new vscode.WorkspaceEdit();
	edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), text);
	await vscode.workspace.applyEdit(edit);
}

function nonce() { return crypto.randomBytes(16).toString('base64').replace(/[^a-zA-Z0-9]/g, ''); }

function html(webview, media) {
	const n = nonce();
	const css = webview.asWebviewUri(vscode.Uri.joinPath(media, 'canvas.css'));
	const js = webview.asWebviewUri(vscode.Uri.joinPath(media, 'canvas.js'));
	const font = webview.asWebviewUri(vscode.Uri.joinPath(media, 'fonts', 'Caveat.ttf'));
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'nonce-${n}'; script-src 'nonce-${n}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${css}">
<style nonce="${n}">@font-face { font-family: 'Caveat'; src: url('${font}') format('truetype'); font-weight: 400 700; font-display: block; }</style>
<title>FLIDE Design</title>
</head>
<body>
<div id="app"></div>
<script nonce="${n}" src="${js}"></script>
</body>
</html>`;
}

//#endregion

//#region Run / Stop from the FLIDE bar

/** Tells the FLIDE bar whether the active design can run (DevOps page) and whether its stack runs. */
function updateBar() {
	const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
	const designActive = !!activeEditor && activeEditor.panel.active && isFlowTab(tab);
	const stack = designActive ? activeEditor.stack : undefined;
	const state = {
		active: designActive,
		runnable: designActive && activeEditor.mode === 'ops',
		running: !!(stack && (stack.running || stack.busy)),
		mode: designActive ? activeEditor.mode : undefined
	};
	vscode.commands.executeCommand('flide.bar.designState', state).then(undefined, () => { /* not running inside FLIDE */ });
}

async function runOrStop() {
	const state = activeEditor;
	if (!state || !state.panel.active) {
		vscode.window.showInformationMessage('Open a design (Code | Design \u2192 Design) to run its DevOps playground.');
		return;
	}
	if (state.mode !== 'ops') {
		state.panel.webview.postMessage({ type: 'setMode', mode: 'ops' });
		return;
	}
	if (!state.stack) { state.stack = new Stack(state); }
	const stack = state.stack;
	if (stack.busy) { return; }
	if (stack.running) { await stack.stop(); return; }
	if (!vscode.workspace.isTrusted) {
		vscode.window.showWarningMessage('Running a stack needs a trusted folder.');
		return;
	}
	const spec = await requestSpec(state);
	if (spec) { await stack.start(spec); }
}

/** Ask the canvas for the generated compose file and the load generators (one source of truth). */
function requestSpec(state) {
	const id = ++state.specSeq;
	return new Promise(resolve => {
		state.pendingSpec.set(id, resolve);
		state.panel.webview.postMessage({ type: 'requestSpec', requestId: id });
		setTimeout(() => { if (state.pendingSpec.delete(id)) { resolve(undefined); } }, 4000);
	});
}

//#endregion

//#region The stack (docker compose)

function slug(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'design'; }

function parseMem(text) {
	const m = /([\d.]+)\s*([kKmMgGtT]?i?B)/.exec(String(text || ''));
	if (!m) { return 0; }
	const v = parseFloat(m[1]);
	const unit = m[2].toLowerCase();
	const f = { b: 1 / 1048576, kib: 1 / 1024, kb: 1 / 1048.576, mib: 1, mb: 0.953674, gib: 1024, gb: 953.674, tib: 1048576, tb: 953674 }[unit] ?? 1;
	return v * f;
}

function parseJsonLines(text) {
	const t = String(text || '').trim();
	if (!t) { return []; }
	if (t.startsWith('[')) { try { return JSON.parse(t); } catch { return []; } }
	const out = [];
	for (const line of t.split(/\r?\n/)) { try { out.push(JSON.parse(line)); } catch { /* skip */ } }
	return out;
}

class Stack {
	/** @param {EditorState} state */
	constructor(state) {
		this.state = state;
		const doc = state.document;
		const base = path.basename(doc.uri.path).replace(/\.flow$/i, '');
		const hash = crypto.createHash('sha1').update(doc.uri.toString()).digest('hex').slice(0, 6);
		this.label = base;
		this.project = `flide-${slug(base)}-${hash}`;
		this.dir = path.join(extensionContext.globalStorageUri.fsPath, 'stacks', this.project);
		this.composeFile = path.join(this.dir, 'compose.yaml');
		const ws = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
		this.projectDir = doc.uri.scheme === 'file' ? path.dirname(doc.uri.fsPath) : (ws ? ws.uri.fsPath : this.dir);
		this.running = false;
		this.busy = false;
		this.docker = 'unknown';
		this.error = '';
		this.services = {};
		this.stats = {};
		this.load = {};
		this.loadgens = new Map();
		this.timers = [];
		this.agent = new http.Agent({ keepAlive: true, maxSockets: 64 });
	}

	compose(args) { return ['compose', '-p', this.project, '-f', this.composeFile, '--project-directory', this.projectDir, ...args]; }

	exec(args, timeout) {
		return new Promise(resolve => {
			cp.execFile('docker', args, { cwd: this.projectDir, timeout: timeout || 20000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
				resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, errno: err && typeof err.code === 'string' ? err.code : undefined, stdout: String(stdout || ''), stderr: String(stderr || '') });
			});
		});
	}

	async checkDocker() {
		const r = await this.exec(['version', '--format', '{{.Server.Version}}'], 10000);
		if (r.errno === 'ENOENT') { return 'missing'; }
		return r.code === 0 && r.stdout.trim() ? 'ok' : 'stopped';
	}

	ensureTerminal() {
		if (this.terminal && !this.terminal.exitStatus) { return; }
		this.emitter = new vscode.EventEmitter();
		const pty = { onDidWrite: this.emitter.event, open: () => { }, close: () => { this.terminal = undefined; } };
		this.terminal = vscode.window.createTerminal({ name: `Stack \u00b7 ${this.label}`, pty, iconPath: new vscode.ThemeIcon('server-process') });
	}

	log(text) {
		this.ensureTerminal();
		this.emitter.fire(String(text).replace(/\r?\n/g, '\r\n'));
	}

	stream(args) {
		return new Promise(resolve => {
			let child;
			try {
				child = cp.spawn('docker', args, { cwd: this.projectDir, windowsHide: true });
			} catch (e) {
				this.log(`\x1b[31m${e.message}\x1b[0m\n`);
				resolve(1);
				return;
			}
			child.stdout.on('data', d => this.log(d.toString()));
			child.stderr.on('data', d => this.log(d.toString()));
			child.on('error', e => { this.log(`\x1b[31m${e.message}\x1b[0m\n`); resolve(1); });
			child.on('close', code => resolve(code ?? 1));
		});
	}

	runtime() {
		return { running: this.running, busy: this.busy, docker: this.docker, services: this.services, load: this.load, error: this.error, project: this.project };
	}

	post() {
		this.state.panel.webview.postMessage({ type: 'runtime', runtime: this.runtime() });
		updateBar();
	}

	writeCompose(spec) {
		fs.mkdirSync(this.dir, { recursive: true });
		fs.writeFileSync(this.composeFile, spec.compose, 'utf8');
		this.spec = spec;
	}

	async start(spec) {
		this.error = '';
		this.docker = await this.checkDocker();
		if (this.docker === 'missing') {
			this.post();
			const pick = await vscode.window.showErrorMessage('Docker isn\u2019t installed. The DevOps playground runs your stack with Docker.', 'Get Docker');
			if (pick) { vscode.env.openExternal(vscode.Uri.parse('https://docs.docker.com/get-docker/')); }
			return;
		}
		if (this.docker === 'stopped') {
			this.post();
			vscode.window.showWarningMessage('Docker isn\u2019t running. Start Docker Desktop, then press Run again.');
			return;
		}
		if (!spec.services.length) {
			vscode.window.showInformationMessage('Add at least one service to the DevOps playground, then press Run.');
			return;
		}
		this.writeCompose(spec);
		this.busy = true;
		this.services = {};
		this.load = {};
		this.post();
		this.ensureTerminal();
		this.terminal.show(true);
		this.log(`\x1b[90m$ docker compose -p ${this.project} up -d\x1b[0m\n\x1b[90m(compose file: ${this.composeFile})\x1b[0m\n`);
		const code = await this.stream(this.compose(['up', '-d', '--remove-orphans']));
		this.busy = false;
		if (code === 0) {
			this.running = true;
			this.log('\x1b[32mStack is up.\x1b[0m Select a service on the canvas and press Logs to follow it.\n');
			this.startPolling();
			this.startLoad(spec.loadgens);
		} else {
			this.running = false;
			this.error = 'docker compose up failed \u2014 the terminal shows why.';
		}
		await this.poll();
		this.post();
	}

	/** Re-apply the diagram (e.g. after changing replicas) while the stack runs. */
	async apply(spec) {
		if (!spec) { return; }
		this.writeCompose(spec);
		this.log(`\x1b[90m$ docker compose up -d   (applying the diagram)\x1b[0m\n`);
		await this.stream(this.compose(['up', '-d', '--remove-orphans']));
		this.stopLoad();
		this.startLoad(spec.loadgens);
		await this.poll();
		this.post();
	}

	async stop() {
		this.busy = true;
		this.stopLoad();
		this.post();
		this.log(`\x1b[90m$ docker compose -p ${this.project} down\x1b[0m\n`);
		const code = await this.stream(this.compose(['down', '--remove-orphans', '-t', '3']));
		this.stopPolling();
		this.busy = false;
		this.running = false;
		this.services = {};
		this.stats = {};
		this.load = {};
		this.error = code === 0 ? '' : 'docker compose down failed \u2014 the terminal shows why.';
		if (code === 0) { this.log('\x1b[90mStack stopped.\x1b[0m\n'); }
		this.post();
	}

	async serviceAction(action, name) {
		if (!/^[a-z0-9_-]+$/.test(name)) { return; }
		if (action === 'logs') {
			const t = vscode.window.createTerminal({ name: `logs \u00b7 ${name}`, shellPath: 'docker', shellArgs: this.compose(['logs', '-f', '--tail', '200', name]), cwd: this.projectDir, iconPath: new vscode.ThemeIcon('output') });
			t.show(false);
			return;
		}
		if (!['kill', 'start', 'restart', 'stop'].includes(action)) { return; }
		this.log(`\x1b[90m$ docker compose ${action} ${name}\x1b[0m\n`);
		await this.stream(this.compose([action, name]));
		await this.poll();
		this.post();
	}

	startPolling() {
		this.stopPolling();
		this.timers.push(setInterval(() => { this.poll().then(() => this.post()); }, 2000));
		this.timers.push(setInterval(() => { this.readStats(); }, 4000));
		this.readStats();
	}

	stopPolling() {
		for (const t of this.timers) { clearInterval(t); }
		this.timers = [];
	}

	async poll() {
		const r = await this.exec(this.compose(['ps', '-a', '--format', 'json']), 15000);
		if (r.code !== 0) { return; }
		const services = {};
		for (const c of parseJsonLines(r.stdout)) {
			const name = c.Service;
			if (!name) { continue; }
			const s = services[name] || (services[name] = { state: 'created', running: 0, total: 0, exitCode: null, health: '' });
			s.total++;
			const state = String(c.State || '').toLowerCase();
			if (state === 'running') { s.running++; }
			if (state === 'exited' || state === 'dead') { s.exitCode = c.ExitCode; }
			if (c.Health) { s.health = String(c.Health).toLowerCase(); }
		}
		for (const name in services) {
			const s = services[name];
			s.state = s.running > 0 ? 'running' : s.exitCode !== null ? 'exited' : 'created';
			const st = this.stats[name];
			if (st) { s.cpu = st.cpu; s.mem = st.mem; }
		}
		this.services = services;
	}

	async readStats() {
		const r = await this.exec(['stats', '--no-stream', '--format', '{{json .}}'], 20000);
		if (r.code !== 0) { return; }
		const stats = {};
		const prefix = this.project + '-';
		for (const c of parseJsonLines(r.stdout)) {
			const n = String(c.Name || '');
			if (!n.startsWith(prefix)) { continue; }
			const svc = n.slice(prefix.length).replace(/-\d+$/, '');
			const s = stats[svc] || (stats[svc] = { cpu: 0, mem: 0 });
			s.cpu += parseFloat(String(c.CPUPerc || '0').replace('%', '')) || 0;
			s.mem += parseMem(String(c.MemUsage || '').split('/')[0]);
		}
		this.stats = stats;
	}

	//#region Load generator: real HTTP requests to the target's published port

	startLoad(loadgens) {
		this.stopLoad();
		for (const lg of loadgens || []) {
			this.loadgens.set(lg.id, { spec: lg, hostPort: null, resolving: false, carry: 0, inflight: 0, ok: 0, err: 0, lat: [], lastError: '' });
			this.load[lg.id] = lg.target ? { rps: 0, okRate: null, errRate: null, p95: null, target: lg.target } : { target: null };
		}
		if (!this.loadgens.size) { return; }
		this.loadTick = setInterval(() => this.tick(), 100);
		this.loadReport = setInterval(() => this.report(), 1000);
	}

	stopLoad() {
		clearInterval(this.loadTick);
		clearInterval(this.loadReport);
		this.loadTick = this.loadReport = undefined;
		this.loadgens.clear();
	}

	setRate(id, rate) {
		const lg = this.loadgens.get(id);
		if (lg) { lg.spec.rate = Math.max(0, Math.min(500, Number(rate) || 0)); }
	}

	async resolvePort(lg) {
		lg.resolving = true;
		const r = await this.exec(this.compose(['port', lg.spec.target, String(lg.spec.port)]), 10000);
		lg.resolving = false;
		const m = /:(\d+)\s*$/m.exec(r.stdout.trim());
		lg.hostPort = r.code === 0 && m ? Number(m[1]) : null;
		if (!lg.hostPort) { lg.lastError = `${lg.spec.target} publishes no port ${lg.spec.port}`; lg.retryAt = Date.now() + 2000; }
	}

	tick() {
		for (const lg of this.loadgens.values()) {
			if (!lg.spec.target || !lg.spec.port) { continue; }
			if (!lg.hostPort) {
				if (!lg.resolving && (!lg.retryAt || Date.now() > lg.retryAt)) { this.resolvePort(lg); }
				continue;
			}
			lg.carry += (lg.spec.rate || 0) / 10;
			while (lg.carry >= 1) {
				lg.carry -= 1;
				if (lg.inflight >= 200) { lg.err++; lg.lastError = 'too many requests waiting'; continue; }
				this.request(lg);
			}
		}
	}

	request(lg) {
		const t0 = Date.now();
		lg.inflight++;
		let done = false;
		const finish = (ok, error) => {
			if (done) { return; }
			done = true;
			lg.inflight--;
			if (ok) { lg.ok++; lg.lat.push(Date.now() - t0); } else { lg.err++; lg.lastError = error; if (error === 'ECONNREFUSED') { lg.hostPort = null; lg.retryAt = Date.now() + 1500; } }
		};
		const req = http.get({ host: '127.0.0.1', port: lg.hostPort, path: lg.spec.path || '/', agent: this.agent, timeout: 4000 }, res => {
			res.resume();
			res.on('end', () => finish(res.statusCode < 500, res.statusCode >= 500 ? `HTTP ${res.statusCode}` : ''));
			res.on('error', e => finish(false, e.code || e.message));
		});
		req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'timeout' })));
		req.on('error', e => finish(false, e.code || e.message));
	}

	report() {
		for (const [id, lg] of this.loadgens) {
			const total = lg.ok + lg.err;
			const lat = lg.lat.sort((a, b) => a - b);
			this.load[id] = {
				target: lg.spec.target,
				rps: total,
				okRate: lg.ok,
				errRate: total ? lg.err / total : (lg.hostPort || !lg.spec.port ? 0 : 1),
				p95: lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))] : null,
				lastError: lg.err ? lg.lastError : (lg.hostPort ? '' : lg.lastError)
			};
			if (!lg.spec.port) { this.load[id].lastError = `${lg.spec.target} has no port`; }
			lg.ok = 0; lg.err = 0; lg.lat = [];
		}
		this.post();
	}

	//#endregion

	dispose(down) {
		this.stopPolling();
		this.stopLoad();
		if (down && (this.running || this.busy)) {
			try { cp.spawn('docker', this.compose(['down', '--remove-orphans', '-t', '3']), { cwd: this.projectDir, windowsHide: true, detached: true, stdio: 'ignore' }).unref(); } catch { /* ignore */ }
		}
		this.running = false;
		this.agent.destroy();
	}
}

//#endregion

module.exports = { activate, deactivate };
