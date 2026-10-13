/*---------------------------------------------------------------------------------------------
 *  FLIDE — floating window behavior (always on top, opacity, Ghost mode, global hotkeys).
 *  Lives in the Electron main process; one FlideFloatingWindow per workbench window.
 *--------------------------------------------------------------------------------------------*/

import electron from 'electron';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILogService } from '../../log/common/log.js';

export const FlideSettings = {
	alwaysOnTop: 'flide.window.alwaysOnTop',
	opacity: 'flide.window.opacity',
	ghostOpacity: 'flide.window.ghostOpacity',
	hotkeyToggle: 'flide.hotkeys.toggleVisibility',
	hotkeyGhost: 'flide.hotkeys.toggleGhost',
} as const;

const DEFAULTS = {
	alwaysOnTop: true,
	opacity: 0.96,
	ghostOpacity: 0.45,
	hotkeyToggle: 'CommandOrControl+Shift+Space',
	hotkeyGhost: 'CommandOrControl+Alt+G',
};

const instances = new Set<FlideFloatingWindow>();

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export class FlideFloatingWindow extends Disposable {

	private ghost = false;

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
		}
	}
}
