// Copyright (C) 2024 The Qt Company Ltd.
// SPDX-License-Identifier: LicenseRef-Qt-Commercial OR LGPL-3.0-only

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const XMAKE_VSCODE_EXTENSION_ID = 'xmake.io.xmake-vscode';

export interface XmakeTaskDefinition extends vscode.TaskDefinition {
  task: 'build' | 'clean' | 'run';
  xmakePath?: string;
  projectDir?: string;
  args?: string[];
}

function getConfiguredXmakePath(): string {
  const configured = vscode.workspace
    .getConfiguration('qt-cpp')
    .get<string>('xmakePath', '')
    .trim();
  return configured || 'xmake';
}

function getPreferredXmakePath(): string {
  const configured = getConfiguredXmakePath();
  if (configured && configured !== 'xmake') {
    return configured;
  }

  const extension = vscode.extensions.getExtension(XMAKE_VSCODE_EXTENSION_ID);
  if (extension) {
    void extension.activate();
  }
  return configured;
}

function resolveTaskArgs(taskName: XmakeTaskDefinition['task'], definition: XmakeTaskDefinition): string[] {
  if (definition.args && definition.args.length > 0) {
    return [...definition.args];
  }

  switch (taskName) {
    case 'build':
      return ['build'];
    case 'clean':
      return ['clean'];
    case 'run':
      return ['run'];
    default:
      return ['build'];
  }
}

function getTaskLabel(taskName: XmakeTaskDefinition['task']): string {
  switch (taskName) {
    case 'build':
      return 'xmake build';
    case 'clean':
      return 'xmake clean';
    case 'run':
      return 'xmake run';
    default:
      return 'xmake build';
  }
}

export class XmakeTaskProvider implements vscode.TaskProvider {
  static readonly Type = 'QtXMake';

  private static createTask(
    definition: XmakeTaskDefinition,
    folder?: vscode.WorkspaceFolder
  ): vscode.Task {
    const cwd = definition.projectDir
      ? definition.projectDir
      : folder?.uri.fsPath ??
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
        process.cwd();
    const command = definition.xmakePath?.trim() || getPreferredXmakePath();
    const args = resolveTaskArgs(definition.task, definition);

    return new vscode.Task(
      definition,
      folder ?? vscode.TaskScope.Workspace,
      getTaskLabel(definition.task),
      'Qt',
      new vscode.ShellExecution(command, args, {
        cwd,
        env: process.env
      })
    );
  }

  public provideTasks(): vscode.Task[] {
    const tasks: vscode.Task[] = [];
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
      const xmakeFile = path.join(folder.uri.fsPath, 'xmake.lua');
      if (!fs.existsSync(xmakeFile)) {
        continue;
      }

      for (const taskName of ['build', 'clean', 'run'] as const) {
        const definition: XmakeTaskDefinition = {
          type: XmakeTaskProvider.Type,
          task: taskName,
          projectDir: folder.uri.fsPath
        };
        tasks.push(XmakeTaskProvider.createTask(definition, folder));
      }
    }
    return tasks;
  }

  public resolveTask(task: vscode.Task): vscode.Task | undefined {
    const definition = task.definition as XmakeTaskDefinition | undefined;
    if (!definition || definition.type !== XmakeTaskProvider.Type) {
      return undefined;
    }

    const folder =
      task.scope && typeof task.scope !== 'string' ? task.scope : undefined;
    return XmakeTaskProvider.createTask(definition, folder);
  }
}

export const xmakeTaskProvider = new XmakeTaskProvider();
