/*---------------------------------------------------------------------------------------------
 *  FLIDE — floating window behavior (always on top, opacity, Ghost mode, global hotkeys).
 *  Lives in the Electron main process; one FlideFloatingWindow per workbench window.
 *--------------------------------------------------------------------------------------------*/

import electron from 'electron';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILogService } from '../../log/common/log.js';
import { validatedIpcMain } from '../../../base/parts/ipc/electron-main/ipcMain.js';

export const FlideSettings = {
	alwaysOnTop: 'flide.window.alwaysOnTop',
	opacity: 'flide.window.opacity',
	ghostOpacity: 'flide.window.ghostOpacity',
	hotkeyToggle: 'flide.hotkeys.toggleVisibility',
	hotkeyGhost: 'flide.hotkeys.toggleGhost',
	hotkeyBubble: 'flide.hotkeys.toggleBubble',
} as const;

const DEFAULTS = {
	alwaysOnTop: true,
	opacity: 0.96,
	ghostOpacity: 0.45,
	hotkeyToggle: 'CommandOrControl+Shift+Space',
	hotkeyGhost: 'CommandOrControl+Alt+G',
	hotkeyBubble: 'CommandOrControl+Shift+M',
};

const instances = new Set<FlideFloatingWindow>();

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export class FlideFloatingWindow extends Disposable {

	private ghost = false;
	private onTop = true;

	constructor(
		private readonly win: electron.BrowserWindow,
		private readonly configurationService: IConfigurationService,
		private readonly logService: ILogService
	) {
		super();

		instances.add(this);
		this._register(toDisposable(() => instances.delete(this)));

		this.apply();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('flide.window')) {
				this.apply();
			}
			if (e.affectsConfiguration('flide.hotkeys')) {
				FlideHotkeys.register(this.configurationService, this.logService);
			}
		}));

		FlideHotkeys.register(this.configurationService, this.logService);
	}

	get window(): electron.BrowserWindow {
		return this.win;
	}

	get keepOnTop(): boolean {
		return this.onTop;
	}

	private setting<T>(key: string, fallback: T): T {
		const value = this.configurationService.getValue<T>(key);
		return value === undefined || value === null ? fallback : value;
	}

	apply(): void {
		if (this.win.isDestroyed()) {
			return;
		}

		// 'screen-saver' is the highest z-level: stays above normal and borderless-fullscreen apps
		const onTop = this.setting<boolean>(FlideSettings.alwaysOnTop, DEFAULTS.alwaysOnTop);
		this.onTop = onTop;
		FlideTopmostGuard.start();
		this.win.setAlwaysOnTop(onTop, 'screen-saver');
		this.win.setVisibleOnAllWorkspaces(onTop, { visibleOnFullScreen: true });

		const normal = clamp(Number(this.setting(FlideSettings.opacity, DEFAULTS.opacity)), 0.3, 1);
		const ghost = clamp(Number(this.setting(FlideSettings.ghostOpacity, DEFAULTS.ghostOpacity)), 0.1, 0.9);
		this.win.setOpacity(this.ghost ? ghost : normal);

		// Ghost mode: clicks pass through to the app underneath (leave via the ghost hotkey)
		this.win.setIgnoreMouseEvents(this.ghost, { forward: true });
	}

	toggleGhost(): void {
		this.ghost = !this.ghost;
		this.logService.info(`[FLIDE] ghost mode ${this.ghost ? 'on' : 'off'}`);
		this.apply();
	}
}

/** Global (system-wide) hotkeys — registered once for the whole app, re-registered on settings change. */
namespace FlideHotkeys {

	let registered: string[] = [];
	let quitHooked = false;

	function liveWindows(): FlideFloatingWindow[] {
		return [...instances].filter(i => !i.window.isDestroyed());
	}

	function toggleVisibility(): void {
		if (FlideBubble.isActive()) {
			FlideBubble.restore();
			return;
		}
		const wins = liveWindows();
		const anyVisible = wins.some(i => i.window.isVisible() && !i.window.isMinimized());
		const anyFocused = wins.some(i => i.window.isFocused());
		for (const { window } of wins) {
			if (anyVisible && anyFocused) {
				window.hide();
			} else {
				if (window.isMinimized()) {
					window.restore();
				}
				window.show();
				window.focus();
			}
		}
	}

	function toggleGhost(): void {
		for (const instance of liveWindows()) {
			instance.toggleGhost();
		}
	}

	export function register(configurationService: IConfigurationService, logService: ILogService): void {
		for (const accelerator of registered) {
			electron.globalShortcut.unregister(accelerator);
		}
		registered = [];

		const bindings: [string, () => void][] = [
			[configurationService.getValue<string>(FlideSettings.hotkeyToggle) || DEFAULTS.hotkeyToggle, toggleVisibility],
			[configurationService.getValue<string>(FlideSettings.hotkeyGhost) || DEFAULTS.hotkeyGhost, toggleGhost],
			[configurationService.getValue<string>(FlideSettings.hotkeyBubble) || DEFAULTS.hotkeyBubble, () => FlideBubble.toggle(liveWindows().map(i => i.window))],
		];

		for (const [accelerator, handler] of bindings) {
			try {
				if (electron.globalShortcut.register(accelerator, handler)) {
					registered.push(accelerator);
				} else {
					logService.warn(`[FLIDE] hotkey ${accelerator} is already taken by another app`);
				}
			} catch (error) {
				logService.error(`[FLIDE] invalid hotkey ${accelerator}`, error);
			}
		}

		if (!quitHooked) {
			quitHooked = true;
			electron.app.on('will-quit', () => registered.forEach(a => electron.globalShortcut.unregister(a)));

			// Buttons in the FLIDE bar
			validatedIpcMain.on('vscode:flide-hide', event => electron.BrowserWindow.fromWebContents(event.sender)?.hide());
			validatedIpcMain.on('vscode:flide-bubble', () => FlideBubble.show(liveWindows().map(i => i.window)));
			validatedIpcMain.on('vscode:flide-running', (_event, running: boolean) => FlideBubble.setRunning(!!running));
		}
	}
}

/** Bubble mode: a small round orb at the screen edge. Click it to bring the window back; drag its rim to move it. */
namespace FlideBubble {

	let bubble: electron.BrowserWindow | undefined;
	let hidden: electron.BrowserWindow[] = [];
	let running = false;

	const SIZE = 64;

	function html(): string {
		return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden;user-select:none}
.rim{position:fixed;inset:0;border-radius:50%;-webkit-app-region:drag}
a{position:absolute;inset:8px;border-radius:50%;background:#14161B;border:1px solid rgba(255,255,255,.12);
box-shadow:0 6px 18px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#7AA2FF;
font:500 17px 'JetBrains Mono',Consolas,monospace;text-decoration:none;-webkit-app-region:no-drag;cursor:pointer;transition:border-color .12s}
a:hover{border-color:#7AA2FF}
.dot{position:absolute;top:9px;right:9px;width:11px;height:11px;border-radius:50%;background:#FFB454;border:2px solid #14161B;display:none;pointer-events:none}
body.running .dot{display:block}
</style></head><body class="${running ? 'running' : ''}"><div class="rim"></div><a href="flide://open" title="Open FLIDE">{}</a><span class="dot"></span></body></html>`;
	}

	export function isActive(): boolean {
		return !!bubble && !bubble.isDestroyed();
	}

	export function window(): electron.BrowserWindow | undefined {
		return bubble && !bubble.isDestroyed() ? bubble : undefined;
	}

	export function toggle(windows: electron.BrowserWindow[]): void {
		if (isActive()) {
			restore();
		} else {
			show(windows);
		}
	}

	export function show(windows: electron.BrowserWindow[]): void {
		if (isActive()) {
			return;
		}
		const anchor = windows.find(w => w.isVisible()) ?? windows[0];
		const display = anchor ? electron.screen.getDisplayMatching(anchor.getBounds()) : electron.screen.getPrimaryDisplay();
		const area = display.workArea;

		bubble = new electron.BrowserWindow({
			width: SIZE,
			height: SIZE,
			x: area.x + area.width - SIZE - 16,
			y: area.y + Math.round(area.height / 2 - SIZE / 2),
			frame: false,
			transparent: true,
			resizable: false,
			maximizable: false,
			fullscreenable: false,
			skipTaskbar: true,
			hasShadow: false,
			show: false,
			webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
		});
		bubble.setAlwaysOnTop(true, 'screen-saver');
		bubble.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
		bubble.webContents.on('will-navigate', (event, url) => {
			event.preventDefault();
			if (url.startsWith('flide://open')) {
				restore();
			}
		});
		bubble.on('closed', () => { bubble = undefined; });
		bubble.once('ready-to-show', () => bubble?.showInactive());
		bubble.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html()));

		hidden = windows.filter(w => !w.isDestroyed() && w.isVisible());
		for (const w of hidden) {
			w.hide();
		}
	}

	export function restore(): void {
		if (bubble && !bubble.isDestroyed()) {
			bubble.destroy();
		}
		bubble = undefined;
		const targets = hidden.filter(w => !w.isDestroyed());
		hidden = [];
		for (const w of (targets.length ? targets : [...instances].map(i => i.window).filter(w => !w.isDestroyed()))) {
			w.show();
			w.focus();
		}
	}

	export function setRunning(value: boolean): void {
		running = value;
		if (bubble && !bubble.isDestroyed()) {
			bubble.webContents.executeJavaScript(`document.body.classList.toggle('running', ${value ? 'true' : 'false'})`).catch(() => undefined);
		}
	}
}

/**
 * Keeps FLIDE above other always-on-top windows such as games in (windowed) fullscreen.
 * A game that gets focus moves itself to the top of the topmost band; every 500 ms we move
 * FLIDE back above it. moveTop() changes only the z-order: it never takes focus or input
 * away from the game, and nothing is injected into other processes.
 */
namespace FlideTopmostGuard {

	let timer: ReturnType<typeof setInterval> | undefined;

	function raise(win: electron.BrowserWindow): void {
		if (win.isDestroyed() || !win.isVisible() || win.isMinimized() || win.isFocused()) {
			return;
		}
		if (!win.isAlwaysOnTop()) {
			win.setAlwaysOnTop(true, 'screen-saver');
		}
		win.moveTop();
	}

	export function start(): void {
		if (timer) {
			return;
		}
		timer = setInterval(() => {
			const bubble = FlideBubble.window();
			if (bubble) {
				raise(bubble);
			}
			for (const instance of instances) {
				if (instance.keepOnTop) {
					raise(instance.window);
				}
			}
		}, 500);
		electron.app.on('will-quit', () => {
			if (timer) {
				clearInterval(timer);
				timer = undefined;
			}
		});
	}
}
