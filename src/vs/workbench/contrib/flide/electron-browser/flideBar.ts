/*---------------------------------------------------------------------------------------------
 *  FLIDE — the single bar: ☰ menu · file name · Run/Stop · terminal · bubble · hide.
 *  Also owns the menu drawer (slides in over the editor) and the Run/Stop controller.
 *--------------------------------------------------------------------------------------------*/

import './media/flide.css';
import { $, addDisposableListener, append, clearNode, getWindow } from '../../../../base/browser/dom.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { basename as resBasename, dirname as resDirname, joinPath, relativePath } from '../../../../base/common/resources.js';
import { escapeRegExpCharacters } from '../../../../base/common/strings.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../editor/browser/services/bulkEditService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { IAction, SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { getFlatContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ResourceContextKey } from '../../../common/contextkeys.js';
import { IWorkingCopyFileService } from '../../../services/workingCopy/common/workingCopyFileService.js';
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
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
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

interface SearchHitRow { line: number; start: number; end: number; pre: string; hit: string; post: string }

interface SearchResults {
	files: { uri: URI; pre: string; hit: string; post: string; dir: string }[];
	groups: { uri: URI; name: string; count: number; rows: SearchHitRow[] }[];
	total: number;
	fileCount: number;
	invalid: boolean;
}

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
	private readonly menuSearch = { open: false, mode: 'text' as 'text' | 'files', q: '', mc: false, ww: false, rx: false, replace: false, replaceWith: '' };
	private creating: 'file' | 'folder' | undefined;
	private createDraft = '';
	private createParent: URI | undefined;
	private fileClipboard: { uris: URI[]; cut: boolean } | undefined;
	private readonly newEntries = new Set<string>();
	private fileIndex: { uri: URI; size: number }[] | undefined;
	private searchSeq = 0;
	private searchResults: SearchResults | undefined;
	private drawerBody: HTMLElement | undefined;
	private searchPanel: HTMLElement | undefined;
	private searchInput: HTMLInputElement | undefined;
	private searchBox: HTMLElement | undefined;
	private replaceRow: HTMLElement | undefined;
	private replaceInput: HTMLInputElement | undefined;
	private replaceToggle: HTMLElement | undefined;
	private summaryEl: HTMLElement | undefined;
	private searchSegButtons: HTMLButtonElement[] = [];
	private searchOptButtons: HTMLButtonElement[] = [];
	private headButtons: { file?: HTMLElement; folder?: HTMLElement; search?: HTMLElement } = {};
	private readonly searchScheduler = this._register(new RunOnceScheduler(() => this.runSearch(), 200));
	private readonly treeRefresh = this._register(new RunOnceScheduler(() => {
		if (this.drawer && !this.menuSearch.open && !this.creating) {
			this.renderDrawerBody();
		}
	}, 200));

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
		@INotificationService private readonly notificationService: INotificationService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IBulkEditService private readonly bulkEditService: IBulkEditService,
		@IDialogService private readonly dialogService: IDialogService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IWorkingCopyFileService private readonly workingCopyFileService: IWorkingCopyFileService,
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

		this._register(this.fileService.onDidFilesChange(() => {
			this.fileIndex = undefined;
			this.treeRefresh.schedule();
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

	/** Ctrl+Shift+F (In files) / Ctrl+P (File names): open the menu straight into search. */
	openSearch(mode: 'text' | 'files'): void {
		if (!this.drawer) {
			this.openMenu();
		}
		this.toggleSearch(true, mode);
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
		const drawer = this.drawer = append(host, $('.flide-drawer'));
		this.menuButton.classList.add('is-active');
		this.menuButton.classList.toggle('is-pinned', this.pinned);

		if (this.pinned) {
			// Sit exactly on the reserved side bar area and follow its size (also when dragging its edge)
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
		this.buildDrawer(drawer);
		this.renderDrawer();
	}

	closeMenu(): void {
		this.searchScheduler.cancel();
		this.menuListeners.clear();
		this.drawerContent.clear();
		this.drawer?.remove();
		this.dim?.remove();
		this.drawer = undefined;
		this.dim = undefined;
		this.drawerBody = this.searchPanel = this.searchInput = this.searchBox = this.replaceRow = this.replaceToggle = this.summaryEl = undefined;
		this.searchSegButtons = [];
		this.searchOptButtons = [];
		this.headButtons = {};
		this.menuSearch.open = false;
		this.creating = undefined;
		this.menuButton.classList.remove('is-active', 'is-pinned');
	}

	/** The parts of the drawer that stay put while typing: header icons, search box, footer. */
	private buildDrawer(drawer: HTMLElement): void {
		const store = this.menuListeners;
		const root = this.contextService.getWorkspace().folders[0];

		// Header: project name + New file · New folder · Search
		const head = append(drawer, $('.flide-drawer-head'));
		if (this.pinned) {
			this.iconButtonIn(head, Codicon.pinned, 'Unpin menu (Ctrl+B)', () => this.unpin(), store);
		}
		append(head, $('span.flide-proj')).textContent = root ? root.name : 'No folder open';
		this.headButtons.file = this.iconButtonIn(head, Codicon.newFile, 'New file', () => this.startCreate('file'), store);
		this.headButtons.folder = this.iconButtonIn(head, Codicon.newFolder, 'New folder', () => this.startCreate('folder'), store);
		this.headButtons.search = this.iconButtonIn(head, Codicon.search, 'Search (Ctrl+Shift+F)', () => this.toggleSearch(), store);
		if (!root) {
			(this.headButtons.file as HTMLButtonElement).disabled = true;
			(this.headButtons.folder as HTMLButtonElement).disabled = true;
		}

		// Search panel (shown when the search icon is on)
		const panel = this.searchPanel = append(drawer, $('.flide-search-panel'));
		const seg = append(panel, $('.flide-seg.is-full'));
		for (const [mode, label] of [['text', 'In files'], ['files', 'File names']] as const) {
			const b = append(seg, $('button')) as HTMLButtonElement;
			b.type = 'button';
			b.textContent = label;
			b.dataset.mode = mode;
			store.add(addDisposableListener(b, 'click', () => {
				this.menuSearch.mode = mode;
				if (mode === 'files') {
					this.menuSearch.replace = false;
				}
				this.renderSearchChrome();
				this.runSearch();
				this.searchInput?.focus();
			}));
			this.searchSegButtons.push(b);
		}

		const row = append(panel, $('.flide-srow'));
		this.replaceToggle = this.iconButtonIn(row, Codicon.chevronRight, 'Toggle replace', () => {
			this.menuSearch.replace = !this.menuSearch.replace;
			this.renderSearchChrome();
			if (this.menuSearch.replace) {
				this.replaceInput?.focus();
			}
		}, store);
		this.replaceToggle.classList.add('flide-replace-toggle');

		const col = append(row, $('.flide-scol'));
		const box = this.searchBox = append(col, $('label.flide-sbox'));
		const input = this.searchInput = append(box, $('input')) as HTMLInputElement;
		input.type = 'text';
		input.value = this.menuSearch.q;
		input.setAttribute('aria-label', 'Search');
		store.add(addDisposableListener(input, 'input', () => {
			this.menuSearch.q = input.value;
			this.searchScheduler.schedule();
		}));
		store.add(addDisposableListener(input, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				this.toggleSearch(false);
			} else if (e.key === 'Enter') {
				this.openFirstResult();
			}
		}));
		for (const [key, label, title] of [['mc', 'Aa', 'Match case'], ['ww', 'ab', 'Whole word'], ['rx', '.*', 'Regular expression']] as const) {
			const b = append(box, $('button.flide-sopt')) as HTMLButtonElement;
			b.type = 'button';
			b.textContent = label;
			b.title = title;
			b.setAttribute('aria-label', title);
			b.dataset.opt = key;
			store.add(addDisposableListener(b, 'click', e => {
				e.preventDefault();
				this.menuSearch[key] = !this.menuSearch[key];
				this.renderSearchChrome();
				this.runSearch();
			}));
			this.searchOptButtons.push(b);
		}

		const replaceRow = this.replaceRow = append(col, $('.flide-replace-row'));
		const replaceInput = this.replaceInput = append(replaceRow, $('input')) as HTMLInputElement;
		replaceInput.type = 'text';
		replaceInput.placeholder = 'Replace';
		replaceInput.value = this.menuSearch.replaceWith;
		replaceInput.setAttribute('aria-label', 'Replace');
		store.add(addDisposableListener(replaceInput, 'input', () => { this.menuSearch.replaceWith = replaceInput.value; }));
		store.add(addDisposableListener(replaceInput, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				this.toggleSearch(false);
			} else if (e.key === 'Enter') {
				this.replaceAll();
			}
		}));
		this.iconButtonIn(replaceRow, Codicon.replaceAll, 'Replace all', () => this.replaceAll(), store);

		this.summaryEl = append(panel, $('span.flide-summary'));

		this.drawerBody = append(drawer, $('.flide-drawer-body'));

		// Footer
		const foot = append(drawer, $('.flide-drawer-foot'));
		this.item(foot, Codicon.folderOpened, 'Open folder…', () => this.runCommand('workbench.action.files.openFolder'), { detail: 'Ctrl+O', store });
		this.item(foot, Codicon.settingsGear, 'Settings', () => this.runCommand('workbench.action.openSettings'), { detail: 'Ctrl+,', store });
	}

	private renderDrawer(): void {
		this.renderSearchChrome();
		this.renderDrawerBody();
	}

	private renderSearchChrome(): void {
		const s = this.menuSearch;
		this.headButtons.search?.classList.toggle('is-active', s.open);
		this.headButtons.file?.classList.toggle('is-active', this.creating === 'file');
		this.headButtons.folder?.classList.toggle('is-active', this.creating === 'folder');
		if (!this.searchPanel || !this.searchInput || !this.searchBox || !this.replaceRow || !this.replaceToggle || !this.summaryEl) {
			return;
		}
		this.searchPanel.style.display = s.open ? '' : 'none';
		for (const b of this.searchSegButtons) {
			const on = b.dataset.mode === s.mode;
			b.classList.toggle('is-on', on);
			b.setAttribute('aria-pressed', String(on));
		}
		const textMode = s.mode === 'text';
		this.replaceToggle.style.display = textMode ? '' : 'none';
		this.replaceToggle.classList.toggle('is-open', s.replace);
		for (const b of this.searchOptButtons) {
			const on = !!s[b.dataset.opt as 'mc' | 'ww' | 'rx'];
			b.style.display = textMode ? '' : 'none';
			b.classList.toggle('is-on', on);
			b.setAttribute('aria-pressed', String(on));
		}
		this.replaceRow.style.display = textMode && s.replace ? '' : 'none';
		this.searchInput.placeholder = textMode ? 'Search  (Ctrl+Shift+F)' : 'Go to file  (Ctrl+P)';
		const invalid = !!this.searchResults?.invalid;
		this.searchBox.classList.toggle('is-invalid', invalid);
		this.summaryEl.classList.toggle('is-invalid', invalid);
		this.summaryEl.textContent = this.summaryText();
	}

	private summaryText(): string {
		const s = this.menuSearch;
		const r = this.searchResults;
		const root = this.contextService.getWorkspace().folders[0];
		const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
		if (!root) {
			return 'Open a folder to search it';
		}
		if (r?.invalid) {
			return 'Invalid regular expression';
		}
		if (!s.q) {
			return s.mode === 'text' ? `Search inside every file in ${root.name}` : 'Find a file by name';
		}
		if (!r) {
			return 'Searching…';
		}
		if (r.total === 0) {
			return 'No results';
		}
		return s.mode === 'files' ? plural(r.total, 'file') : `${plural(r.total, 'result')} in ${plural(r.fileCount, 'file')}`;
	}

	private renderDrawerBody(): void {
		const body = this.drawerBody;
		if (!body) {
			return;
		}
		const scrollTop = body.scrollTop;
		this.drawerContent.clear();
		clearNode(body);

		if (this.menuSearch.open) {
			this.renderResults(body);
			return;
		}
		if (this.creating) {
			this.renderCreateBox(body);
		}
		const root = this.contextService.getWorkspace().folders[0];
		if (root) {
			const tree = append(body, $('.flide-tree'));
			this.drawerContent.add(addDisposableListener(body, 'contextmenu', (e: MouseEvent) => {
				if (e.target === body || e.target === tree) {
					this.showResourceMenu(e, root.uri, true);
				}
			}));
			this.renderFolder(tree, root.uri, 0).then(() => { body.scrollTop = scrollTop; });
		} else {
			this.item(body, Codicon.folderOpened, 'Open a folder to see its files', () => this.runCommand('workbench.action.files.openFolder'));
		}
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
			const key = child.resource.toString();
			const isNew = this.newEntries.has(key);
			if (child.isDirectory) {
				const open = this.expandedFolders.has(key);
				const row = this.item(parent, open ? Codicon.chevronDown : Codicon.chevronRight, child.name, () => {
					if (this.expandedFolders.has(key)) {
						this.expandedFolders.delete(key);
					} else {
						this.expandedFolders.add(key);
					}
					this.renderDrawerBody();
				}, { depth, isNew, resource: child.resource, isFolder: true });
				row.classList.add('is-folder');
				if (open) {
					await this.renderFolder(append(parent, $('.flide-tree-sub')), child.resource, depth + 1);
				}
			} else {
				const row = this.item(parent, Codicon.file, child.name, () => this.openFile(child.resource), { depth, isNew, resource: child.resource, isFolder: false });
				if (key === active) {
					row.classList.add('is-active');
				}
			}
		}
	}

	//#endregion


	//#region Menu: new file / folder

	private startCreate(kind: 'file' | 'folder', parent?: URI): void {
		this.menuSearch.open = false;
		this.creating = this.creating === kind && !parent ? undefined : kind;
		this.createParent = parent;
		if (parent) {
			this.expandedFolders.add(parent.toString());
		}
		this.createDraft = '';
		this.renderDrawer();
	}

	private renderCreateBox(body: HTMLElement): void {
		const kind = this.creating;
		const box = append(body, $('.flide-create'));
		append(box, renderIcon(kind === 'folder' ? Codicon.folder : Codicon.file));
		const input = append(box, $('input')) as HTMLInputElement;
		input.type = 'text';
		input.value = this.createDraft;
		input.placeholder = kind === 'folder' ? 'Folder name' : 'File name, e.g. main.py';
		input.setAttribute('aria-label', input.placeholder);
		this.drawerContent.add(addDisposableListener(input, 'input', () => { this.createDraft = input.value; }));
		this.drawerContent.add(addDisposableListener(input, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				this.confirmCreate();
			} else if (e.key === 'Escape') {
				e.stopPropagation();
				this.creating = undefined;
				this.renderDrawer();
			}
		}));
		const ok = append(box, $('button.flide-create-ok')) as HTMLButtonElement;
		ok.type = 'button';
		ok.title = 'Create';
		ok.setAttribute('aria-label', 'Create');
		append(ok, renderIcon(Codicon.check));
		this.drawerContent.add(addDisposableListener(ok, 'click', () => this.confirmCreate()));
		const cancel = append(box, $('button.flide-create-cancel')) as HTMLButtonElement;
		cancel.type = 'button';
		cancel.title = 'Cancel';
		cancel.setAttribute('aria-label', 'Cancel');
		append(cancel, renderIcon(Codicon.close));
		this.drawerContent.add(addDisposableListener(cancel, 'click', () => { this.creating = undefined; this.renderDrawer(); }));
		const rootUri = this.contextService.getWorkspace().folders[0]?.uri;
		const where = this.createParent && rootUri ? relativePath(rootUri, this.createParent) : '';
		append(body, $('span.flide-create-hint')).textContent = `${where ? `In ${where} · ` : ''}Enter to create · Esc to cancel`;
		input.focus();
	}

	private async confirmCreate(): Promise<void> {
		const kind = this.creating;
		const root = this.contextService.getWorkspace().folders[0];
		const name = this.createDraft.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
		if (!kind || !root || !name) {
			return;
		}
		const parts = name.split('/').filter(Boolean);
		if (/[<>:"|?*\u0000-\u001f]/.test(name) || parts.some(p => p === '..' || p === '.')) {
			this.notificationService.warn(`"${name}" can't be used as a ${kind} name.`);
			return;
		}
		const target = joinPath(this.createParent ?? root.uri, ...parts);
		try {
			if (await this.fileService.exists(target)) {
				this.notificationService.info(`${name} already exists.`);
				return;
			}
			if (kind === 'folder') {
				await this.fileService.createFolder(target);
				this.expandedFolders.add(target.toString()); // new folders open automatically
			} else {
				await this.fileService.createFile(target, VSBuffer.fromString(''));
			}
			// open the folders on the way to it
			for (let p = resDirname(target); p.path.length > root.uri.path.length; p = resDirname(p)) {
				this.expandedFolders.add(p.toString());
			}
			this.newEntries.add(target.toString());
			this.creating = undefined;
			this.createParent = undefined;
			this.createDraft = '';
			this.fileIndex = undefined;
			this.renderDrawer();
			if (kind === 'file') {
				await this.editorService.openEditor({ resource: target, options: { pinned: true } });
			}
		} catch (err) {
			this.notificationService.error(`Could not create ${name}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	//#endregion

	//#region Menu: search & replace

	private toggleSearch(force?: boolean, mode?: 'text' | 'files'): void {
		const s = this.menuSearch;
		s.open = force ?? !s.open;
		if (mode) {
			s.mode = mode;
			if (mode === 'files') {
				s.replace = false;
			}
		}
		if (s.open) {
			this.creating = undefined;
		}
		this.renderDrawer();
		if (s.open) {
			this.searchInput?.focus();
			this.searchInput?.select();
			if (s.q) {
				this.runSearch();
			}
		}
	}

	private buildRegex(): RegExp | 'invalid' | undefined {
		const s = this.menuSearch;
		if (!s.q) {
			return undefined;
		}
		const text = s.mode === 'text';
		let source = text && s.rx ? s.q : escapeRegExpCharacters(s.q);
		if (text && s.ww) {
			source = `\\b(?:${source})\\b`;
		}
		try {
			return new RegExp(source, text && s.mc ? 'g' : 'gi');
		} catch {
			return 'invalid';
		}
	}

	private async getFileIndex(): Promise<{ uri: URI; size: number }[]> {
		if (this.fileIndex) {
			return this.fileIndex;
		}
		const root = this.contextService.getWorkspace().folders[0];
		if (!root) {
			return [];
		}
		const result: { uri: URI; size: number }[] = [];
		const queue: URI[] = [root.uri];
		while (queue.length && result.length < 5000) {
			const batch = queue.splice(0, 16);
			const stats = await Promise.all(batch.map(uri => this.fileService.resolve(uri, { resolveMetadata: true }).catch(() => undefined)));
			for (const stat of stats) {
				for (const child of stat?.children ?? []) {
					if (HIDDEN_ENTRIES.has(child.name)) {
						continue;
					}
					if (child.isDirectory) {
						queue.push(child.resource);
					} else {
						result.push({ uri: child.resource, size: (child as { size?: number }).size ?? 0 });
					}
				}
			}
		}
		result.sort((a, b) => a.uri.path.localeCompare(b.uri.path));
		this.fileIndex = result;
		return result;
	}

	private async runSearch(): Promise<void> {
		const seq = ++this.searchSeq;
		const s = this.menuSearch;
		const re = this.buildRegex();
		if (re === 'invalid') {
			this.searchResults = { files: [], groups: [], total: 0, fileCount: 0, invalid: true };
			this.renderDrawer();
			return;
		}
		if (!re) {
			this.searchResults = undefined;
			this.renderDrawer();
			return;
		}
		this.searchResults = undefined;
		this.renderSearchChrome();

		const index = await this.getFileIndex();
		if (seq !== this.searchSeq) {
			return;
		}
		const root = this.contextService.getWorkspace().folders[0]?.uri;
		const results: SearchResults = { files: [], groups: [], total: 0, fileCount: 0, invalid: false };

		if (s.mode === 'files') {
			for (const f of index) {
				const name = resBasename(f.uri);
				re.lastIndex = 0;
				const m = re.exec(name);
				if (!m || !m[0].length) {
					continue;
				}
				results.total++;
				if (results.files.length < 200) {
					results.files.push({
						uri: f.uri,
						pre: name.slice(0, m.index), hit: m[0], post: name.slice(m.index + m[0].length),
						dir: root ? (relativePath(root, resDirname(f.uri)) ?? '') : ''
					});
				}
			}
			results.fileCount = results.total;
		} else {
			for (const f of index) {
				if (f.size > 1_000_000) {
					continue;
				}
				let text: string;
				try {
					text = (await this.fileService.readFile(f.uri)).value.toString();
				} catch {
					continue;
				}
				if (seq !== this.searchSeq) {
					return;
				}
				if (text.indexOf('\u0000') !== -1) {
					continue; // binary file
				}
				const { count, rows } = this.matchLines(text, re, 6);
				if (!count) {
					continue;
				}
				results.total += count;
				results.fileCount++;
				results.groups.push({ uri: f.uri, name: root ? (relativePath(root, f.uri) ?? resBasename(f.uri)) : resBasename(f.uri), count, rows });
				if (results.total >= 2000) {
					break;
				}
			}
		}
		if (seq !== this.searchSeq) {
			return;
		}
		this.searchResults = results;
		this.renderDrawer();
	}

	private matchLines(text: string, re: RegExp, maxRows: number): { count: number; rows: SearchHitRow[] } {
		const rows: SearchHitRow[] = [];
		let count = 0;
		const lines = text.split(/\r?\n/);
		for (let i = 0; i < lines.length && count < 1000; i++) {
			const line = lines[i];
			re.lastIndex = 0;
			let m: RegExpExecArray | null;
			while ((m = re.exec(line))) {
				if (!m[0].length) {
					re.lastIndex++;
					if (re.lastIndex > line.length) {
						break;
					}
					continue;
				}
				count++;
				if (rows.length < maxRows) {
					const start = m.index;
					const end = start + m[0].length;
					rows.push({
						line: i + 1, start, end,
						pre: (start > 28 ? '…' : '') + line.slice(Math.max(0, start - 28), start).trimStart(),
						hit: m[0],
						post: line.slice(end, end + 90)
					});
				}
			}
		}
		return { count, rows };
	}

	private renderResults(body: HTMLElement): void {
		const r = this.searchResults;
		if (!r || r.invalid) {
			return;
		}
		const highlight = (parent: HTMLElement, pre: string, hit: string, post: string) => {
			const text = append(parent, $('span.flide-hit-text'));
			text.append(pre);
			append(text, $('mark')).textContent = hit;
			text.append(post);
		};
		if (this.menuSearch.mode === 'files') {
			for (const h of r.files) {
				const row = append(body, $('button.flide-hit')) as HTMLButtonElement;
				row.type = 'button';
				append(row, renderIcon(Codicon.file));
				highlight(row, h.pre, h.hit, h.post);
				if (h.dir) {
					append(row, $('span.flide-hit-dir')).textContent = h.dir;
				}
				this.drawerContent.add(addDisposableListener(row, 'click', () => this.openFile(h.uri)));
			}
			return;
		}
		for (const g of r.groups) {
			const group = append(body, $('.flide-hit-group'));
			const head = append(group, $('.flide-hit-head'));
			append(head, renderIcon(Codicon.file));
			append(head, $('span.flide-hit-file')).textContent = g.name;
			append(head, $('span.flide-count')).textContent = String(g.count);
			for (const row of g.rows) {
				const b = append(group, $('button.flide-hit-line')) as HTMLButtonElement;
				b.type = 'button';
				b.title = `${g.name}:${row.line}`;
				append(b, $('span.flide-hit-ln')).textContent = String(row.line);
				highlight(b, row.pre, row.hit, row.post);
				this.drawerContent.add(addDisposableListener(b, 'click', () => this.openAt(g.uri, row)));
			}
			if (g.count > g.rows.length) {
				append(group, $('span.flide-hit-more')).textContent = `+ ${g.count - g.rows.length} more in this file`;
			}
		}
	}

	private openFirstResult(): void {
		const r = this.searchResults;
		if (!r) {
			return;
		}
		if (this.menuSearch.mode === 'files' && r.files[0]) {
			this.openFile(r.files[0].uri);
		} else if (r.groups[0]?.rows[0]) {
			this.openAt(r.groups[0].uri, r.groups[0].rows[0]);
		}
	}

	private openAt(uri: URI, row: SearchHitRow): void {
		if (!this.pinned) {
			this.closeMenu();
		}
		this.editorService.openEditor({
			resource: uri,
			options: {
				pinned: true,
				selection: { startLineNumber: row.line, startColumn: row.start + 1, endLineNumber: row.line, endColumn: row.end + 1 }
			}
		});
	}

	private async replaceAll(): Promise<void> {
		const s = this.menuSearch;
		const re = this.buildRegex();
		if (s.mode !== 'text' || !re || re === 'invalid') {
			return;
		}
		const single = new RegExp(re.source, re.flags.replace('g', ''));
		const edits: ResourceTextEdit[] = [];
		let files = 0;
		for (const f of await this.getFileIndex()) {
			if (f.size > 1_000_000) {
				continue;
			}
			let text: string;
			try {
				text = (await this.fileService.readFile(f.uri)).value.toString();
			} catch {
				continue;
			}
			if (text.indexOf('\u0000') !== -1) {
				continue;
			}
			let touched = false;
			text.split(/\r?\n/).forEach((line, i) => {
				re.lastIndex = 0;
				let m: RegExpExecArray | null;
				while ((m = re.exec(line))) {
					if (!m[0].length) {
						re.lastIndex++;
						if (re.lastIndex > line.length) {
							break;
						}
						continue;
					}
					const replacement = s.rx ? m[0].replace(single, s.replaceWith) : s.replaceWith;
					edits.push(new ResourceTextEdit(f.uri, { range: new Range(i + 1, m.index + 1, i + 1, m.index + m[0].length + 1), text: replacement }));
					touched = true;
				}
			});
			if (touched) {
				files++;
			}
		}
		if (!edits.length) {
			this.notificationService.info('Nothing to replace.');
			return;
		}
		const { confirmed } = await this.dialogService.confirm({
			message: `Replace ${edits.length} match${edits.length === 1 ? '' : 'es'} in ${files} file${files === 1 ? '' : 's'}?`,
			detail: `"${s.q}"  →  "${s.replaceWith}"`,
			primaryButton: 'Replace all'
		});
		if (!confirmed) {
			return;
		}
		await this.bulkEditService.apply(edits, { label: 'FLIDE: Replace all' });
		this.runSearch();
	}

	//#endregion

	//#region Menu: small building blocks

	private item(parent: HTMLElement, icon: ThemeIcon, label: string, onClick: () => void, opts: { detail?: string; depth?: number; isNew?: boolean; store?: DisposableStore; resource?: URI; isFolder?: boolean } = {}): HTMLElement {
		const row = append(parent, $('button.flide-item')) as HTMLButtonElement;
		row.type = 'button';
		row.style.paddingLeft = `${10 + (opts.depth ?? 0) * 14}px`;
		append(row, renderIcon(icon));
		append(row, $('span.flide-item-label')).textContent = label;
		if (opts.isNew) {
			append(row, $('span.flide-new')).textContent = 'new';
		}
		if (opts.detail) {
			append(row, $('span.flide-item-detail')).textContent = opts.detail;
		}
		(opts.store ?? this.drawerContent).add(addDisposableListener(row, 'click', () => onClick()));
		const resource = opts.resource;
		if (resource) {
			(opts.store ?? this.drawerContent).add(addDisposableListener(row, 'contextmenu', (e: MouseEvent) => this.showResourceMenu(e, resource, !!opts.isFolder)));
		}
		return row;
	}

	private iconButtonIn(parent: HTMLElement, icon: ThemeIcon, label: string, onClick: () => void, store: DisposableStore): HTMLElement {
		const button = append(parent, $('button.flide-icon-btn')) as HTMLButtonElement;
		button.type = 'button';
		button.title = label;
		button.setAttribute('aria-label', label);
		append(button, renderIcon(icon));
		store.add(addDisposableListener(button, 'click', e => { e.preventDefault(); onClick(); }));
		return button;
	}

	private openFile(uri: URI): void {
		if (!this.pinned) {
			this.closeMenu();
		}
		this.editorService.openEditor({ resource: uri, options: { pinned: true } });
	}

	private runCommand(id: string): void {
		if (!this.pinned) {
			this.closeMenu();
		}
		this.commandService.executeCommand(id);
	}

	//#endregion

	//#region Menu: right-click = VS Code's own Explorer context menu

	/**
	 * Shows the real Explorer context menu (same items, order, shortcuts and extension entries) for a
	 * file or folder in the FLIDE menu. Explorer-only commands (they act on the hidden Explorer view's
	 * selection) are routed to the clicked item; everything else runs as-is with the item as argument.
	 */
	private showResourceMenu(e: MouseEvent, resource: URI, isFolder: boolean): void {
		e.preventDefault();
		e.stopPropagation();
		const root = this.contextService.getWorkspace().folders[0];
		const isRoot = !!root && root.uri.toString() === resource.toString();
		const scoped = this.contextKeyService.createScoped(this.drawer ?? this.bar);

		ResourceContextKey.Resource.bindTo(scoped).set(resource.toString());
		ResourceContextKey.HasResource.bindTo(scoped).set(true);
		ResourceContextKey.Scheme.bindTo(scoped).set(resource.scheme);
		ResourceContextKey.Filename.bindTo(scoped).set(resBasename(resource));
		ResourceContextKey.Dirname.bindTo(scoped).set(resDirname(resource).fsPath);
		ResourceContextKey.Path.bindTo(scoped).set(resource.fsPath);
		ResourceContextKey.Extension.bindTo(scoped).set(isFolder ? '' : extname(resource.fsPath));
		ResourceContextKey.LangId.bindTo(scoped).set(isFolder ? '' : (this.languageService.guessLanguageIdByFilepathOrFirstLine(resource) ?? ''));
		ResourceContextKey.IsFileSystemResource.bindTo(scoped).set(true);

		const explorerKeys: Record<string, boolean | string> = {
			explorerViewletVisible: true,
			explorerViewletFocus: true,
			filesExplorerFocus: true,
			explorerResourceIsFolder: isFolder,
			explorerResourceIsRoot: isRoot,
			explorerResourceReadonly: false,
			explorerResourceParentReadonly: false,
			explorerResourceCut: !!this.fileClipboard?.cut && this.fileClipboard.uris.some(u => u.toString() === resource.toString()),
			explorerResourceMoveableToTrash: true,
			explorerResourceAvailableEditorIds: '',
			fileCopied: !!this.fileClipboard,
		};
		for (const [key, value] of Object.entries(explorerKeys)) {
			scoped.createKey(key, value);
		}

		const groups = this.menuService.getMenuActions(MenuId.ExplorerContext, scoped, { arg: resource, shouldForwardArgs: true });
		const actions = this.routeExplorerActions(getFlatContextMenuActions(groups), resource, isFolder);
		this.contextMenuService.showContextMenu({
			getAnchor: () => new StandardMouseEvent(getWindow(this.bar), e),
			getActions: () => actions,
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
			onHide: () => scoped.dispose(),
		});
	}

	private routeExplorerActions(actions: readonly IAction[], resource: URI, isFolder: boolean): IAction[] {
		const folder = isFolder ? resource : resDirname(resource);
		const handlers: Record<string, () => unknown> = {
			'explorer.newFile': () => this.startCreate('file', folder),
			'explorer.newFolder': () => this.startCreate('folder', folder),
			'renameFile': () => this.renameResource(resource),
			'moveFileToTrash': () => this.deleteResource(resource, true),
			'deleteFile': () => this.deleteResource(resource, false),
			'filesExplorer.cut': () => { this.fileClipboard = { uris: [resource], cut: true }; },
			'filesExplorer.copy': () => { this.fileClipboard = { uris: [resource], cut: false }; },
			'filesExplorer.paste': () => this.pasteInto(folder),
			'explorer.openToSide': () => this.editorService.openEditor({ resource, options: { pinned: true } }, SIDE_GROUP),
			'filesExplorer.findInFolder': () => this.toggleSearch(true, 'text'),
		};
		return actions.map(action => {
			if (action instanceof SubmenuAction) {
				return new SubmenuAction(action.id, action.label, this.routeExplorerActions(action.actions, resource, isFolder), action.class);
			}
			const handler = handlers[action.id];
			return handler ? toAction({ id: action.id, label: action.label, enabled: action.enabled, run: () => handler() }) : action;
		});
	}

	private async renameResource(resource: URI): Promise<void> {
		const name = resBasename(resource);
		const dot = name.lastIndexOf('.');
		const newName = await this.quickInputService.input({
			title: `Rename ${name}`,
			value: name,
			valueSelection: [0, dot > 0 ? dot : name.length],
			prompt: 'New name (Enter to rename, Esc to cancel)',
			validateInput: async value => {
				const v = value.trim();
				if (!v) {
					return 'Enter a name.';
				}
				return /[<>:"|?*\\/\u0000-\u001f]/.test(v) ? 'That name isn\'t allowed.' : undefined;
			}
		});
		const next = newName?.trim();
		if (!next || next === name) {
			return;
		}
		const target = joinPath(resDirname(resource), next);
		try {
			await this.workingCopyFileService.move([{ file: { source: resource, target } }], CancellationToken.None);
			if (this.expandedFolders.delete(resource.toString())) {
				this.expandedFolders.add(target.toString());
			}
		} catch (err) {
			this.notificationService.error(`Could not rename ${name}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private async deleteResource(resource: URI, useTrash: boolean): Promise<void> {
		const name = resBasename(resource);
		const { confirmed } = await this.dialogService.confirm({
			message: useTrash ? `Move '${name}' to the Recycle Bin?` : `Delete '${name}' permanently?`,
			detail: useTrash ? 'You can restore it from the Recycle Bin.' : 'This can\'t be undone.',
			primaryButton: useTrash ? 'Move to Recycle Bin' : 'Delete'
		});
		if (!confirmed) {
			return;
		}
		try {
			await this.workingCopyFileService.delete([{ resource, useTrash, recursive: true }], CancellationToken.None);
		} catch (err) {
			this.notificationService.error(`Could not delete ${name}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private async pasteInto(folder: URI): Promise<void> {
		const clip = this.fileClipboard;
		if (!clip) {
			return;
		}
		try {
			for (const source of clip.uris) {
				if (folder.toString() === source.toString() || folder.path.startsWith(source.path + '/')) {
					continue; // a folder can't go inside itself
				}
				let target = joinPath(folder, resBasename(source));
				if (clip.cut && target.toString() === source.toString()) {
					continue;
				}
				target = await this.uniqueTarget(target);
				if (clip.cut) {
					await this.workingCopyFileService.move([{ file: { source, target } }], CancellationToken.None);
				} else {
					await this.workingCopyFileService.copy([{ file: { source, target } }], CancellationToken.None);
				}
				this.newEntries.add(target.toString());
			}
			if (clip.cut) {
				this.fileClipboard = undefined;
			}
			this.expandedFolders.add(folder.toString());
			this.treeRefresh.schedule();
		} catch (err) {
			this.notificationService.error(`Could not paste: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private async uniqueTarget(target: URI): Promise<URI> {
		if (!(await this.fileService.exists(target))) {
			return target;
		}
		const name = resBasename(target);
		const dot = name.lastIndexOf('.');
		const stem = dot > 0 ? name.slice(0, dot) : name;
		const ext = dot > 0 ? name.slice(dot) : '';
		for (let i = 1; i < 100; i++) {
			const candidate = joinPath(resDirname(target), `${stem} copy${i > 1 ? ` ${i}` : ''}${ext}`);
			if (!(await this.fileService.exists(candidate))) {
				return candidate;
			}
		}
		return target;
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
		append(this.runIcon, renderIcon(running ? Codicon.debugStop : Codicon.debugStart));
		this.runLabel.textContent = running ? 'Stop' : 'Run';
		this.runButton.title = running ? 'Stop (F5)' : 'Run (F5)';
		this.terminalButton.classList.toggle('has-dot', running);
		ipcRenderer.send('vscode:flide-running', running);
	}

	//#endregion
}
