/*---------------------------------------------------------------------------------------------
 *  FLIDE — hook that lets the FLIDE contribution replace the title bar with its single bar.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

export type FlideBarFactory = (instantiationService: IInstantiationService, container: HTMLElement) => IDisposable;

export const FLIDE_BAR_HEIGHT = 46;

export const FlideBarHost: { factory: FlideBarFactory | undefined } = { factory: undefined };
