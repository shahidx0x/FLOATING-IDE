/*---------------------------------------------------------------------------------------------
 *  FLIDE — the single bar: ☰ menu · file name · Run/Stop · terminal · bubble · hide.
 *  Also owns the menu drawer (slides in over the editor) and the Run/Stop controller.
 *--------------------------------------------------------------------------------------------*/

import './media/flide.css';
import { $, addDisposableListener, append, clearNode, getWindow } from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename, dirname, extname } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IHistoryService } from '../../../services/history/common/history.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { ILifecycleService, LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { ITerminalInstance, ITerminalService } from '../../terminal/browser/terminal.js';
import { FlideExtensions, puzzleIcon } from './flideExtensions.js';

/** Default Run commands per file type. {file} = full path, {dir} = folder, {name} = file name without extension. */
export const FLIDE_DEFAULT_RUN_COMMANDS: Record<string, string> = {
	'.py': 'python "{file}"',
	'.js': 'node "{file}"',
	'.mjs': 'node "{file}"',
	'.ts': 'node "{file}"',
	'.ps1': 'powershell -NoProfile -ExecutionPolicy Bypass -File "{file}"',
	'.bat': 'call "{file}"',
	'.cmd': 'call "{file}"',
	'.c': 'gcc "{file}" -o "{dir}\\{name}.exe" && "{dir}\\{name}.exe"',
	'.cpp': 'g++ "{file}" -o "{dir}\\{name}.exe" && "{dir}\\{name}.exe"',
	'.go': 'go run "{file}"',
	'.rs': 'rustc "{file}" -o "{dir}\\{name}.exe" && "{dir}\\{name}.exe"',
	'.java': 'java "{file}"',
};

const PINNED_WIDTH = 280;

const HIDDEN_ENTRIES = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'venv', '.DS_Store', '.idea', '.vs']);

export class FlideBar extends Disposable {

	static current: FlideBar | undefined;

	private readonly bar: HTMLElement;
	private readonly menuButton: HTMLElement;
	private readonly nameLabel: HTMLElement;
	private readonly projectLabel: HTMLElement;
	private readonly runButton: HTMLElement;
	private readonly runIcon: HTMLElement;
	private readonly runLabel: HTMLElement;
	private readonly terminalButton: HTMLElement;
	readonly extensions: FlideExtensions;

	private drawer: HTMLElement | undefined;
	private dim: HTMLElement | undefined;
	private readonly menuListeners = this._register(new DisposableStore());
	private readonly drawerContent = this._register(new DisposableStore());
	private readonly expandedFolders = new Set<string>();
	private pinned = false;

	private runInstance: ITerminalInstance | undefined;
	private running = false;

	constructor(
		container: HTMLElement,
		@IEditorService private readonly editorService: IEditorService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@IHistoryService private readonly historyService: IHistoryService,
		@INotificationService private readonly notificationService: INotificationService,
		@IProductService private readonly productService: IProductService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILifecycleService lifecycleService: ILifecycleService,
	) {
		super();

		FlideBar.current = this;
		this._register(toDisposable(() => { if (FlideBar.current === this) { FlideBar.current = undefined; } }));

		this.bar = append(container, $('.flide-bar'));

		// ☰ Menu
		this.menuButton = this.iconButton(this.bar, Codicon.menu, 'Menu · Ctrl+B keeps it open', () => this.toggleMenu());
		this.menuButton.classList.add('flide-menu-btn');

		// File name + project (also opens the menu)
		const fileButton = append(this.bar, $('button.flide-file')) as HTMLButtonElement;
		fileButton.type = 'button';
		fileButton.title = 'Switch file';
		this.nameLabel = append(fileButton, $('span.flide-file-name'));
		this.projectLabel = append(fileButton, $('span.flide-file-project'));
		append(fileButton, renderIcon(Codicon.chevronDown)).classList.add('flide-chevron');
		this._register(addDisposableListener(fileButton, 'click', () => this.toggleMenu()));

		// Spacer = window drag area
		append(this.bar, $('.flide-spacer'));

		// 🧩 Extensions, left of Run (blue dot = an update is available)
		this.extensions = this._register(instantiationService.createInstance(FlideExtensions, this.layoutService.mainContainer));
		const extensionsButton = append(this.bar, $('button.flide-icon-btn.flide-ext-btn-icon')) as HTMLButtonElement;
		extensionsButton.type = 'button';
		extensionsButton.title = 'Extensions (Ctrl+Shift+X)';
		extensionsButton.setAttribute('aria-label', 'Extensions');
		extensionsButton.appendChild(puzzleIcon());
		append(extensionsButton, $('span.flide-dot'));
		this._register(addDisposableListener(extensionsButton, 'click', e => {
			e.preventDefault();
			this.closeMenu();
			this.extensions.toggleDropdown(extensionsButton);
		}));
		const syncExtensionsButton = () => {
			extensionsButton.classList.toggle('has-update', this.extensions.hasUpdates);
			extensionsButton.classList.toggle('is-active', this.extensions.isDropdownOpen || this.extensions.isManageOpen);
			extensionsButton.setAttribute('aria-expanded', String(this.extensions.isDropdownOpen));
		};
		this._register(this.extensions.onDidChange(syncExtensionsButton));
		syncExtensionsButton();

		// Run / Stop (one button)
		this.runButton = append(this.bar, $('button.flide-run'));
		(this.runButton as HTMLButtonElement).type = 'button';
		this.runIcon = append(this.runButton, $('span.flide-run-icon'));
		this.runLabel = append(this.runButton, $('span'));
		this._register(addDisposableListener(this.runButton, 'click', () => this.runOrStop()));

		// Terminal (orange dot while a script runs)
		this.terminalButton = this.iconButton(this.bar, Codicon.terminal, 'Terminal (Ctrl+`)', () => this.toggleTerminal());
		append(this.terminalButton, $('span.flide-dot'));

		append(this.bar, $('span.flide-divider'));
		this.iconButton(this.bar, Codicon.circleLargeOutline, 'Shrink to bubble (Ctrl+Shift+M)', () => ipcRenderer.send('vscode:flide-bubble'));
		this.iconButton(this.bar, Codicon.close, 'Hide FLIDE (Ctrl+Shift+Space)', () => ipcRenderer.send('vscode:flide-hide'));

		this._register(this.editorService.onDidActiveEditorChange(() => this.updateTitle()));
		this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.updateTitle()));
		this._register(this.layoutService.onDidChangePartVisibility(() => {
			this.updateTerminalButton();
			if (this.pinned && !this.layoutService.isVisible(Parts.SIDEBAR_PART)) {
				this.unpin(); // side bar was closed some other way
			}
		}));
		this._register(this.editorService.onDidActiveEditorChange(() => {
			if (this.pinned) {
				this.renderDrawer(); // keep the active-file highlight current
			}
		}));

		this.updateTitle();
		this.setRunning(false);
		this.updateTerminalButton();

		lifecycleService.when(LifecyclePhase.Restored).then(() => this.tidyLayout());
	}

	private iconButton(parent: HTMLElement, icon: ThemeIcon, label: string, onClick: () => void): HTMLElement {
		const button = append(parent, $('button.flide-icon-btn')) as HTMLButtonElement;
		button.type = 'button';
		button.title = label;
		button.setAttribute('aria-label', label);
		append(button, renderIcon(icon));
		this._register(addDisposableListener(button, 'click', e => { e.preventDefault(); onClick(); }));
		return button;
	}

	/** Editor only: no side bar, no secondary side bar, terminal panel lives on the right and starts hidden. */
	private async tidyLayout(): Promise<void> {
		await this.commandService.executeCommand('workbench.action.positionPanelRight').catch(() => undefined);
		for (const part of [Parts.SIDEBAR_PART, Parts.AUXILIARYBAR_PART, Parts.PANEL_PART] as const) {
			if (this.layoutService.isVisible(part)) {
				this.layoutService.setPartHidden(true, part);
			}
		}
	}

	private updateTitle(): void {
		const editor = this.editorService.activeEditor;
		this.nameLabel.textContent = editor ? editor.getName() : 'No file open';
		const folder = this.contextService.getWorkspace().folders[0];
		this.projectLabel.textContent = folder ? folder.name : '';
	}

	private updateTerminalButton(): void {
		this.terminalButton.classList.toggle('is-active', this.layoutService.isVisible(Parts.PANEL_PART));
	}

	//#region Menu drawer

	/** ☰ button / file name: a quick look that closes again on pick, Esc or a click outside. */
	toggleMenu(): void {
		if (this.pinned) {
			this.unpin();
		} else if (this.drawer) {
			this.closeMenu();
		} else {
			this.openMenu();
		}
	}

	/** Ctrl+B: lock the menu open beside the editor until Ctrl+B is pressed again. */
	togglePinned(): void {
		if (this.pinned) {
			this.unpin();
		} else {
			this.pin();
		}
	}

	private pin(): void {
		this.closeMenu();
		this.pinned = true;
		// Reserve real space on the left, so the editor moves over instead of being covered
		this.layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
		try {
			const size = this.layoutService.getSize(Parts.SIDEBAR_PART);
			this.layoutService.setSize(Parts.SIDEBAR_PART, { width: PINNED_WIDTH, height: size.height });
		} catch {
			// keep the current width
		}
		this.openMenu();
	}

	private unpin(): void {
		this.pinned = false;
		this.closeMenu();
		if (this.layoutService.isVisible(Parts.SIDEBAR_PART)) {
			this.layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
		}
	}

	private openMenu(): void {
		const host = this.layoutService.mainContainer;
		this.drawer = append(host, $('.flide-drawer'));
		this.menuButton.classList.add('is-active');
		this.menuButton.classList.toggle('is-pinned', this.pinned);

		if (this.pinned) {
			// Sit exactly on the reserved side bar area and follow its size (also when dragging its edge)
			const drawer = this.drawer;
			drawer.classList.add('is-pinned');
			const sidebar = host.querySelector<HTMLElement>('.part.sidebar');
			if (sidebar) {
				const sync = () => {
					const left = sidebar.getBoundingClientRect().left - host.getBoundingClientRect().left;
					drawer.style.left = `${Math.round(left)}px`;
					drawer.style.width = `${sidebar.offsetWidth}px`;
				};
				sync();
				const observer = new ResizeObserver(sync);
				observer.observe(sidebar);
				this.menuListeners.add(toDisposable(() => observer.disconnect()));
			}
		} else {
			this.dim = append(host, $('.flide-dim'));
			this.menuListeners.add(addDisposableListener(this.dim, 'click', () => this.closeMenu()));
			this.menuListeners.add(addDisposableListener(getWindow(host).document, 'keydown', (e: KeyboardEvent) => {
				if (e.key === 'Escape') {
					this.closeMenu();
				}
			}));
		}
		this.renderDrawer();
	}

	closeMenu(): void {
		this.menuListeners.clear();
		this.drawerContent.clear();
		this.drawer?.remove();
		this.dim?.remove();
		this.drawer = undefined;
		this.dim = undefined;
		this.menuButton.classList.remove('is-active', 'is-pinned');
	}

	private renderDrawer(): void {
		const drawer = this.drawer;
		if (!drawer) {
			return;
		}
		const scrollTop = drawer.querySelector('.flide-drawer-body')?.scrollTop ?? 0;
		this.drawerContent.clear();
		clearNode(drawer);

		// Header: back arrow + Go to file
		const head = append(drawer, $('.flide-drawer-head'));
		if (this.pinned) {
			this.iconButtonIn(head, Codicon.pinned, 'Unpin menu (Ctrl+B)', () => this.unpin());
		} else {
			this.iconButtonIn(head, Codicon.chevronLeft, 'Close menu', () => this.closeMenu());
		}
		const search = append(head, $('button.flide-search')) as HTMLButtonElement;
		search.type = 'button';
		append(search, renderIcon(Codicon.search));
		append(search, $('span')).textContent = 'Go to file';
		append(search, $('span.flide-kbd')).textContent = 'Ctrl+P';
		this.drawerContent.add(addDisposableListener(search, 'click', () => {
			if (!this.pinned) {
				this.closeMenu();
			}
			this.commandService.executeCommand('workbench.action.quickOpen');
		}));

		const body = append(drawer, $('.flide-drawer-body'));

		// Recent files
		const recent = this.recentFiles(6);
		if (recent.length) {
			append(body, $('.flide-section')).textContent = 'Recent';
			for (const uri of recent) {
				const folder = basename(dirname(uri.fsPath));
				this.item(body, Codicon.history, basename(uri.fsPath), folder, () => this.openFile(uri));
			}
		}

		// Project files
		const root = this.contextService.getWorkspace().folders[0];
		append(body, $('.flide-section')).textContent = root ? root.name : 'No folder open';
		if (root) {
			const tree = append(body, $('.flide-tree'));
			this.renderFolder(tree, root.uri, 0).then(() => { body.scrollTop = scrollTop; });
		} else {
			this.item(body, Codicon.folderOpened, 'Open a folder to see its files', undefined, () => this.runCommand('workbench.action.files.openFolder'));
		}

		// Footer
		const foot = append(drawer, $('.flide-drawer-foot'));
		this.item(foot, Codicon.folderOpened, 'Open folder…', 'Ctrl+O', () => this.runCommand('workbench.action.files.openFolder'));
		this.item(foot, Codicon.search, 'Search in files', 'Ctrl+Shift+F', () => this.runCommand('workbench.action.findInFiles'));
		this.item(foot, Codicon.settingsGear, 'Settings', 'Ctrl+,', () => this.runCommand('workbench.action.openSettings'));
		append(foot, $('.flide-version')).textContent = `FLIDE ${this.productService.version}`;
	}

	private async renderFolder(parent: HTMLElement, folder: URI, depth: number): Promise<void> {
		let children;
		try {
			children = (await this.fileService.resolve(folder)).children ?? [];
		} catch {
			return;
		}
		const active = EditorResourceAccessor.getOriginalUri(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY })?.toString();
		const sorted = children
			.filter(c => !HIDDEN_ENTRIES.has(c.name))
			.sort((a, b) => a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1);

		for (const child of sorted) {
			if (child.isDirectory) {
				const key = child.resource.toString();
				const open = this.expandedFolders.has(key);
				const row = this.item(parent, open ? Codicon.chevronDown : Codicon.chevronRight, child.name, undefined, () => {
					if (this.expandedFolders.has(key)) {
						this.expandedFolders.delete(key);
					} else {
						this.expandedFolders.add(key);
					}
					this.renderDrawer();
				}, depth);
				row.classList.add('is-folder');
				if (open) {
					await this.renderFolder(append(parent, $('.flide-tree-sub')), child.resource, depth + 1);
				}
			} else {
				const row = this.item(parent, Codicon.file, child.name, undefined, () => this.openFile(child.resource), depth);
				if (child.resource.toString() === active) {
					row.classList.add('is-active');
				}
			}
		}
	}

	private recentFiles(max: number): URI[] {
		const result: URI[] = [];
		const seen = new Set<string>();
		for (const input of this.historyService.getHistory()) {
			const uri = EditorResourceAccessor.getOriginalUri(input, { supportSideBySide: SideBySideEditor.PRIMARY });
			if (!uri || uri.scheme !== Schemas.file || seen.has(uri.toString())) {
				continue;
			}
			seen.add(uri.toString());
			result.push(uri);
			if (result.length >= max) {
				break;
			}
		}
		return result;
	}

	private item(parent: HTMLElement, icon: ThemeIcon, label: string, detail: string | undefined, onClick: () => void, depth = 0): HTMLElement {
		const row = append(parent, $('button.flide-item')) as HTMLButtonElement;
		row.type = 'button';
		row.style.paddingLeft = `${10 + depth * 14}px`;
		append(row, renderIcon(icon));
		append(row, $('span.flide-item-label')).textContent = label;
		if (detail) {
			append(row, $('span.flide-item-detail')).textContent = detail;
		}
		this.drawerContent.add(addDisposableListener(row, 'click', () => onClick()));
		return row;
	}

	private iconButtonIn(parent: HTMLElement, icon: ThemeIcon, label: string, onClick: () => void): HTMLElement {
		const button = append(parent, $('button.flide-icon-btn')) as HTMLButtonElement;
		button.type = 'button';
		button.title = label;
		button.setAttribute('aria-label', label);
		append(button, renderIcon(icon));
		this.drawerContent.add(addDisposableListener(button, 'click', () => onClick()));
		return button;
	}

	private openFile(uri: URI): void {
		if (!this.pinned) {
			this.closeMenu();
		}
		this.editorService.openEditor({ resource: uri, options: { pinned: true } });
	}

	private runCommand(id: string): void {
		if (this.pinned && id === 'workbench.action.findInFiles') {
			this.unpin(); // search uses the side bar itself
		} else if (!this.pinned) {
			this.closeMenu();
		}
		this.commandService.executeCommand(id);
	}

	//#endregion

	//#region Run / Stop + terminal sheet

	async runOrStop(): Promise<void> {
		if (this.running && this.runInstance) {
			this.runInstance.dispose(); // Stop
			return;
		}

		const uri = EditorResourceAccessor.getOriginalUri(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
		if (!uri || uri.scheme !== Schemas.file) {
			this.notificationService.info('Open a saved file to run it.');
			return;
		}

		if (this.configurationService.getValue<boolean>('flide.run.saveBeforeRun') !== false) {
			await this.commandService.executeCommand('workbench.action.files.save');
		}

		const file = uri.fsPath;
		const ext = extname(file).toLowerCase();
		const userCommands = this.configurationService.getValue<Record<string, string>>('flide.run.commands') ?? {};
		const template = userCommands[ext] ?? FLIDE_DEFAULT_RUN_COMMANDS[ext];
		if (!template) {
			this.notificationService.info(`No Run command for ${ext || 'this'} files yet. Add one in Settings › FLIDE › Run commands.`);
			return;
		}

		const dir = dirname(file);
		const command = template
			.replace(/\{file\}/g, file)
			.replace(/\{dir\}/g, dir)
			.replace(/\{name\}/g, basename(file, ext));

		this.runInstance?.dispose(); // one run terminal at a time

		const instance = await this.terminalService.createTerminal({
			config: {
				name: `Run · ${basename(file)}`,
				executable: isWindows ? 'cmd.exe' : '/bin/sh',
				args: isWindows ? `/d /s /c "${command}"` : ['-c', command],
				cwd: dir,
				waitOnExit: (code: number) => `\r\n\x1b[90mstopped · exit code ${code}\x1b[0m\r\n`,
			}
		});

		this.runInstance = instance;
		this.setRunning(true);
		const onExit = instance.onExit(() => {
			onExit.dispose();
			if (this.runInstance === instance) {
				this.setRunning(false);
			}
		});
		const onDisposed = instance.onDisposed(() => {
			onDisposed.dispose();
			if (this.runInstance === instance) {
				this.runInstance = undefined;
				this.setRunning(false);
			}
		});

		if (this.configurationService.getValue<boolean>('flide.run.openTerminal') !== false) {
			this.terminalService.setActiveInstance(instance);
			await this.showTerminal();
		}
	}

	async toggleTerminal(): Promise<void> {
		if (this.layoutService.isVisible(Parts.PANEL_PART)) {
			this.layoutService.setPartHidden(true, Parts.PANEL_PART);
			return;
		}
		if (this.terminalService.instances.length === 0) {
			await this.terminalService.createTerminal();
		}
		await this.showTerminal();
	}

	private async showTerminal(): Promise<void> {
		if (!this.pinned) {
			this.closeMenu();
		}
		await this.terminalService.revealActiveTerminal();
		// The sheet covers most of the editor (design: 88%)
		const share = Math.min(100, Math.max(40, this.configurationService.getValue<number>('flide.terminal.width') ?? 88)) / 100;
		try {
			const current = this.layoutService.getSize(Parts.PANEL_PART);
			this.layoutService.setSize(Parts.PANEL_PART, { width: Math.round(getWindow(this.bar).innerWidth * share), height: current.height });
		} catch {
			// layout not ready; keep the default size
		}
	}

	private setRunning(running: boolean): void {
		this.running = running;
		this.runButton.classList.toggle('is-running', running);
		clearNode(this.runIcon);
		append(this.runIcon, renderIcon(running ? Codicon.debugStop : Codicon.play));
		this.runLabel.textContent = running ? 'Stop' : 'Run';
		this.runButton.title = running ? 'Stop (F5)' : 'Run (F5)';
		this.terminalButton.classList.toggle('has-dot', running);
		ipcRenderer.send('vscode:flide-running', running);
	}

	//#endregion
}
