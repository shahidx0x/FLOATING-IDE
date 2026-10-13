/*---------------------------------------------------------------------------------------------
 *  FLIDE — wires the single bar into the title bar, sets clean defaults and adds shortcuts.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { FlideBarHost } from '../../../browser/parts/titlebar/flideBarHost.js';
import { FlideBar, FLIDE_DEFAULT_RUN_COMMANDS } from './flideBar.js';

// 1) Replace the title bar with the FLIDE bar
FlideBarHost.factory = (instantiationService, container) => instantiationService.createInstance(FlideBar, container);

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

// 2) One bar, then code: hide everything VS Code shows by default
configurationRegistry.registerDefaultConfigurations([{
	overrides: {
		'window.controlsStyle': 'hidden',
		'window.commandCenter': false,
		'window.menuBarVisibility': 'hidden',
		'window.title': '${activeEditorShort} — FLIDE',
		'workbench.layoutControl.enabled': false,
		'workbench.activityBar.location': 'hidden',
		'workbench.statusBar.visible': false,
		'workbench.editor.showTabs': 'none',
		'workbench.startupEditor': 'none',
		'workbench.tips.enabled': false,
		'workbench.editor.empty.hint': 'hidden',
		'workbench.panel.defaultLocation': 'right',
		'workbench.secondarySideBar.defaultVisibility': 'hidden',
		'workbench.colorTheme': 'FLIDE Midnight',
		'chat.commandCenter.enabled': false,
		'breadcrumbs.enabled': false,
		'editor.minimap.enabled': false,
		'editor.fontFamily': '\'JetBrains Mono\', Consolas, \'Courier New\', monospace',
		'editor.fontSize': 13,
		'editor.lineHeight': 22,
		'editor.padding.top': 14,
		'editor.glyphMargin': false,
		'editor.overviewRulerBorder': false,
		'editor.hideCursorInOverviewRuler': true,
		'editor.stickyScroll.enabled': false,
		'editor.guides.indentation': false,
		'editor.lightbulb.enabled': 'off',
		'editor.scrollbar.verticalScrollbarSize': 8,
		'editor.scrollbar.horizontalScrollbarSize': 8,
		'terminal.integrated.tabs.enabled': false,
		'terminal.integrated.fontFamily': '\'JetBrains Mono\', Consolas, monospace',
		'terminal.integrated.fontSize': 12.5,
	}
}]);

// 3) FLIDE Run & Terminal settings
configurationRegistry.registerConfiguration({
	id: 'flide',
	title: 'FLIDE',
	type: 'object',
	properties: {
		'flide.run.commands': {
			type: 'object',
			default: FLIDE_DEFAULT_RUN_COMMANDS,
			additionalProperties: { type: 'string' },
			scope: ConfigurationScope.APPLICATION,
			markdownDescription: 'Run command per file type. `{file}` = the current file, `{dir}` = its folder, `{name}` = file name without extension.'
		},
		'flide.run.saveBeforeRun': { type: 'boolean', default: true, scope: ConfigurationScope.APPLICATION, description: 'Run always uses the latest version of the file.' },
		'flide.run.openTerminal': { type: 'boolean', default: true, scope: ConfigurationScope.APPLICATION, description: 'The terminal slides in when a script starts.' },
		'flide.terminal.width': { type: 'number', default: 88, minimum: 40, maximum: 100, scope: ConfigurationScope.APPLICATION, description: 'How much of the window the terminal covers, in percent.' },
		'flide.hotkeys.toggleBubble': { type: 'string', default: 'CommandOrControl+Shift+M', scope: ConfigurationScope.APPLICATION, description: 'System-wide hotkey to switch between Bubble and Window.' },
	}
});

// 4) Shortcuts from the design (win over VS Code's own Ctrl+B / F5)
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'flide.toggleMenu',
			title: localize2('flide.toggleMenu', 'FLIDE: Toggle Menu'),
			f1: true,
			keybinding: { primary: KeyMod.CtrlCmd | KeyCode.KeyB, weight: KeybindingWeight.ExternalExtension + 1 }
		});
	}
	run(): void { FlideBar.current?.toggleMenu(); }
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'flide.runOrStop',
			title: localize2('flide.runOrStop', 'FLIDE: Run / Stop'),
			f1: true,
			keybinding: { primary: KeyCode.F5, weight: KeybindingWeight.ExternalExtension + 1 }
		});
	}
	run(): void { FlideBar.current?.runOrStop(); }
});
