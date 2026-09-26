// Copyright (C) 2024 The Qt Company Ltd.
// SPDX-License-Identifier: LicenseRef-Qt-Commercial OR LGPL-3.0-only

import * as vscode from 'vscode';

import {
  createCppProject,
  CppProjectManager,
  CppProject,
  CppProjectType
} from '@/project';
import { KitManager, tryToUseCMakeFromQtTools } from '@/kit-manager';
import { wasmStartTaskProvider, WASMStartTaskProvider } from '@task/wasm-start';
import { xmakeTaskProvider, XmakeTaskProvider } from '@task/xmake';
import { EXTENSION_ID } from '@/constants';

export let kitManager: KitManager;
export let projectManager: CppProjectManager;
export let coreAPI: CoreAPI | undefined;

const taskProviders: vscode.Disposable[] = [];

const logger = createLogger('extension');

export async function activate(context: vscode.ExtensionContext) {
  await vscode.extensions.getExtension('ms-vscode.cmake-tools')?.activate();

  initLogger(EXTENSION_ID);
  telemetry.activate(context);
  kitManager = new KitManager(context);
  projectManager = new CppProjectManager(context);
  coreAPI = await getCoreApi();

  if (vscode.workspace.workspaceFolders !== undefined) {
    for (const folder of vscode.workspace.workspaceFolders) {
      const project = await createCppProject(folder, context);
      projectManager.addProject(project);
      kitManager.addProject(project);
    }
  }

  context.subscriptions.push(
    qpaPlatformPluginPathCommand(),
    qmlImportPathCommand(),
    registerKitDirectoryCommand(),
    qtDirCommand(),
    registerMinGWgdbCommand(),
    registerResetCommand(),
    ...registerNatvisCommand(),
    registerScanForQtKitsCommand(),
    registerlaunchTargetFilenameWithoutExtension(),
    registerbuildDirectoryName(),
    registerSourceDirectoryCommand()
  );
  telemetry.sendEvent(`activated`);

  taskProviders.push(
    vscode.tasks.registerTaskProvider(
      WASMStartTaskProvider.WASMStartType,
      wasmStartTaskProvider
    ),
    vscode.tasks.registerTaskProvider(XmakeTaskProvider.Type, xmakeTaskProvider)
  );
  context.subscriptions.push(...taskProviders);

  coreAPI?.onValueChanged(async (message) => {
    logger.info('Received config change:', message.config as unknown as string);
    return processMessage(message);
  });
  void tryToUseCMakeFromQtTools();

  checkCMakeToolsVersion();

  if (isAnyOfProjectsUsingKits()) {
    await kitManager.checkForAllQtInstallations();
  }

  // Do not block activation on this. For kit-based projects it resolves the
  // active kit through the `cmake.buildKit` substitution command, which since
  // CMake Tools 1.24.42 prompts the user to select a kit when none is active
  // and only resolves once that picker is answered. Consumers receive the
  // values through `coreAPI.notify` whenever they become available.
  void initConfigValues()
    .then(() => {
      logger.info('Config values initialized');
    })
    .catch((error: unknown) => {
      logger.error('Failed to initialize config values:', String(error));
    });
}

export function deactivate() {
  logger.info(`Deactivating ${EXTENSION_ID}`);
  telemetry.dispose();
  projectManager.dispose();
  for (const taskProvider of taskProviders) {
    taskProvider.dispose();
  }
}
