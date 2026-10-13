/*---------------------------------------------------------------------------------------------
 *  FLIDE — extensions: 🧩 dropdown (Installed / Browse Open VSX) and the Manage extensions view.
 *  Backed by VS Code's real extensions service: install, update, enable/disable, uninstall.
 *--------------------------------------------------------------------------------------------*/

import './media/flideExtensions.css';
import { $, addDisposableListener, append, clearNode, getWindow } from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ExtensionType } from '../../../../platform/extensions/common/extensions.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { EnablementState } from '../../../services/extensionManagement/common/extensionManagement.js';
import { ExtensionState, IExtension, IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';

type DropTab = 'installed' | 'browse';
type ManageFilter = 'all' | 'enabled' | 'disabled' | 'updates';

interface ExtensionSetting { key: string; title: string; description: string; type: string; defaultValue: unknown }

interface LooseProperty { type?: string | string[]; default?: unknown; description?: string; markdownDescription?: string; deprecationMessage?: string; markdownDeprecationMessage?: string }
interface LooseContributions {
	configuration?: { properties?: Record<string, LooseProperty> } | { properties?: Record<string, LooseProperty> }[];
	languages?: { id?: string; aliases?: string[] }[];
	grammars?: unknown[];
	debuggers?: { type?: string; label?: string }[];
	themes?: unknown[];
	iconThemes?: unknown[];
	snippets?: unknown[];
	commands?: unknown[] | unknown;
	keybindings?: unknown[] | unknown;
}

const TILE_COLORS = ['#2F4F7A', '#3B6E5A', '#5B4A86', '#8A3B3B', '#3E4E57', '#B5642A', '#6B4A3A', '#2E6B70'];
const SVG_NS = 'http://www.w3.org/2000/svg';

/** The 🧩 puzzle icon from the design (stroke SVG, follows the text color). */
export function puzzleIcon(): SVGElement {
	const svg = document.createElementNS(SVG_NS, 'svg');
	for (const [k, v] of [['width', '16'], ['height', '16'], ['viewBox', '0 0 16 16'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '1.5'], ['stroke-linejoin', 'round'], ['aria-hidden', 'true']]) {
		svg.setAttribute(k, v);
	}
	const path = document.createElementNS(SVG_NS, 'path');
	path.setAttribute('d', 'M2.5 5.5h3V4a1.5 1.5 0 0 1 3 0v1.5h3v3H13a1.5 1.5 0 0 1 0 3h-1.5v3h-9v-3H4a1.5 1.5 0 0 0 0-3H2.5z');
	svg.appendChild(path);
	return svg;
}

function isEnabled(e: IExtension): boolean {
	return e.enablementState === EnablementState.EnabledGlobally
		|| e.enablementState === EnablementState.EnabledWorkspace
		|| e.enablementState === EnablementState.EnabledByEnvironment;
}

function sameId(a: string | undefined, b: string | undefined): boolean {
	return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

function initialsOf(name: string): string {
	const words = name.replace(/[^A-Za-z0-9+ ]/g, ' ').trim().split(/\s+/).filter(Boolean);
	if (words.length >= 2) {
		return (words[0][0] + words[1][0]).toUpperCase();
	}
	return (words[0] ?? '?').slice(0, 2).replace(/^./, c => c.toUpperCase());
}

function colorFor(id: string): string {
	let h = 0;
	for (let i = 0; i < id.length; i++) {
		h = (h * 31 + id.charCodeAt(i)) | 0;
	}
	return TILE_COLORS[Math.abs(h) % TILE_COLORS.length];
}

function humanize(key: string): string {
	const last = key.split('.').pop() ?? key;
	const words = last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ').toLowerCase();
	return words.charAt(0).toUpperCase() + words.slice(1);
}

function joinList(items: string[]): string {
	const unique = [...new Set(items)].slice(0, 4);
	return unique.length <= 1 ? unique.join('') : `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`;
}

export class FlideExtensions extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	/** Fires when the update dot or the open/closed state changes. */
	readonly onDidChange = this._onDidChange.event;

	// Dropdown
	private drop: HTMLElement | undefined;
	private catcher: HTMLElement | undefined;
	private dropList: HTMLElement | undefined;
	private dropInput: HTMLInputElement | undefined;
	private dropTabs: HTMLElement | undefined;
	private readonly dropStore = this._register(new DisposableStore());
	private readonly dropListStore = this._register(new DisposableStore());
	private tab: DropTab = 'installed';
	private query = '';
	private results: IExtension[] = [];
	private searching = false;
	private searchedOnce = false;
	private searchCts: CancellationTokenSource | undefined;
	private readonly searchScheduler = this._register(new RunOnceScheduler(() => this.search(), 350));

	// Manage view
	private manage: HTMLElement | undefined;
	private manageBody: HTMLElement | undefined;
	private manageFilters: HTMLElement | undefined;
	private readonly manageStore = this._register(new DisposableStore());
	private readonly manageBodyStore = this._register(new DisposableStore());
	private filter: ManageFilter = 'all';
	private selected: string | undefined;

	private readonly busy = new Set<string>();
	private readonly refreshScheduler = this._register(new RunOnceScheduler(() => this.refresh(), 60));

	constructor(
		private readonly host: HTMLElement,
		@IExtensionsWorkbenchService private readonly extensionsService: IExtensionsWorkbenchService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICommandService private readonly commandService: ICommandService,
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this._register(this.extensionsService.onChange(() => this.refreshScheduler.schedule()));
		this.extensionsService.queryLocal().then(() => this.refreshScheduler.schedule(), () => undefined);
		this._register(toDisposable(() => {
			this.searchCts?.dispose(true);
			this.closeDropdown();
			this.closeManage();
		}));
	}

	get hasUpdates(): boolean {
		return this.installed().some(e => e.outdated);
	}

	get isDropdownOpen(): boolean {
		return !!this.drop;
	}

	get isManageOpen(): boolean {
		return !!this.manage;
	}

	private installed(): IExtension[] {
		return this.extensionsService.local
			.filter(e => e.type === ExtensionType.User && e.state !== ExtensionState.Uninstalled)
			.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));
	}

	private refresh(): void {
		this._onDidChange.fire();
		if (this.drop) {
			this.renderDropList();
		}
		if (this.manage) {
			this.renderManage();
		}
	}

	//#region Dropdown

	toggleDropdown(anchor: HTMLElement): void {
		if (this.drop) {
			this.closeDropdown();
		} else {
			this.openDropdown(anchor);
		}
	}

	private openDropdown(anchor: HTMLElement): void {
		const host = this.host;
		this.catcher = append(host, $('.flide-ext-catcher'));
		const drop = this.drop = append(host, $('.flide-ext-drop'));
		drop.setAttribute('role', 'dialog');
		drop.setAttribute('aria-label', 'Extensions');

		// Open right under the 🧩 icon, aligned to its right edge
		const hostRect = host.getBoundingClientRect();
		const a = anchor.getBoundingClientRect();
		drop.style.top = `${Math.round(a.bottom - hostRect.top + 6)}px`;
		drop.style.right = `${Math.max(8, Math.round(hostRect.right - a.right - 8))}px`;

		this.dropStore.add(addDisposableListener(this.catcher, 'mousedown', () => this.closeDropdown()));
		this.dropStore.add(addDisposableListener(getWindow(host).document, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				this.closeDropdown();
			}
		}));

		const head = append(drop, $('.flide-ext-head'));
		const titleRow = append(head, $('.flide-ext-titlerow'));
		append(titleRow, $('span.flide-ext-title')).textContent = 'Extensions';
		this.dropTabs = append(titleRow, $('.flide-seg'));

		const search = append(head, $('label.flide-ext-search'));
		append(search, renderIcon(Codicon.search));
		const input = this.dropInput = append(search, $('input')) as HTMLInputElement;
		input.type = 'text';
		input.value = this.query;
		input.setAttribute('aria-label', 'Search extensions');
		this.dropStore.add(addDisposableListener(input, 'input', () => {
			this.query = input.value;
			if (this.tab === 'browse') {
				this.searchScheduler.schedule();
			} else {
				this.renderDropList();
			}
		}));

		this.dropList = append(drop, $('.flide-ext-list'));

		const foot = append(drop, $('button.flide-ext-foot')) as HTMLButtonElement;
		foot.type = 'button';
		append(foot, renderIcon(Codicon.settingsGear));
		append(foot, $('span.flide-ext-foot-label')).textContent = 'Manage extensions';
		append(foot, renderIcon(Codicon.chevronRight));
		this.dropStore.add(addDisposableListener(foot, 'click', () => this.openManage()));

		this.renderDropList();
		input.focus();
		this._onDidChange.fire();
	}

	closeDropdown(): void {
		if (!this.drop) {
			return;
		}
		this.searchScheduler.cancel();
		this.dropStore.clear();
		this.dropListStore.clear();
		this.drop.remove();
		this.catcher?.remove();
		this.drop = this.catcher = this.dropList = this.dropInput = this.dropTabs = undefined;
		this._onDidChange.fire();
	}

	private renderDropList(): void {
		const list = this.dropList;
		if (!list || !this.dropTabs || !this.dropInput) {
			return;
		}
		const scroll = list.scrollTop;
		this.dropListStore.clear();
		clearNode(list);
		clearNode(this.dropTabs);

		const installed = this.installed();
		this.segment(this.dropTabs, [['installed', `Installed ${installed.length}`], ['browse', 'Browse']], this.tab, id => {
			this.tab = id as DropTab;
			if (this.tab === 'browse' && !this.searchedOnce) {
				this.search();
			}
			this.renderDropList();
			this.dropInput?.focus();
		}, this.dropListStore);
		this.dropInput.placeholder = this.tab === 'installed' ? 'Filter installed extensions' : 'Search Open VSX';

		if (this.tab === 'installed') {
			const q = this.query.trim().toLowerCase();
			const rows = installed.filter(e => !q || (e.displayName || e.name).toLowerCase().includes(q) || e.identifier.id.toLowerCase().includes(q));
			if (!rows.length) {
				this.empty(list, installed.length ? 'No installed extension matches.' : 'No extensions installed yet.\nOpen Browse to find some.');
			}
			for (const e of rows) {
				this.installedRow(list, e);
			}
		} else {
			if (this.searching && !this.results.length) {
				this.empty(list, 'Searching Open VSX…');
			} else if (!this.results.length) {
				this.empty(list, this.searchedOnce ? 'Nothing found on Open VSX.' : 'Type to search Open VSX.');
			}
			const installedIds = new Set(installed.map(e => e.identifier.id.toLowerCase()));
			for (const e of this.results) {
				this.browseRow(list, e, installedIds.has(e.identifier.id.toLowerCase()));
			}
		}
		list.scrollTop = scroll;
	}

	private installedRow(parent: HTMLElement, e: IExtension): void {
		const on = isEnabled(e);
		const name = e.displayName || e.name;
		const row = append(parent, $('.flide-ext-row'));
		row.classList.toggle('is-off', !on);
		this.tile(row, e, 32);

		const info = append(row, $('button.flide-ext-info')) as HTMLButtonElement;
		info.type = 'button';
		info.title = `${name} — open in Manage extensions`;
		append(info, $('span.flide-ext-name')).textContent = name;
		append(info, $('span.flide-ext-meta')).textContent = `${e.publisherDisplayName} · ${e.version}`;
		this.dropListStore.add(addDisposableListener(info, 'click', () => this.openManage(e.identifier.id)));

		if (e.outdated) {
			const busy = this.busy.has(e.identifier.id);
			const up = this.smallButton(row, busy ? 'Updating…' : 'Update', true, () => this.update(e), this.dropListStore, busy);
			up.title = `Update to ${e.latestVersion}`;
		}
		this.switchButton(row, on, `${on ? 'Disable' : 'Enable'} ${name}`, () => this.setEnabled(e, !on), this.dropListStore, this.busy.has(e.identifier.id));
	}

	private browseRow(parent: HTMLElement, e: IExtension, installed: boolean): void {
		const name = e.displayName || e.name;
		const row = append(parent, $('.flide-ext-row'));
		this.tile(row, e, 32);

		const info = append(row, $('div.flide-ext-info.is-static'));
		info.title = e.description || name;
		append(info, $('span.flide-ext-name')).textContent = name;
		append(info, $('span.flide-ext-meta')).textContent = `${e.publisherDisplayName} · ${e.version}`;

		const busy = this.busy.has(e.identifier.id) || e.state === ExtensionState.Installing;
		if (installed) {
			append(row, $('span.flide-ext-badge')).textContent = 'Installed';
		} else {
			this.smallButton(row, busy ? 'Installing…' : 'Install', true, () => this.install(e), this.dropListStore, busy);
		}
	}

	private async search(): Promise<void> {
		this.searchCts?.dispose(true);
		const cts = this.searchCts = new CancellationTokenSource();
		this.searching = true;
		this.searchedOnce = true;
		this.renderDropList();
		try {
			const text = this.query.trim();
			const pager = await this.extensionsService.queryGallery(text ? { text, pageSize: 20 } : { pageSize: 20 }, cts.token);
			if (!cts.token.isCancellationRequested) {
				this.results = pager.firstPage;
			}
		} catch (err) {
			if (!cts.token.isCancellationRequested) {
				this.results = [];
				this.notificationService.warn(`Open VSX search failed: ${err instanceof Error ? err.message : String(err)}`);
			}
		} finally {
			if (this.searchCts === cts) {
				this.searching = false;
				this.renderDropList();
			}
		}
	}

	//#endregion

	//#region Manage view

	toggleManage(): void {
		if (this.manage) {
			this.closeManage();
		} else {
			this.openManage();
		}
	}

	openManage(selectId?: string): void {
		this.closeDropdown();
		if (selectId) {
			this.selected = selectId;
			this.filter = 'all';
		}
		if (!this.manage) {
			const m = this.manage = append(this.host, $('.flide-ext-manage'));
			m.setAttribute('role', 'dialog');
			m.setAttribute('aria-label', 'Manage extensions');

			const head = append(m, $('.flide-ext-mhead'));
			const back = append(head, $('button.flide-icon-btn')) as HTMLButtonElement;
			back.type = 'button';
			back.title = 'Back to the editor (Esc)';
			back.setAttribute('aria-label', 'Back to the editor');
			append(back, renderIcon(Codicon.chevronLeft));
			this.manageStore.add(addDisposableListener(back, 'click', () => this.closeManage()));
			append(head, $('span.flide-ext-mtitle')).textContent = 'Manage extensions';
			this.manageFilters = append(head, $('.flide-seg'));
			this.manageBody = append(m, $('.flide-ext-mbody'));

			this.manageStore.add(addDisposableListener(getWindow(this.host).document, 'keydown', (e: KeyboardEvent) => {
				if (e.key === 'Escape' && !this.drop) {
					this.closeManage();
				}
			}));
			this._onDidChange.fire();
		}
		this.renderManage();
	}

	closeManage(): void {
		if (!this.manage) {
			return;
		}
		this.manageStore.clear();
		this.manageBodyStore.clear();
		this.manage.remove();
		this.manage = this.manageBody = this.manageFilters = undefined;
		this._onDidChange.fire();
	}

	private renderManage(): void {
		const body = this.manageBody;
		const filters = this.manageFilters;
		if (!body || !filters) {
			return;
		}
		const listScroll = body.querySelector('.flide-ext-mlist')?.scrollTop ?? 0;
		const detailScroll = body.querySelector('.flide-ext-detail')?.scrollTop ?? 0;
		this.manageBodyStore.clear();
		clearNode(body);
		clearNode(filters);

		const all = this.installed();
		const updates = all.filter(e => e.outdated).length;
		this.segment(filters, [
			['all', `All ${all.length}`],
			['enabled', 'Enabled'],
			['disabled', 'Disabled'],
			['updates', updates ? `Updates ${updates}` : 'Updates'],
		], this.filter, id => { this.filter = id as ManageFilter; this.renderManage(); }, this.manageBodyStore);

		const shown = all.filter(e =>
			this.filter === 'all'
			|| (this.filter === 'enabled' && isEnabled(e))
			|| (this.filter === 'disabled' && !isEnabled(e))
			|| (this.filter === 'updates' && e.outdated));

		const list = append(body, $('.flide-ext-mlist'));
		if (!shown.length) {
			this.empty(list, this.filter === 'all' ? 'No extensions installed yet.' : 'Nothing here.');
		}
		const current = shown.find(e => sameId(e.identifier.id, this.selected)) ?? shown[0];
		for (const e of shown) {
			const row = append(list, $('button.flide-ext-mrow')) as HTMLButtonElement;
			row.type = 'button';
			row.classList.toggle('is-selected', e === current);
			if (e === current) {
				row.setAttribute('aria-current', 'true');
			}
			this.tile(row, e, 32);
			const text = append(row, $('.flide-ext-mrow-text'));
			append(text, $('span.flide-ext-name')).textContent = e.displayName || e.name;
			const status = append(text, $('span.flide-ext-status'));
			if (this.busy.has(e.identifier.id)) {
				status.textContent = 'Working…';
			} else if (e.outdated) {
				status.textContent = 'Update available';
				status.classList.add('is-update');
			} else if (isEnabled(e)) {
				status.textContent = 'Enabled';
				status.classList.add('is-on');
			} else {
				status.textContent = 'Disabled';
			}
			this.manageBodyStore.add(addDisposableListener(row, 'click', () => {
				this.selected = e.identifier.id;
				this.renderManage();
			}));
		}
		list.scrollTop = listScroll;

		const detail = append(body, $('.flide-ext-detail'));
		if (current) {
			this.selected = current.identifier.id;
			this.renderDetail(detail, current);
		} else {
			this.empty(detail, 'Install extensions from the 🧩 menu › Browse.');
		}
		detail.scrollTop = detailScroll;
	}

	private renderDetail(detail: HTMLElement, e: IExtension): void {
		const name = e.displayName || e.name;
		const busy = this.busy.has(e.identifier.id);
		const on = isEnabled(e);

		const top = append(detail, $('.flide-ext-dtop'));
		this.tile(top, e, 56);
		const title = append(top, $('.flide-ext-dtitle'));
		append(title, $('h2')).textContent = name;
		append(title, $('span.flide-ext-meta')).textContent =
			`${e.publisherDisplayName} · v${e.version}${e.outdated ? `  →  v${e.latestVersion}` : ''}${on ? '' : '  ·  disabled'}`;

		if (e.description) {
			append(detail, $('p.flide-ext-desc')).textContent = e.description;
		}

		const actions = append(detail, $('.flide-ext-actions'));
		if (e.outdated) {
			this.bigButton(actions, busy ? 'Working…' : `Update to ${e.latestVersion}`, 'primary', () => this.update(e), busy);
		}
		this.bigButton(actions, on ? 'Disable' : 'Enable', 'secondary', () => this.setEnabled(e, !on), busy);
		this.bigButton(actions, 'Uninstall', 'danger', () => this.uninstall(e), busy);

		// Settings
		append(detail, $('.flide-section')).textContent = 'Settings';
		const settings = this.extensionSettings(e);
		if (!settings.length) {
			append(detail, $('p.flide-ext-adds')).textContent = 'This extension has no settings.';
		}
		for (const s of settings.slice(0, 8)) {
			const row = append(detail, $('.flide-ext-setting'));
			const text = append(row, $('.flide-ext-setting-text'));
			append(text, $('span.flide-ext-setting-name')).textContent = s.title;
			if (s.description) {
				const desc = append(text, $('span.flide-ext-setting-desc'));
				desc.textContent = s.description;
				desc.title = s.description;
			}
			if (s.type === 'boolean') {
				const value = !!(this.configurationService.getValue<boolean>(s.key) ?? s.defaultValue);
				this.switchButton(row, value, s.title, () => {
					this.configurationService.updateValue(s.key, !value).then(() => this.renderManage());
				}, this.manageBodyStore);
			} else {
				this.smallButton(row, 'Edit', false, () => this.commandService.executeCommand('workbench.action.openSettings', s.key), this.manageBodyStore);
			}
		}
		if (settings.length > 8) {
			const more = append(detail, $('button.flide-ext-link')) as HTMLButtonElement;
			more.type = 'button';
			more.textContent = `All ${settings.length} settings ›`;
			this.manageBodyStore.add(addDisposableListener(more, 'click', () => this.commandService.executeCommand('workbench.action.openSettings', `@ext:${e.identifier.id}`)));
		}

		// What it adds to FLIDE
		append(detail, $('.flide-section')).textContent = 'Adds to FLIDE';
		append(detail, $('p.flide-ext-adds')).textContent = this.describeContributions(e);
	}

	private extensionSettings(e: IExtension): ExtensionSetting[] {
		const contributes = e.local?.manifest.contributes as unknown as LooseContributions | undefined;
		const conf = contributes?.configuration;
		const nodes = Array.isArray(conf) ? conf : conf ? [conf] : [];
		const result: ExtensionSetting[] = [];
		for (const node of nodes) {
			for (const [key, p] of Object.entries(node.properties ?? {})) {
				if (!p || p.deprecationMessage || p.markdownDeprecationMessage) {
					continue;
				}
				const description = (p.description ?? p.markdownDescription ?? '').replace(/[`*_#\[\]]/g, '').split('\n')[0].trim();
				const type = Array.isArray(p.type) ? (p.type[0] ?? 'string') : (p.type ?? 'string');
				result.push({ key, title: humanize(key), description, type, defaultValue: p.default });
			}
		}
		return result;
	}

	private describeContributions(e: IExtension): string {
		const c = e.local?.manifest.contributes as unknown as LooseContributions | undefined;
		const parts: string[] = [];
		const count = (v: unknown) => Array.isArray(v) ? v.length : v ? 1 : 0;
		const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
		if (c) {
			const languages = (c.languages ?? []).map(l => l.aliases?.[0] ?? l.id ?? '').filter(Boolean);
			if (languages.length) {
				parts.push(`language support for ${joinList(languages)}`);
			} else if (count(c.grammars)) {
				parts.push('syntax highlighting');
			}
			if (count(c.debuggers)) {
				parts.push(`a debugger (${joinList((c.debuggers ?? []).map(d => d.label ?? d.type ?? 'debug'))})`);
			}
			if (count(c.themes)) {
				parts.push(plural(count(c.themes), 'color theme'));
			}
			if (count(c.iconThemes)) {
				parts.push(plural(count(c.iconThemes), 'file icon theme'));
			}
			if (count(c.snippets)) {
				parts.push('code snippets');
			}
			if (count(c.commands)) {
				parts.push(plural(count(c.commands), 'command'));
			}
			if (count(c.keybindings)) {
				parts.push(plural(count(c.keybindings), 'shortcut'));
			}
		}
		if (!parts.length) {
			return 'Nothing visible: it works in the background.';
		}
		const text = parts.join(', ');
		return text.charAt(0).toUpperCase() + text.slice(1) + '.';
	}

	//#endregion

	//#region Actions

	private async run(e: IExtension, label: string, work: () => Promise<unknown>): Promise<void> {
		const id = e.identifier.id;
		if (this.busy.has(id)) {
			return;
		}
		this.busy.add(id);
		this.refresh();
		try {
			await work();
		} catch (err) {
			this.notificationService.error(`${label} ${e.displayName || e.name} failed: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			this.busy.delete(id);
			this.refresh();
		}
	}

	private install(e: IExtension): Promise<void> {
		return this.run(e, 'Installing', () => this.extensionsService.install(e));
	}

	private update(e: IExtension): Promise<void> {
		return this.run(e, 'Updating', () => this.extensionsService.install(e));
	}

	private setEnabled(e: IExtension, enable: boolean): Promise<void> {
		return this.run(e, enable ? 'Enabling' : 'Disabling',
			() => this.extensionsService.setEnablement(e, enable ? EnablementState.EnabledGlobally : EnablementState.DisabledGlobally));
	}

	private async uninstall(e: IExtension): Promise<void> {
		const { confirmed } = await this.dialogService.confirm({
			message: `Uninstall ${e.displayName || e.name}?`,
			detail: 'You can install it again any time from the 🧩 menu › Browse.',
			primaryButton: 'Uninstall'
		});
		if (!confirmed) {
			return;
		}
		if (sameId(this.selected, e.identifier.id)) {
			this.selected = undefined;
		}
		await this.run(e, 'Uninstalling', () => this.extensionsService.uninstall(e));
	}

	//#endregion

	//#region Small building blocks

	private tile(parent: HTMLElement, e: IExtension, size: number): void {
		const box = append(parent, $('span.flide-ext-tile'));
		box.style.width = box.style.height = `${size}px`;
		box.style.borderRadius = `${Math.round(size / 4)}px`;
		const showInitials = () => {
			clearNode(box);
			box.textContent = initialsOf(e.displayName || e.name);
			box.style.background = colorFor(e.identifier.id);
			box.style.fontSize = `${Math.round(size * 0.36)}px`;
		};
		if (e.iconUrl) {
			const img = append(box, $('img')) as HTMLImageElement;
			img.alt = '';
			img.src = e.iconUrl;
			img.onerror = showInitials;
		} else {
			showInitials();
		}
	}

	private segment(parent: HTMLElement, items: [string, string][], current: string, pick: (id: string) => void, store: DisposableStore): void {
		for (const [id, label] of items) {
			const b = append(parent, $('button')) as HTMLButtonElement;
			b.type = 'button';
			b.textContent = label;
			b.classList.toggle('is-on', id === current);
			b.setAttribute('aria-pressed', String(id === current));
			store.add(addDisposableListener(b, 'click', ev => { ev.stopPropagation(); pick(id); }));
		}
	}

	private smallButton(parent: HTMLElement, label: string, accent: boolean, onClick: () => void, store: DisposableStore, disabled = false): HTMLButtonElement {
		const b = append(parent, $('button.flide-ext-btn')) as HTMLButtonElement;
		b.type = 'button';
		b.textContent = label;
		b.disabled = disabled;
		b.classList.toggle('is-accent', accent);
		store.add(addDisposableListener(b, 'click', ev => { ev.stopPropagation(); onClick(); }));
		return b;
	}

	private bigButton(parent: HTMLElement, label: string, kind: 'primary' | 'secondary' | 'danger', onClick: () => void, disabled = false): void {
		const b = append(parent, $(`button.flide-ext-bigbtn.${kind}`)) as HTMLButtonElement;
		b.type = 'button';
		b.textContent = label;
		b.disabled = disabled;
		this.manageBodyStore.add(addDisposableListener(b, 'click', () => onClick()));
	}

	private switchButton(parent: HTMLElement, on: boolean, label: string, onClick: () => void, store: DisposableStore, disabled = false): void {
		const b = append(parent, $('button.flide-switch')) as HTMLButtonElement;
		b.type = 'button';
		b.disabled = disabled;
		b.setAttribute('role', 'switch');
		b.setAttribute('aria-checked', String(on));
		b.setAttribute('aria-label', label);
		b.title = label;
		b.classList.toggle('is-on', on);
		append(b, $('span.flide-switch-knob'));
		store.add(addDisposableListener(b, 'click', ev => { ev.stopPropagation(); onClick(); }));
	}

	private empty(parent: HTMLElement, text: string): void {
		append(parent, $('.flide-ext-empty')).textContent = text;
	}

	//#endregion
}
